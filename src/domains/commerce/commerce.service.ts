import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../infrastructure/prisma/generated/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { TenantScopeService } from '../../common/auth/tenant-scope.service';
import { DomainError, notFound, validationFailed } from '../../common/errors/domain.error';
import { toAmount, toMoneyView } from '../../common/money/money';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { MODULE_CODES, type ModuleCode } from '../entitlements/module-codes';
import { notifyUser } from './notify';
import type {
  CashMovementDto,
  CreateCreditDto,
  CreateDebtDto,
  CreateEventDto,
  CreateExpenseDto,
  CreatePaymentIntentDto,
  CreatePromotionDto,
  CreateReservationDto,
  CreateReviewDto,
  DeliveryStatusDto,
  InventoryItemDto,
  OpenCashDto,
  ReviewResponseDto,
  StockMoveDto,
  SupportTicketDto,
} from './commerce.dto';

const SANDBOX_SECRET = process.env.PAYMENTS_SANDBOX_SECRET ?? 'onmangeou-local-sandbox';

function sqlAmount(value: unknown, label: string): bigint {
  if (value === null || value === undefined) {
    return 0n;
  }
  if (typeof value === 'object') {
    const stringify = (value as { toString?: unknown }).toString;
    const text = typeof stringify === 'function' ? String(stringify.call(value)) : '0';
    return /^-?\d+$/.test(text) ? toAmount(text, label) : 0n;
  }
  return toAmount(value, label);
}

