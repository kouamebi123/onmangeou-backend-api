import { Clock } from '../../common/time/clock';
import { orderSchedule } from './order-schedule';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../infrastructure/prisma/generated/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { TenantScopeService } from '../../common/auth/tenant-scope.service';
import { DomainError, notFound, validationFailed } from '../../common/errors/domain.error';
import { toAmount, toMoneyView, type MoneyView } from '../../common/money/money';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { MODULE_CODES } from '../entitlements/module-codes';
import type { CreateOrderDto } from './dto/orders.dto';

type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PENDING_RESTAURANT'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

type OrderService = 'TAKEAWAY' | 'DINE_IN' | 'DELIVERY';

const CUSTOMER_CANCELABLE: OrderStatus[] = ['PENDING_PAYMENT', 'PENDING_RESTAURANT'];

const MERCHANT_TRANSITIONS: Record<string, OrderStatus[]> = {
  ACCEPTED: ['PENDING_RESTAURANT'],
  REJECTED: ['PENDING_RESTAURANT'],
  PREPARING: ['ACCEPTED'],
  READY: ['ACCEPTED', 'PREPARING'],
  COMPLETED: ['READY'],
};

export interface OrderItemView {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: MoneyView;
  linePrice: MoneyView;
}

export interface OrderView {
  id: string;
  publicRef: string;
  establishmentId: string;
  establishmentName: string;
  establishmentSlug: string;
  status: OrderStatus;
  service: OrderService;
  paymentMethod: string;
  customerName: string;
  customerPhone: string;
  notes: string | null;
  items: OrderItemView[];
  total: MoneyView;
  placedAt: string;
  scheduledFor: string | null;
  timezone: string;
}

interface OrderRow {
  id: string;
  public_ref: string;
  establishment_id: string;
  status: OrderStatus;
  service: OrderService;
  payment_method: string;
  customer_name: string;
  customer_phone: string;
  notes: string | null;
  total_amount: unknown;
  placed_at: Date;
  scheduled_for: Date | null;
  timezone: string;
  establishment_name: string;
  establishment_slug: string;
}