@Injectable()
export class CommerceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantScopeService,
    private readonly entitlements: EntitlementsService,
  ) {}

  private async isEstablishmentModuleEnabled(establishmentId: string, code: ModuleCode): Promise<boolean> {
    const establishment = await this.prisma.establishment.findFirst({
      where: { id: establishmentId, deletedAt: null },
      select: { organizationId: true },
    });
    if (!establishment) {
      return false;
    }
    return this.entitlements.isModuleEnabled(establishment.organizationId, code, establishmentId);
  }

  private async requireModules(
    actor: AuthenticatedActor,
    codes: readonly [ModuleCode, ...ModuleCode[]],
    establishmentId?: string,
  ): Promise<void> {
    const organizationId = this.tenant.requireOrganization(actor);
    for (const code of codes) {
      if (await this.entitlements.isModuleEnabled(organizationId, code, establishmentId)) {
        return;
      }
    }
    await this.entitlements.assertModuleEnabled(organizationId, codes[0], establishmentId);
  }

  async quote(establishmentId: string, items: Array<{ productId: string; quantity: number }>) {
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: items.map((item) => item.productId) },
        establishmentId,
        deletedAt: null,
        status: 'PUBLISHED',
      },
    });
    if (products.length !== items.length) {
      throw validationFailed([
        { field: 'items', code: 'invalid', message: 'Un plat est invalide pour ce devis' },
      ]);
    }
    const lines = items.map((item) => {
      const product = products.find((entry) => entry.id === item.productId);
      if (!product) {
        throw validationFailed([{ field: 'items', code: 'invalid', message: 'Plat introuvable' }]);
      }
      const lineAmount = product.basePriceAmount * BigInt(item.quantity);
      return {
        productId: product.id,
        name: product.name,
        quantity: item.quantity,
        unitPrice: toMoneyView(product.basePriceAmount),
        linePrice: toMoneyView(lineAmount),
      };
    });
    const total = lines.reduce((sum, line) => sum + BigInt(line.linePrice.amount), 0n);
    return { lines, total: toMoneyView(total), currency: 'XOF' };
  }

  async putCart(
    actor: AuthenticatedActor,
    establishmentId: string,
    items: Array<{ productId: string; quantity: number }>,
  ) {
    const establishment = await this.prisma.establishment.findFirst({
      where: { id: establishmentId, deletedAt: null, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!establishment) {
      throw notFound('Etablissement', establishmentId);
    }
    const existing = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM carts WHERE user_id = ${actor.userId}::uuid LIMIT 1
    `;
    const cartId = existing[0]?.id ?? randomUUID();
    if (!existing[0]) {
      await this.prisma.$executeRaw`
        INSERT INTO carts (id, user_id, establishment_id, updated_at, created_at)
        VALUES (${cartId}::uuid, ${actor.userId}::uuid, ${establishmentId}::uuid, NOW(), NOW())
      `;
    } else {
      await this.prisma.$executeRaw`
        UPDATE carts SET establishment_id = ${establishmentId}::uuid, updated_at = NOW()
        WHERE id = ${cartId}::uuid
      `;
      await this.prisma.$executeRaw`DELETE FROM cart_items WHERE cart_id = ${cartId}::uuid`;
    }
    for (const item of items) {
      await this.prisma.$executeRaw`
        INSERT INTO cart_items (id, cart_id, product_id, quantity, created_at)
        VALUES (${randomUUID()}::uuid, ${cartId}::uuid, ${item.productId}::uuid, ${item.quantity}, NOW())
      `;
    }
    return this.getCart(actor);
  }

  async getCart(actor: AuthenticatedActor) {
    const carts = await this.prisma.$queryRaw<Array<{ id: string; establishment_id: string }>>`
      SELECT id, establishment_id FROM carts WHERE user_id = ${actor.userId}::uuid LIMIT 1
    `;
    if (!carts[0]) {
      return { establishmentId: null, items: [] };
    }
    const items = await this.prisma.$queryRaw<
      Array<{ product_id: string; quantity: number; name: string; unit: unknown }>
    >`
      SELECT i.product_id, i.quantity, p.name, p.base_price_amount AS unit
      FROM cart_items i
      JOIN products p ON p.id = i.product_id
      WHERE i.cart_id = ${carts[0].id}::uuid
    `;
    return {
      establishmentId: carts[0].establishment_id,
      items: items.map((item) => ({
        productId: item.product_id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: toMoneyView(toAmount(item.unit, 'prix')),
      })),
    };
  }

  async createPaymentIntent(actor: AuthenticatedActor, dto: CreatePaymentIntentDto) {
    const orders = await this.prisma.$queryRaw<
      Array<{
        id: string;
        customer_user_id: string;
        status: string;
        total_amount: unknown;
        organization_id: string;
        establishment_id: string;
      }>
    >`
      SELECT id, customer_user_id, status, total_amount, organization_id, establishment_id
      FROM orders WHERE id = ${dto.orderId}::uuid LIMIT 1
    `;
    const order = orders[0];
    if (!order || order.customer_user_id !== actor.userId) {
      throw notFound('Commande', dto.orderId);
    }
    await this.entitlements.assertModuleEnabled(
      order.organization_id,
      MODULE_CODES.PAYMENTS_ONLINE,
      order.establishment_id,
    );
    if (order.status !== 'PENDING_PAYMENT') {
      throw new DomainError('CONFLICT', `Paiement impossible depuis ${order.status}`, {
        publicDetail: 'Cette commande n’attend plus de paiement.',
      });
    }
    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO payment_intents (id, order_id, user_id, provider, status, amount, provider_ref, created_at, updated_at)
      VALUES (
        ${id}::uuid, ${dto.orderId}::uuid, ${actor.userId}::uuid, ${dto.provider}, 'REQUIRES_ACTION',
        ${toAmount(order.total_amount, 'paiement')}, ${`sandbox-${id.slice(0, 8)}`}, NOW(), NOW()
      )
    `;
    return {
      id,
      status: 'REQUIRES_ACTION',
      provider: dto.provider,
      sandbox: true,
      confirmPath: `/payments/intents/${id}/confirm`,
    };
  }

  async confirmSandboxIntent(actor: AuthenticatedActor, intentId: string) {
    return this.succeedIntent(intentId, actor.userId);
  }

  async sandboxWebhook(intentId: string, secret: string) {
    if (secret !== SANDBOX_SECRET) {
      throw new DomainError('FORBIDDEN', 'Signature sandbox invalide');
    }
    return this.succeedIntent(intentId);
  }

  private async succeedIntent(intentId: string, userId?: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; order_id: string; user_id: string; status: string }>
    >`
      SELECT id, order_id, user_id, status FROM payment_intents WHERE id = ${intentId}::uuid LIMIT 1
    `;
    const intent = rows[0];
    if (!intent || (userId && intent.user_id !== userId)) {
      throw notFound('Paiement', intentId);
    }
    if (intent.status === 'SUCCEEDED') {
      return { id: intent.id, status: 'SUCCEEDED', replayed: true };
    }
    await this.prisma.$executeRaw`
      UPDATE payment_intents SET status = 'SUCCEEDED', updated_at = NOW() WHERE id = ${intentId}::uuid
    `;
    await this.prisma.$executeRaw`
      UPDATE orders SET status = 'PENDING_RESTAURANT'::"OrderStatus", paid_at = NOW(), updated_at = NOW()
      WHERE id = ${intent.order_id}::uuid AND status = 'PENDING_PAYMENT'::"OrderStatus"
    `;
    const owners = await this.prisma.$queryRaw<Array<{ user_id: string }>>`
      SELECT om.user_id
      FROM orders o
      JOIN organization_members om ON om.organization_id = o.organization_id
      WHERE o.id = ${intent.order_id}::uuid
    `;
    for (const owner of owners) {
      await notifyUser(
        this.prisma,
        owner.user_id,
        'ORDER',
        'Nouvelle commande payée',
        'Un ticket attend en cuisine.',
      );
    }
    return { id: intent.id, status: 'SUCCEEDED', replayed: false };
  }

  async listNotifications(actor: AuthenticatedActor) {
    return this.prisma.$queryRaw<
      Array<{ id: string; title: string; body: string; kind: string; read_at: Date | null; created_at: Date }>
    >`
      SELECT id, title, body, kind, read_at, created_at
      FROM notifications
      WHERE user_id = ${actor.userId}::uuid
      ORDER BY created_at DESC
      LIMIT 50
    `;
  }

  async markNotificationsRead(actor: AuthenticatedActor) {
    await this.prisma.$executeRaw`
      UPDATE notifications SET read_at = NOW()
      WHERE user_id = ${actor.userId}::uuid AND read_at IS NULL
    `;
    return { applied: true };
  }

  async follow(actor: AuthenticatedActor, establishmentId: string, on: boolean) {
    if (on) {
      await this.prisma.follow.upsert({
        where: { userId_establishmentId: { userId: actor.userId, establishmentId } },
        create: { userId: actor.userId, establishmentId },
        update: {},
      });
    } else {
      await this.prisma.follow.deleteMany({ where: { userId: actor.userId, establishmentId } });
    }
    return { following: on };
  }

  async createReservation(actor: AuthenticatedActor, dto: CreateReservationDto) {
    const establishment = await this.prisma.establishment.findFirst({
      where: { id: dto.establishmentId, deletedAt: null, status: 'PUBLISHED' },
      select: { id: true, organizationId: true, name: true },
    });
    if (!establishment) {
      throw notFound('Etablissement', dto.establishmentId);
    }
    await this.entitlements.assertModuleEnabled(
      establishment.organizationId,
      MODULE_CODES.RESERVATIONS_TABLES,
      establishment.id,
    );
    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now() - 60_000) {
      throw validationFailed([
        { field: 'startsAt', code: 'invalid', message: 'La date de réservation est passée' },
      ]);
    }
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { fullName: true, phoneE164: true },
    });
    const id = randomUUID();
    const publicRef = `RSV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    await this.prisma.$executeRaw`
      INSERT INTO reservations (
        id, public_ref, organization_id, establishment_id, user_id, status, party_size,
        starts_at, customer_name, customer_phone, notes, created_at, updated_at
      ) VALUES (
        ${id}::uuid, ${publicRef}, ${establishment.organizationId}::uuid, ${establishment.id}::uuid,
        ${actor.userId}::uuid, 'REQUESTED', ${dto.partySize}, ${startsAt},
        ${dto.customerName?.trim() || user?.fullName || 'Client'}, ${user?.phoneE164 ?? ''},
        ${dto.notes?.trim() || null}, NOW(), NOW()
      )
    `;
    return this.getReservation(id);
  }

  async listMyReservations(actor: AuthenticatedActor) {
    return this.prisma.$queryRaw`
      SELECT r.id, r.public_ref, r.status, r.party_size, r.starts_at, r.notes,
             e.name AS establishment_name, e.slug AS establishment_slug
      FROM reservations r
      JOIN establishments e ON e.id = r.establishment_id
      WHERE r.user_id = ${actor.userId}::uuid
      ORDER BY r.starts_at DESC
      LIMIT 40
    `;
  }

  async cancelReservation(actor: AuthenticatedActor, reservationId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM reservations WHERE id = ${reservationId}::uuid AND user_id = ${actor.userId}::uuid
    `;
    if (!rows[0]) {
      throw notFound('Reservation', reservationId);
    }
    if (!['REQUESTED', 'CONFIRMED'].includes(rows[0].status)) {
      throw new DomainError('CONFLICT', 'Reservation non annulable', {
        publicDetail: 'Cette réservation ne peut plus être annulée.',
      });
    }
    await this.prisma.$executeRaw`
      UPDATE reservations SET status = 'CANCELLED', updated_at = NOW() WHERE id = ${reservationId}::uuid
    `;
    return this.getReservation(reservationId);
  }

  async listMerchantReservations(actor: AuthenticatedActor, establishmentId?: string) {
    await this.requireModules(actor, [MODULE_CODES.RESERVATIONS_TABLES], establishmentId);
    const organizationId = this.tenant.requireOrganization(actor);
    if (establishmentId) {
      await this.tenant.assertEstablishmentInScope(actor, establishmentId);
    }
    const scope = establishmentId
      ? Prisma.sql`AND r.establishment_id = ${establishmentId}::uuid`
      : Prisma.sql``;
    return this.prisma.$queryRaw`
      SELECT r.id, r.public_ref, r.status, r.party_size, r.starts_at, r.customer_name, r.customer_phone, r.notes,
             e.name AS establishment_name
      FROM reservations r
      JOIN establishments e ON e.id = r.establishment_id
      WHERE r.organization_id = ${organizationId}::uuid
      ${scope}
      ORDER BY r.starts_at ASC
      LIMIT 80
    `;
  }

  async changeReservationStatus(actor: AuthenticatedActor, reservationId: string, status: string) {
    const organizationId = this.tenant.requireOrganization(actor);
    const rows = await this.prisma.$queryRaw<Array<{ establishment_id: string }>>`
      SELECT establishment_id FROM reservations
      WHERE id = ${reservationId}::uuid AND organization_id = ${organizationId}::uuid
    `;
    if (!rows[0]) {
      throw notFound('Reservation', reservationId);
    }
    await this.requireModules(actor, [MODULE_CODES.RESERVATIONS_TABLES], rows[0].establishment_id);
    await this.tenant.assertEstablishmentInScope(actor, rows[0].establishment_id);
    await this.prisma.$executeRaw`
      UPDATE reservations SET status = ${status}, updated_at = NOW() WHERE id = ${reservationId}::uuid
    `;
    return this.getReservation(reservationId);
  }

  async createReview(actor: AuthenticatedActor, dto: CreateReviewDto) {
    const orders = await this.prisma.$queryRaw<
      Array<{ id: string; establishment_id: string; customer_user_id: string; status: string }>
    >`
      SELECT id, establishment_id, customer_user_id, status FROM orders WHERE id = ${dto.orderId}::uuid
    `;
    const order = orders[0];
    if (!order || order.customer_user_id !== actor.userId) {
      throw notFound('Commande', dto.orderId);
    }
    if (order.status !== 'COMPLETED') {
      throw new DomainError('CONFLICT', 'Avis sans commande terminee', {
        publicDetail: 'Un avis public exige une commande récupérée.',
      });
    }
    const id = randomUUID();
    try {
      await this.prisma.$executeRaw`
        INSERT INTO reviews (id, establishment_id, user_id, order_id, score, body, status, created_at)
        VALUES (${id}::uuid, ${order.establishment_id}::uuid, ${actor.userId}::uuid, ${order.id}::uuid,
                ${dto.score}, ${dto.body?.trim() || null}, 'PUBLISHED', NOW())
      `;
    } catch {
      throw new DomainError('CONFLICT', 'Avis deja depose', {
        publicDetail: 'Vous avez déjà noté cette commande.',
      });
    }
    return this.getReview(id);
  }

  async listReviews(establishmentId: string) {
    return this.prisma.$queryRaw`
      SELECT r.id, r.score, r.body, r.created_at, u.full_name AS author_name, rr.body AS response
      FROM reviews r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN review_responses rr ON rr.review_id = r.id
      WHERE r.establishment_id = ${establishmentId}::uuid AND r.status = 'PUBLISHED'
      ORDER BY r.created_at DESC
      LIMIT 40
    `;
  }

  async respondReview(actor: AuthenticatedActor, reviewId: string, dto: ReviewResponseDto) {
    const organizationId = this.tenant.requireOrganization(actor);
    const rows = await this.prisma.$queryRaw<Array<{ establishment_id: string }>>`
      SELECT e.id AS establishment_id
      FROM reviews r
      JOIN establishments e ON e.id = r.establishment_id
      WHERE r.id = ${reviewId}::uuid AND e.organization_id = ${organizationId}::uuid
    `;
    if (!rows[0]) {
      throw notFound('Avis', reviewId);
    }
    await this.tenant.assertEstablishmentInScope(actor, rows[0].establishment_id);
    await this.prisma.$executeRaw`
      INSERT INTO review_responses (id, review_id, author_user_id, body, created_at)
      VALUES (${randomUUID()}::uuid, ${reviewId}::uuid, ${actor.userId}::uuid, ${dto.body.trim()}, NOW())
      ON CONFLICT (review_id) DO UPDATE SET body = EXCLUDED.body
    `;
    return this.getReview(reviewId);
  }

  async listEvents(establishmentId: string) {
    if (
      MODULE_CODES.MARKETING_PROMOTIONS &&
      !(await this.isEstablishmentModuleEnabled(establishmentId, MODULE_CODES.MARKETING_PROMOTIONS))
    ) {
      return [];
    }
    return this.prisma.$queryRaw`
      SELECT id, title, body, starts_at, ends_at FROM restaurant_events
      WHERE establishment_id = ${establishmentId}::uuid AND starts_at >= NOW() - INTERVAL '1 day'
      ORDER BY starts_at ASC
      LIMIT 20
    `;
  }

  async createEvent(actor: AuthenticatedActor, dto: CreateEventDto) {
    await this.requireModules(actor, [MODULE_CODES.MARKETING_PROMOTIONS], dto.establishmentId);
    await this.tenant.assertEstablishmentInScope(actor, dto.establishmentId);
    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO restaurant_events (id, establishment_id, title, body, starts_at, created_at)
      VALUES (${id}::uuid, ${dto.establishmentId}::uuid, ${dto.title}, ${dto.body ?? null}, ${new Date(dto.startsAt)}, NOW())
    `;
    const followers = await this.prisma.follow.findMany({
      where: { establishmentId: dto.establishmentId, notifyEvents: true },
      select: { userId: true },
    });
    for (const follower of followers) {
      await notifyUser(this.prisma, follower.userId, 'EVENT', dto.title, dto.body ?? 'Nouvel événement.');
    }
    return { id, title: dto.title };
  }

  async createPromotion(actor: AuthenticatedActor, dto: CreatePromotionDto) {
    await this.requireModules(actor, [MODULE_CODES.MARKETING_PROMOTIONS], dto.establishmentId);
    await this.tenant.assertEstablishmentInScope(actor, dto.establishmentId);
    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO promotions (id, establishment_id, title, body, discount_bps, active, created_at)
      VALUES (${id}::uuid, ${dto.establishmentId}::uuid, ${dto.title}, ${dto.body ?? null}, ${dto.discountBps}, TRUE, NOW())
    `;
    return { id, title: dto.title, discountBps: dto.discountBps };
  }

  async listPromotions(establishmentId: string) {
    if (
      MODULE_CODES.MARKETING_PROMOTIONS &&
      !(await this.isEstablishmentModuleEnabled(establishmentId, MODULE_CODES.MARKETING_PROMOTIONS))
    ) {
      return [];
    }
    return this.prisma.$queryRaw`
      SELECT id, title, body, discount_bps FROM promotions
      WHERE establishment_id = ${establishmentId}::uuid AND active = TRUE
      ORDER BY created_at DESC
      LIMIT 20
    `;
  }

  async openCash(actor: AuthenticatedActor, dto: OpenCashDto) {
    await this.requireModules(actor, [MODULE_CODES.CASH_REGISTER], dto.establishmentId);
    await this.tenant.assertEstablishmentInScope(actor, dto.establishmentId);
    const open = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM cash_sessions WHERE establishment_id = ${dto.establishmentId}::uuid AND status = 'OPEN' LIMIT 1
    `;
    if (open[0]) {
      throw new DomainError('CONFLICT', 'Session deja ouverte', {
        publicDetail: 'Fermez d’abord la session en cours.',
      });
    }
    const id = randomUUID();
    const amount = toAmount(dto.openingAmount, 'fond de caisse');
    await this.prisma.$executeRaw`
      INSERT INTO cash_sessions (id, establishment_id, opened_by, opening_amount, status, opened_at)
      VALUES (${id}::uuid, ${dto.establishmentId}::uuid, ${actor.userId}::uuid, ${amount}, 'OPEN', NOW())
    `;
    return this.getCashSession(id);
  }

  async addCashMovement(actor: AuthenticatedActor, dto: CashMovementDto) {
    const sessions = await this.prisma.$queryRaw<
      Array<{ id: string; establishment_id: string; status: string }>
    >`
      SELECT id, establishment_id, status FROM cash_sessions WHERE id = ${dto.sessionId}::uuid
    `;
    if (!sessions[0] || sessions[0].status !== 'OPEN') {
      throw notFound('Session de caisse', dto.sessionId);
    }
    await this.requireModules(actor, [MODULE_CODES.CASH_REGISTER], sessions[0].establishment_id);
    await this.tenant.assertEstablishmentInScope(actor, sessions[0].establishment_id);
    await this.prisma.$executeRaw`
      INSERT INTO cash_movements (id, session_id, kind, amount, label, created_at)
      VALUES (${randomUUID()}::uuid, ${dto.sessionId}::uuid, ${dto.kind}, ${toAmount(dto.amount, 'mouvement')}, ${dto.label}, NOW())
    `;
    return this.getCashSession(dto.sessionId);
  }

  async closeCash(actor: AuthenticatedActor, sessionId: string) {
    const session = await this.getCashSession(sessionId);
    await this.requireModules(actor, [MODULE_CODES.CASH_REGISTER], session.establishmentId);
    await this.tenant.assertEstablishmentInScope(actor, session.establishmentId);
    await this.prisma.$executeRaw`
      UPDATE cash_sessions SET status = 'CLOSED', closing_amount = ${toAmount(session.expectedAmount, 'cloture')}, closed_at = NOW()
      WHERE id = ${sessionId}::uuid
    `;
    return this.getCashSession(sessionId);
  }

  async currentCash(actor: AuthenticatedActor, establishmentId: string) {
    await this.requireModules(actor, [MODULE_CODES.CASH_REGISTER], establishmentId);
    await this.tenant.assertEstablishmentInScope(actor, establishmentId);
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM cash_sessions WHERE establishment_id = ${establishmentId}::uuid AND status = 'OPEN' LIMIT 1
    `;
    return rows[0] ? this.getCashSession(rows[0].id) : null;
  }

  async createExpense(actor: AuthenticatedActor, dto: CreateExpenseDto) {
    await this.requireModules(actor, [MODULE_CODES.FINANCE_EXPENSES], dto.establishmentId);
    await this.tenant.assertEstablishmentInScope(actor, dto.establishmentId);
    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO expenses (id, establishment_id, amount, label, category, created_by, created_at)
      VALUES (${id}::uuid, ${dto.establishmentId}::uuid, ${toAmount(dto.amount, 'depense')}, ${dto.label},
              ${dto.category ?? 'DIVERS'}, ${actor.userId}::uuid, NOW())
    `;
    return { id, label: dto.label };
  }

  async listExpenses(actor: AuthenticatedActor, establishmentId: string) {
    await this.requireModules(actor, [MODULE_CODES.FINANCE_EXPENSES], establishmentId);
    await this.tenant.assertEstablishmentInScope(actor, establishmentId);
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; amount: unknown; label: string; category: string; created_at: Date }>
    >`
      SELECT id, amount, label, category, created_at FROM expenses
      WHERE establishment_id = ${establishmentId}::uuid
      ORDER BY created_at DESC LIMIT 40
    `;
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      category: row.category,
      createdAt: row.created_at,
      amount: toMoneyView(sqlAmount(row.amount, 'depense')),
    }));
  }

  async createCredit(actor: AuthenticatedActor, dto: CreateCreditDto) {
    await this.requireModules(actor, [MODULE_CODES.FINANCE_CREDITS], dto.establishmentId);
    await this.tenant.assertEstablishmentInScope(actor, dto.establishmentId);
    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO customer_credits (id, establishment_id, customer_name, amount, created_at)
      VALUES (${id}::uuid, ${dto.establishmentId}::uuid, ${dto.customerName}, ${toAmount(dto.amount, 'credit')}, NOW())
    `;
    return { id };
  }

  async createDebt(actor: AuthenticatedActor, dto: CreateDebtDto) {
    await this.requireModules(actor, [MODULE_CODES.FINANCE_CREDITS], dto.establishmentId);
    await this.tenant.assertEstablishmentInScope(actor, dto.establishmentId);
    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO supplier_debts (id, establishment_id, supplier_name, amount, created_at)
      VALUES (${id}::uuid, ${dto.establishmentId}::uuid, ${dto.supplierName}, ${toAmount(dto.amount, 'dette')}, NOW())
    `;
    return { id };
  }

  async listCredits(actor: AuthenticatedActor, establishmentId: string) {
    await this.requireModules(actor, [MODULE_CODES.FINANCE_CREDITS], establishmentId);
    await this.tenant.assertEstablishmentInScope(actor, establishmentId);
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; customer_name: string; amount: unknown; created_at: Date }>
    >`
      SELECT id, customer_name, amount, created_at FROM customer_credits
      WHERE establishment_id = ${establishmentId}::uuid
      ORDER BY created_at DESC LIMIT 30
    `;
    return rows.map((row) => ({
      id: row.id,
      customerName: row.customer_name,
      createdAt: row.created_at,
      amount: toMoneyView(sqlAmount(row.amount, 'credit')),
    }));
  }

  async listDebts(actor: AuthenticatedActor, establishmentId: string) {
    await this.requireModules(actor, [MODULE_CODES.FINANCE_CREDITS], establishmentId);
    await this.tenant.assertEstablishmentInScope(actor, establishmentId);
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; supplier_name: string; amount: unknown; created_at: Date }>
    >`
      SELECT id, supplier_name, amount, created_at FROM supplier_debts
      WHERE establishment_id = ${establishmentId}::uuid
      ORDER BY created_at DESC LIMIT 30
    `;
    return rows.map((row) => ({
      id: row.id,
      supplierName: row.supplier_name,
      createdAt: row.created_at,
      amount: toMoneyView(sqlAmount(row.amount, 'dette')),
    }));
  }

  async dailyReport(actor: AuthenticatedActor, establishmentId: string) {
    await this.requireModules(
      actor,
      [
        MODULE_CODES.CASH_REGISTER,
        MODULE_CODES.FINANCE_EXPENSES,
        MODULE_CODES.ANALYTICS_ADVANCED,
        MODULE_CODES.ORDERS_MARKETPLACE,
        MODULE_CODES.ORDERS_MANUAL,
      ],
      establishmentId,
    );
    await this.tenant.assertEstablishmentInScope(actor, establishmentId);
    const [orders] = await this.prisma.$queryRaw<Array<{ count: number; total: unknown }>>`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount), 0) AS total
      FROM orders
      WHERE establishment_id = ${establishmentId}::uuid
        AND placed_at >= date_trunc('day', NOW())
        AND status NOT IN ('CANCELLED', 'REJECTED', 'FAILED')
    `;
    const [expenses] = await this.prisma.$queryRaw<Array<{ total: unknown }>>`
      SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
      WHERE establishment_id = ${establishmentId}::uuid AND created_at >= date_trunc('day', NOW())
    `;
    return {
      ordersCount: Number(orders?.count ?? 0),
      ordersTotal: toMoneyView(sqlAmount(orders?.total, 'ca')),
      expensesTotal: toMoneyView(sqlAmount(expenses?.total, 'depenses')),
    };
  }

  async listInventory(actor: AuthenticatedActor, establishmentId: string) {
    await this.requireModules(
      actor,
      [MODULE_CODES.INVENTORY_SIMPLE, MODULE_CODES.INVENTORY_INGREDIENTS],
      establishmentId,
    );
    await this.tenant.assertEstablishmentInScope(actor, establishmentId);
    return this.prisma.$queryRaw`
      SELECT id, name, quantity, unit, updated_at FROM inventory_items
      WHERE establishment_id = ${establishmentId}::uuid
      ORDER BY name ASC
    `;
  }

  async createInventoryItem(actor: AuthenticatedActor, dto: InventoryItemDto) {
    await this.requireModules(
      actor,
      [MODULE_CODES.INVENTORY_SIMPLE, MODULE_CODES.INVENTORY_INGREDIENTS],
      dto.establishmentId,
    );
    await this.tenant.assertEstablishmentInScope(actor, dto.establishmentId);
    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO inventory_items (id, establishment_id, name, quantity, unit, updated_at)
      VALUES (${id}::uuid, ${dto.establishmentId}::uuid, ${dto.name}, ${dto.quantity}, ${dto.unit ?? 'u'}, NOW())
    `;
    return { id, name: dto.name, quantity: dto.quantity };
  }

  async moveStock(actor: AuthenticatedActor, itemId: string, dto: StockMoveDto) {
    const items = await this.prisma.$queryRaw<Array<{ establishment_id: string; quantity: number }>>`
      SELECT establishment_id, quantity FROM inventory_items WHERE id = ${itemId}::uuid
    `;
    if (!items[0]) {
      throw notFound('Article', itemId);
    }
    await this.requireModules(
      actor,
      [MODULE_CODES.INVENTORY_SIMPLE, MODULE_CODES.INVENTORY_INGREDIENTS],
      items[0].establishment_id,
    );
    await this.tenant.assertEstablishmentInScope(actor, items[0].establishment_id);
    const next = items[0].quantity + dto.delta;
    if (next < 0) {
      throw validationFailed([
        { field: 'delta', code: 'invalid', message: 'Le stock ne peut pas devenir négatif' },
      ]);
    }
    await this.prisma.$executeRaw`
      UPDATE inventory_items SET quantity = ${next}, updated_at = NOW() WHERE id = ${itemId}::uuid
    `;
    await this.prisma.$executeRaw`
      INSERT INTO stock_movements (id, item_id, delta, reason, created_at)
      VALUES (${randomUUID()}::uuid, ${itemId}::uuid, ${dto.delta}, ${dto.reason}, NOW())
    `;
    return { id: itemId, quantity: next };
  }

  async listDelivery(actor: AuthenticatedActor, establishmentId?: string) {
    await this.requireModules(actor, [MODULE_CODES.DELIVERY_INTERNAL], establishmentId);
    const organizationId = this.tenant.requireOrganization(actor);
    const scope = establishmentId
      ? Prisma.sql`AND o.establishment_id = ${establishmentId}::uuid`
      : Prisma.sql``;
    return this.prisma.$queryRaw`
      SELECT t.id, t.order_id, t.status, t.courier_name, t.address_text, o.public_ref, o.customer_name
      FROM delivery_tasks t
      JOIN orders o ON o.id = t.order_id
      WHERE o.organization_id = ${organizationId}::uuid
      ${scope}
      ORDER BY t.created_at DESC
      LIMIT 50
    `;
  }

  async changeDelivery(actor: AuthenticatedActor, taskId: string, dto: DeliveryStatusDto) {
    const organizationId = this.tenant.requireOrganization(actor);
    const rows = await this.prisma.$queryRaw<Array<{ establishment_id: string }>>`
      SELECT o.establishment_id
      FROM delivery_tasks t
      JOIN orders o ON o.id = t.order_id
      WHERE t.id = ${taskId}::uuid AND o.organization_id = ${organizationId}::uuid
    `;
    if (!rows[0]) {
      throw notFound('Livraison', taskId);
    }
    await this.requireModules(actor, [MODULE_CODES.DELIVERY_INTERNAL], rows[0].establishment_id);
    await this.tenant.assertEstablishmentInScope(actor, rows[0].establishment_id);
    await this.prisma.$executeRaw`
      UPDATE delivery_tasks
      SET status = ${dto.status}, courier_name = COALESCE(${dto.courierName ?? null}, courier_name), updated_at = NOW()
      WHERE id = ${taskId}::uuid
    `;
    return { id: taskId, status: dto.status };
  }

  async createSupportTicket(actor: AuthenticatedActor, dto: SupportTicketDto) {
    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO support_tickets (id, user_id, subject, body, status, created_at)
      VALUES (${id}::uuid, ${actor.userId}::uuid, ${dto.subject}, ${dto.body}, 'OPEN', NOW())
    `;
    return { id, status: 'OPEN' };
  }

  async listSupportTickets(actor: AuthenticatedActor) {
    return this.prisma.$queryRaw`
      SELECT id, subject, body, status, created_at FROM support_tickets
      WHERE user_id = ${actor.userId}::uuid
      ORDER BY created_at DESC LIMIT 20
    `;
  }

  async adminOrders() {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        public_ref: string;
        status: string;
        total_amount: unknown;
        placed_at: Date;
        establishment_name: string;
        payment_status: string | null;
      }>
    >`
      SELECT o.id, o.public_ref, o.status, o.total_amount, o.placed_at, e.name AS establishment_name,
             (
               SELECT p.status FROM payment_intents p
               WHERE p.order_id = o.id
               ORDER BY p.created_at DESC
               LIMIT 1
             ) AS payment_status
      FROM orders o
      JOIN establishments e ON e.id = o.establishment_id
      ORDER BY o.placed_at DESC
      LIMIT 80
    `;
    return rows.map((row) => ({
      id: row.id,
      public_ref: row.public_ref,
      status: row.status,
      establishment_name: row.establishment_name,
      placed_at: row.placed_at,
      payment_status: row.payment_status,
      total: toMoneyView(sqlAmount(row.total_amount, 'commande')),
    }));
  }

  async refundOrder(orderId: string) {
    const intents = await this.prisma.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id, status FROM payment_intents
      WHERE order_id = ${orderId}::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const intent = intents[0];
    if (!intent) {
      throw notFound('Paiement', orderId);
    }
    if (intent.status === 'REFUNDED') {
      return { id: orderId, paymentStatus: 'REFUNDED' };
    }
    if (intent.status !== 'SUCCEEDED') {
      throw new DomainError('CONFLICT', `Paiement non remboursable : ${intent.status}`, {
        publicDetail: 'Seul un paiement sandbox abouti peut etre rembourse.',
      });
    }
    await this.prisma.$executeRaw`
      UPDATE payment_intents SET status = 'REFUNDED', updated_at = NOW() WHERE id = ${intent.id}::uuid
    `;
    return { id: orderId, paymentStatus: 'REFUNDED' };
  }

  async adminReviews() {
    return this.prisma.$queryRaw`
      SELECT r.id, r.score, r.body, r.status, r.created_at, e.name AS establishment_name
      FROM reviews r
      JOIN establishments e ON e.id = r.establishment_id
      ORDER BY r.created_at DESC
      LIMIT 80
    `;
  }

  async hideReview(reviewId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM reviews WHERE id = ${reviewId}::uuid
    `;
    if (!rows[0]) {
      throw notFound('Avis', reviewId);
    }
    await this.prisma.$executeRaw`
      UPDATE reviews SET status = 'HIDDEN' WHERE id = ${reviewId}::uuid
    `;
    return { id: reviewId, status: 'HIDDEN' };
  }

  async adminTickets() {
    return this.prisma.$queryRaw`
      SELECT t.id, t.subject, t.body, t.status, t.created_at, u.full_name, u.phone_e164
      FROM support_tickets t
      JOIN users u ON u.id = t.user_id
      ORDER BY t.created_at DESC
      LIMIT 80
    `;
  }

  async closeTicket(ticketId: string) {
    await this.prisma.$executeRaw`
      UPDATE support_tickets SET status = 'CLOSED' WHERE id = ${ticketId}::uuid
    `;
    return { id: ticketId, status: 'CLOSED' };
  }

  async listAddresses(actor: AuthenticatedActor) {
    return this.prisma.$queryRaw`
      SELECT id, label, line, created_at FROM user_addresses
      WHERE user_id = ${actor.userId}::uuid ORDER BY created_at DESC LIMIT 20
    `;
  }

  async createAddress(actor: AuthenticatedActor, input: { label: string; line: string }) {
    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO user_addresses (id, user_id, label, line, created_at)
      VALUES (${id}::uuid, ${actor.userId}::uuid, ${input.label.trim()}, ${input.line.trim()}, NOW())
    `;
    return { id, label: input.label.trim(), line: input.line.trim() };
  }

  async deleteAddress(actor: AuthenticatedActor, id: string) {
    await this.prisma.$executeRaw`
      DELETE FROM user_addresses WHERE id = ${id}::uuid AND user_id = ${actor.userId}::uuid
    `;
    return { id };
  }

  async listTables(actor: AuthenticatedActor, establishmentId: string) {
    await this.requireModules(actor, [MODULE_CODES.RESERVATIONS_TABLES], establishmentId);
    await this.tenant.assertEstablishmentInScope(actor, establishmentId);
    return this.prisma.$queryRaw`
      SELECT id, name, seats FROM dining_tables WHERE establishment_id = ${establishmentId}::uuid ORDER BY name ASC
    `;
  }

  async createTable(actor: AuthenticatedActor, establishmentId: string, name: string, seats: number) {
    await this.requireModules(actor, [MODULE_CODES.RESERVATIONS_TABLES], establishmentId);
    await this.tenant.assertEstablishmentInScope(actor, establishmentId);
    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO dining_tables (id, establishment_id, name, seats, created_at)
      VALUES (${id}::uuid, ${establishmentId}::uuid, ${name.trim()}, ${seats}, NOW())
    `;
    return { id, name: name.trim(), seats };
  }

  async listCoupons(actor: AuthenticatedActor, establishmentId: string) {
    await this.requireModules(actor, [MODULE_CODES.MARKETING_PROMOTIONS], establishmentId);
    await this.tenant.assertEstablishmentInScope(actor, establishmentId);
    return this.prisma.$queryRaw`
      SELECT id, code, discount_bps, active FROM coupons
      WHERE establishment_id = ${establishmentId}::uuid ORDER BY created_at DESC LIMIT 40
    `;
  }

  async createCoupon(actor: AuthenticatedActor, establishmentId: string, code: string, discountBps: number) {
    await this.requireModules(actor, [MODULE_CODES.MARKETING_PROMOTIONS], establishmentId);
    await this.tenant.assertEstablishmentInScope(actor, establishmentId);
    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO coupons (id, establishment_id, code, discount_bps, active, created_at)
      VALUES (${id}::uuid, ${establishmentId}::uuid, ${code.trim().toUpperCase()}, ${discountBps}, TRUE, NOW())
    `;
    return { id, code: code.trim().toUpperCase(), discountBps };
  }

  private async getReservation(id: string) {
    const rows = await this.prisma.$queryRaw`
      SELECT r.id, r.public_ref, r.status, r.party_size, r.starts_at, r.notes,
             e.name AS establishment_name, e.slug AS establishment_slug
      FROM reservations r
      JOIN establishments e ON e.id = r.establishment_id
      WHERE r.id = ${id}::uuid
    `;
    return (rows as object[])[0];
  }

  private async getReview(id: string) {
    const rows = await this.prisma.$queryRaw`
      SELECT r.id, r.score, r.body, r.created_at, rr.body AS response
      FROM reviews r
      LEFT JOIN review_responses rr ON rr.review_id = r.id
      WHERE r.id = ${id}::uuid
    `;
    return (rows as object[])[0];
  }

  private async getCashSession(id: string) {
    const sessions = await this.prisma.$queryRaw<
      Array<{
        id: string;
        establishment_id: string;
        opening_amount: unknown;
        closing_amount: unknown;
        status: string;
      }>
    >`
      SELECT id, establishment_id, opening_amount, closing_amount, status FROM cash_sessions WHERE id = ${id}::uuid
    `;
    const session = sessions[0];
    if (!session) {
      throw notFound('Session de caisse', id);
    }
    const movements = await this.prisma.$queryRaw<Array<{ kind: string; amount: unknown; label: string }>>`
      SELECT kind, amount, label FROM cash_movements WHERE session_id = ${id}::uuid ORDER BY created_at ASC
    `;
    let expected = toAmount(session.opening_amount, 'ouverture');
    for (const movement of movements) {
      const amount = toAmount(movement.amount, 'mouvement');
      expected = movement.kind === 'IN' ? expected + amount : expected - amount;
    }
    return {
      id: session.id,
      establishmentId: session.establishment_id,
      status: session.status,
      openingAmount: toMoneyView(toAmount(session.opening_amount, 'ouverture')),
      expectedAmount: expected.toString(),
      expected: toMoneyView(expected),
      movements: movements.map((movement) => ({
        kind: movement.kind,
        label: movement.label,
        amount: toMoneyView(toAmount(movement.amount, 'mouvement')),
      })),
    };
  }
}