interface ItemRow {
  id: string;
  product_id: string;
  name_snapshot: string;
  quantity: number;
  unit_amount: unknown;
  line_amount: unknown;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantScopeService,
    private readonly entitlements: EntitlementsService,
    private readonly clock: Clock,
  ) {}

  async schedule(establishmentId: string) {
    const restaurant = await this.prisma.establishment.findFirst({
      where: { id: establishmentId, deletedAt: null, status: 'PUBLISHED' },
      include: { hours: true, hoursExceptions: true },
    });
    if (!restaurant) throw notFound('Etablissement', establishmentId);
    return orderSchedule(
      this.clock.now(),
      restaurant.hours,
      restaurant.hoursExceptions.map((e) => ({
        dateKey: e.exceptionDate.toISOString().slice(0, 10),
        closed: e.closed,
        opensAtMinutes: e.opensAtMinutes,
        closesAtMinutes: e.closesAtMinutes,
      })),
      restaurant.timezone,
    );
  }

  async create(
    actor: AuthenticatedActor,
    dto: CreateOrderDto,
    source: 'marketplace' | 'manual' = 'marketplace',
  ): Promise<OrderView> {
    const quantities = new Map<string, number>();
    for (const item of dto.items) {
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }

    const establishment = await this.prisma.establishment.findFirst({
      where: { id: dto.establishmentId, deletedAt: null, status: 'PUBLISHED' },
      select: { id: true, organizationId: true, name: true, slug: true },
    });
    if (!establishment) {
      throw notFound('Etablissement', dto.establishmentId);
    }
    await this.entitlements.assertModuleEnabled(
      establishment.organizationId,
      source === 'manual' ? MODULE_CODES.ORDERS_MANUAL : MODULE_CODES.ORDERS_MARKETPLACE,
      establishment.id,
    );
    const paymentMethod = dto.paymentMethod ?? 'CASH';
    const service = dto.service ?? (source === 'manual' ? 'DINE_IN' : 'TAKEAWAY');
    if (service === 'DELIVERY') {
      await this.entitlements.assertModuleEnabled(
        establishment.organizationId,
        MODULE_CODES.DELIVERY_INTERNAL,
        establishment.id,
      );
    }
    if (paymentMethod !== 'CASH') {
      await this.entitlements.assertModuleEnabled(
        establishment.organizationId,
        MODULE_CODES.PAYMENTS_ONLINE,
        establishment.id,
      );
    }

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: [...quantities.keys()] },
        establishmentId: establishment.id,
        deletedAt: null,
        status: 'PUBLISHED',
      },
      include: { availability: { take: 1, orderBy: { changedAt: 'desc' } } },
    });

    if (products.length !== quantities.size) {
      throw validationFailed([
        { field: 'items', code: 'invalid', message: 'Un plat n’appartient pas à cet établissement' },
      ]);
    }

    const lines = products.map((product) => {
      const latest = product.availability[0];
      if (latest && latest.status !== 'AVAILABLE') {
        throw validationFailed([
          { field: 'items', code: 'unavailable', message: `${product.name} n’est plus disponible` },
        ]);
      }
      const quantity = quantities.get(product.id) ?? 0;
      const unitAmount = product.basePriceAmount;
      return {
        productId: product.id,
        nameSnapshot: product.name,
        quantity,
        unitAmount,
        lineAmount: unitAmount * BigInt(quantity),
      };
    });

    const totalAmount = lines.reduce((sum, line) => sum + line.lineAmount, 0n);
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { fullName: true, phoneE164: true },
    });

    const orderId = randomUUID();
    const publicRef = this.nextPublicRef();
    const customerName = dto.customerName?.trim() || user?.fullName?.trim() || 'Client';
    const customerPhone = dto.customerPhone?.trim() || user?.phoneE164 || '';
    const notes = dto.notes?.trim() || null;
    const initialStatus = paymentMethod === 'CASH' ? 'PENDING_RESTAURANT' : 'PENDING_PAYMENT';
    let scheduledFor: Date | null = null;
    if (dto.scheduledFor) {
      scheduledFor = new Date(dto.scheduledFor);
      if (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() < this.clock.nowMs() + 10 * 60_000) {
        throw validationFailed([
          {
            field: 'scheduledFor',
            code: 'invalid',
            message: 'Le créneau doit être au moins dans 10 minutes',
          },
        ]);
      }
    }

    if (source === 'marketplace' || scheduledFor) {
      const schedule = await this.schedule(dto.establishmentId);
      if (scheduledFor ? !schedule.slots.includes(scheduledFor.toISOString()) : !schedule.asapAvailable) {
        throw validationFailed([
          {
            field: 'scheduledFor',
            code: 'unavailable',
            message:
              'Ce créneau n’est plus disponible. Choisissez une heure pendant les horaires d’ouverture, dans les sept prochains jours.',
          },
        ]);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO orders (
          id, public_ref, organization_id, establishment_id, customer_user_id,
          status, service, customer_name, customer_phone, notes, payment_method,
          subtotal_amount, total_amount, placed_at, scheduled_for, created_at, updated_at
        ) VALUES (
          ${orderId}::uuid, ${publicRef}, ${establishment.organizationId}::uuid,
          ${establishment.id}::uuid, ${actor.userId}::uuid,
          ${initialStatus}::"OrderStatus", ${service}::"OrderService",
          ${customerName}, ${customerPhone}, ${notes}, ${paymentMethod},
          ${totalAmount}, ${totalAmount}, NOW(), ${scheduledFor}, NOW(), NOW()
        )
      `;

      for (const line of lines) {
        await tx.$executeRaw`
          INSERT INTO order_items (
            id, order_id, product_id, name_snapshot, quantity, unit_amount, line_amount, created_at
          ) VALUES (
            ${randomUUID()}::uuid, ${orderId}::uuid, ${line.productId}::uuid,
            ${line.nameSnapshot}, ${line.quantity}, ${line.unitAmount}, ${line.lineAmount}, NOW()
          )
        `;
      }
      if (service === 'DELIVERY') {
        await tx.$executeRaw`
          INSERT INTO delivery_tasks (id, order_id, status, address_text, created_at, updated_at)
          VALUES (${randomUUID()}::uuid, ${orderId}::uuid, 'UNASSIGNED', ${dto.deliveryAddress ?? null}, NOW(), NOW())
        `;
      }
    });

    return this.loadView(orderId);
  }

  async createManual(actor: AuthenticatedActor, dto: CreateOrderDto): Promise<OrderView> {
    await this.tenant.assertEstablishmentInScope(actor, dto.establishmentId);
    return this.create(
      actor,
      {
        ...dto,
        paymentMethod: 'CASH',
        service: dto.service ?? 'DINE_IN',
      },
      'manual',
    );
  }

  async listMine(actor: AuthenticatedActor): Promise<OrderView[]> {
    const rows = await this.prisma.$queryRaw<OrderRow[]>`
      SELECT o.id, o.public_ref, o.establishment_id, o.status, o.service, o.payment_method,
             o.customer_name, o.customer_phone, o.notes, o.total_amount, o.placed_at, o.scheduled_for, e.timezone,
             e.name AS establishment_name, e.slug AS establishment_slug
      FROM orders o
      JOIN establishments e ON e.id = o.establishment_id
      WHERE o.customer_user_id = ${actor.userId}::uuid
      ORDER BY o.placed_at DESC
      LIMIT 50
    `;
    return this.toViews(rows);
  }

  async getMine(actor: AuthenticatedActor, orderId: string): Promise<OrderView> {
    const view = await this.loadView(orderId, { customerUserId: actor.userId });
    if (!view) {
      throw notFound('Commande', orderId);
    }
    return view;
  }

  async confirmPickup(actor: AuthenticatedActor, orderId: string): Promise<OrderView> {
    const current = await this.findOwned(orderId, actor.userId);
    if (current.status !== 'READY' || current.service === 'DELIVERY') {
      throw new DomainError('CONFLICT', `Retrait impossible depuis ${current.status}`, {
        publicDetail: 'Le restaurant n’a pas encore annoncé que c’est prêt.',
      });
    }
    await this.updateStatus(orderId, 'COMPLETED', current.status);
    return this.loadView(orderId);
  }

  async cancelMine(actor: AuthenticatedActor, orderId: string): Promise<OrderView> {
    const current = await this.findOwned(orderId, actor.userId);
    if (!CUSTOMER_CANCELABLE.includes(current.status)) {
      throw new DomainError('CONFLICT', `Commande ${current.status} non annulable`, {
        publicDetail: 'Cette commande ne peut plus être annulée.',
      });
    }
    await this.updateStatus(orderId, 'CANCELLED', current.status);
    return this.loadView(orderId);
  }

  async listMerchant(actor: AuthenticatedActor, establishmentId?: string): Promise<OrderView[]> {
    const organizationId = this.tenant.requireOrganization(actor);
    if (establishmentId) {
      await this.tenant.assertEstablishmentInScope(actor, establishmentId);
    }

    const scope = establishmentId
      ? Prisma.sql`o.establishment_id = ${establishmentId}::uuid`
      : actor.establishmentIds.length > 0
        ? Prisma.sql`o.establishment_id IN (${Prisma.join(actor.establishmentIds.map((id) => Prisma.sql`${id}::uuid`))})`
        : Prisma.sql`FALSE`;

    const rows = await this.prisma.$queryRaw<OrderRow[]>`
      SELECT o.id, o.public_ref, o.establishment_id, o.status, o.service, o.payment_method,
             o.customer_name, o.customer_phone, o.notes, o.total_amount, o.placed_at, o.scheduled_for, e.timezone,
             e.name AS establishment_name, e.slug AS establishment_slug
      FROM orders o
      JOIN establishments e ON e.id = o.establishment_id
      WHERE o.organization_id = ${organizationId}::uuid
        AND ${scope}
      ORDER BY o.placed_at DESC
      LIMIT 80
    `;
    return this.toViews(rows);
  }

  async changeMerchantStatus(
    actor: AuthenticatedActor,
    orderId: string,
    status: OrderStatus,
  ): Promise<OrderView> {
    const organizationId = this.tenant.requireOrganization(actor);
    const current = await this.findInOrganization(orderId, organizationId);
    await this.tenant.assertEstablishmentInScope(actor, current.establishmentId);

    const allowedFrom = MERCHANT_TRANSITIONS[status];
    if (
      !allowedFrom?.includes(current.status) ||
      (status === 'COMPLETED' && current.service === 'DELIVERY')
    ) {
      throw new DomainError('CONFLICT', `Transition ${current.status} → ${status} interdite`, {
        publicDetail: 'Cette étape n’est pas possible maintenant.',
      });
    }

    await this.updateStatus(orderId, status, current.status);
    return this.loadView(orderId);
  }

  private nextPublicRef(): string {
    const raw = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `OMO-${raw}`;
  }

  private async findOwned(
    orderId: string,
    customerUserId: string,
  ): Promise<{ status: OrderStatus; service: OrderService }> {
    const rows = await this.prisma.$queryRaw<Array<{ status: OrderStatus; service: OrderService }>>`
      SELECT status, service FROM orders
      WHERE id = ${orderId}::uuid AND customer_user_id = ${customerUserId}::uuid
      LIMIT 1
    `;
    if (!rows[0]) {
      throw notFound('Commande', orderId);
    }
    return rows[0];
  }

  private async findInOrganization(
    orderId: string,
    organizationId: string,
  ): Promise<{ status: OrderStatus; establishmentId: string; service: OrderService }> {
    const rows = await this.prisma.$queryRaw<
      Array<{ status: OrderStatus; establishment_id: string; service: OrderService }>
    >`
      SELECT status, establishment_id, service FROM orders
      WHERE id = ${orderId}::uuid AND organization_id = ${organizationId}::uuid
      LIMIT 1
    `;
    if (!rows[0]) {
      throw notFound('Commande', orderId);
    }
    return { status: rows[0].status, establishmentId: rows[0].establishment_id, service: rows[0].service };
  }

  private async updateStatus(orderId: string, status: OrderStatus, previous: OrderStatus): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.$executeRaw`
        UPDATE orders SET status = ${status}::"OrderStatus", updated_at = NOW()
        WHERE id = ${orderId}::uuid AND status = ${previous}::"OrderStatus"
      `;
      if (!changed)
        throw new DomainError('CONFLICT', 'Commande modifiee', {
          publicDetail: 'La commande a changé. Actualisez son suivi.',
        });
      if (status === 'CANCELLED' || status === 'REJECTED') {
        await tx.$executeRaw`
          UPDATE delivery_tasks SET status = 'CANCELLED', updated_at = NOW()
          WHERE order_id = ${orderId}::uuid AND status <> 'DELIVERED'
        `;
      }
    });
  }

  private async loadView(orderId: string, filter?: { customerUserId?: string }): Promise<OrderView> {
    const customerFilter = filter?.customerUserId
      ? Prisma.sql`AND o.customer_user_id = ${filter.customerUserId}::uuid`
      : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<OrderRow[]>`
      SELECT o.id, o.public_ref, o.establishment_id, o.status, o.service, o.payment_method,
             o.customer_name, o.customer_phone, o.notes, o.total_amount, o.placed_at, o.scheduled_for, e.timezone,
             e.name AS establishment_name, e.slug AS establishment_slug
      FROM orders o
      JOIN establishments e ON e.id = o.establishment_id
      WHERE o.id = ${orderId}::uuid
      ${customerFilter}
      LIMIT 1
    `;
    const views = await this.toViews(rows);
    if (!views[0]) {
      throw notFound('Commande', orderId);
    }
    return views[0];
  }

  private async toViews(rows: OrderRow[]): Promise<OrderView[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.id);
    const items = await this.prisma.$queryRaw<Array<ItemRow & { order_id: string }>>`
      SELECT id, order_id, product_id, name_snapshot, quantity, unit_amount, line_amount
      FROM order_items
      WHERE order_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
    `;
    const byOrder = new Map<string, ItemRow[]>();
    for (const item of items) {
      const list = byOrder.get(item.order_id) ?? [];
      list.push(item);
      byOrder.set(item.order_id, list);
    }
    return rows.map((row) => this.toView(row, byOrder.get(row.id) ?? []));
  }

  private toView(order: OrderRow, items: ItemRow[]): OrderView {
    return {
      id: order.id,
      publicRef: order.public_ref,
      establishmentId: order.establishment_id,
      establishmentName: order.establishment_name,
      establishmentSlug: order.establishment_slug,
      status: order.status,
      service: order.service,
      paymentMethod: order.payment_method,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      notes: order.notes,
      items: items.map((item) => ({
        id: item.id,
        productId: item.product_id,
        name: item.name_snapshot,
        quantity: item.quantity,
        unitPrice: toMoneyView(toAmount(item.unit_amount, 'prix unitaire')),
        linePrice: toMoneyView(toAmount(item.line_amount, 'ligne')),
      })),
      total: toMoneyView(toAmount(order.total_amount, 'total')),
      placedAt: new Date(order.placed_at).toISOString(),
      scheduledFor: order.scheduled_for ? new Date(order.scheduled_for).toISOString() : null,
      timezone: order.timezone,
    };
  }
}
