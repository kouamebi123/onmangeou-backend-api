import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain.error';
import { Clock } from '../../common/time/clock';
import { toAmount, toMoneyView, type MoneyView } from '../../common/money/money';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { TenantScopeService } from '../../common/auth/tenant-scope.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OutboxService, OUTBOX_EVENTS } from '../../infrastructure/outbox/outbox.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import type {
  ChangeProductPriceDto,
  CreateCategoryDto,
  CreateMenuDto,
  CreateProductDto,
  SetAvailabilityDto,
  UpdateProductDto,
} from './dto/catalog.dto';

export interface MerchantProductView {
  id: string;
  name: string;
  description: string | null;
  price: MoneyView;
  status: string;
  categoryId: string | null;
  availability: string;
  preparationMinutes: number | null;
  vegetarian: boolean;
  halal: boolean;
  spicyLevel: number | null;
}

/**
 * Catalogue : menus, categories, plats, prix et disponibilite.
 *
 * Reference : specification sections 3.2, 8.2 et 8.3.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly tenant: TenantScopeService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async createMenu(
    actor: AuthenticatedActor,
    dto: CreateMenuDto,
    context: { requestId: string },
  ): Promise<{ menuId: string }> {
    const { organizationId } = await this.tenant.assertEstablishmentInScope(actor, dto.establishmentId);

    const menu = await this.prisma.$transaction(async (tx) => {
      const created = await tx.menu.create({
        data: {
          organizationId,
          establishmentId: dto.establishmentId,
          name: dto.name,
          position: dto.position ?? 0,
        },
        select: { id: true, name: true },
      });

      await this.audit.record(
        {
          action: AUDIT_ACTIONS.MENU_CREATED,
          resourceType: 'menu',
          resourceId: created.id,
          organizationId,
          actorUserId: actor.userId,
          after: { name: created.name, establishmentId: dto.establishmentId },
          requestId: context.requestId,
        },
        tx,
      );

      return created;
    });

    return { menuId: menu.id };
  }

  async createCategory(actor: AuthenticatedActor, dto: CreateCategoryDto): Promise<{ categoryId: string }> {
    await this.assertMenuInScope(actor, dto.menuId);

    const category = await this.prisma.menuCategory.create({
      data: {
        menuId: dto.menuId,
        name: dto.name,
        description: dto.description ?? null,
        position: dto.position ?? 0,
      },
      select: { id: true },
    });

    return { categoryId: category.id };
  }

  /**
   * Cree un plat et sa ligne de disponibilite.
   *
   * La disponibilite est materialisee des la creation : un plat sans ligne de
   * disponibilite obligerait chaque lecture publique a gerer un cas d'absence, et
   * la rupture ne pourrait pas etre auditee.
   */
  async createProduct(
    actor: AuthenticatedActor,
    dto: CreateProductDto,
    context: { requestId: string },
  ): Promise<{ productId: string }> {
    const { organizationId } = await this.tenant.assertEstablishmentInScope(actor, dto.establishmentId);
    const basePriceAmount = toAmount(dto.basePriceAmount, 'prix de base');

    if (dto.categoryId !== undefined) {
      await this.assertCategoryInScope(actor, dto.categoryId, dto.establishmentId);
    }

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          organizationId,
          establishmentId: dto.establishmentId,
          categoryId: dto.categoryId ?? null,
          name: dto.name,
          description: dto.description ?? null,
          basePriceAmount,
          preparationMinutes: dto.preparationMinutes ?? null,
          spicyLevel: dto.spicyLevel ?? null,
          vegetarian: dto.vegetarian ?? false,
          halal: dto.halal ?? false,
          availability: {
            create: { establishmentId: dto.establishmentId, status: 'AVAILABLE' },
          },
          priceHistory: {
            create: {
              newAmount: basePriceAmount,
              changedByUserId: actor.userId,
              reason: 'Creation du plat',
            },
          },
        },
        select: { id: true, name: true },
      });

      await this.audit.record(
        {
          action: AUDIT_ACTIONS.PRODUCT_CREATED,
          resourceType: 'product',
          resourceId: created.id,
          organizationId,
          actorUserId: actor.userId,
          after: { name: created.name, basePriceAmount: basePriceAmount.toString() },
          requestId: context.requestId,
        },
        tx,
      );

      return created;
    });

    return { productId: product.id };
  }

  async updateProduct(
    actor: AuthenticatedActor,
    productId: string,
    dto: UpdateProductDto,
    context: { requestId: string },
  ): Promise<void> {
    const product = await this.loadProductInScope(actor, productId);

    if (dto.categoryId !== undefined) {
      await this.assertCategoryInScope(actor, dto.categoryId, product.establishmentId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.description === undefined ? {} : { description: dto.description }),
          ...(dto.categoryId === undefined ? {} : { categoryId: dto.categoryId }),
          ...(dto.preparationMinutes === undefined ? {} : { preparationMinutes: dto.preparationMinutes }),
          ...(dto.spicyLevel === undefined ? {} : { spicyLevel: dto.spicyLevel }),
          ...(dto.vegetarian === undefined ? {} : { vegetarian: dto.vegetarian }),
          ...(dto.halal === undefined ? {} : { halal: dto.halal }),
        },
      });

      await this.audit.record(
        {
          action: AUDIT_ACTIONS.PRODUCT_UPDATED,
          resourceType: 'product',
          resourceId: productId,
          organizationId: product.organizationId,
          actorUserId: actor.userId,
          before: { name: product.name, categoryId: product.categoryId },
          after: dto,
          requestId: context.requestId,
        },
        tx,
      );
    });
  }

  /**
   * Change le prix d'un plat.
   *
   * Le prix courant est mis a jour et l'ancien conserve dans `price_history`,
   * table append-only protegee par declencheur. Les commandes deja passees ne
   * sont pas affectees : leur prix a ete copie dans la ligne de commande
   * (specification section 8.3, scenario obligatoire 8).
   */
  async changeProductPrice(
    actor: AuthenticatedActor,
    productId: string,
    dto: ChangeProductPriceDto,
    context: { requestId: string },
  ): Promise<{ price: MoneyView }> {
    const product = await this.loadProductInScope(actor, productId);
    const newAmount = toAmount(dto.newAmount, 'nouveau prix');

    if (newAmount === product.basePriceAmount) {
      return { price: toMoneyView(product.basePriceAmount) };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: { basePriceAmount: newAmount },
      });

      await tx.priceHistory.create({
        data: {
          productId,
          previousAmount: product.basePriceAmount,
          newAmount,
          changedByUserId: actor.userId,
          reason: dto.reason ?? null,
        },
      });

      await this.audit.record(
        {
          action: AUDIT_ACTIONS.PRODUCT_PRICE_CHANGED,
          resourceType: 'product',
          resourceId: productId,
          organizationId: product.organizationId,
          actorUserId: actor.userId,
          before: { basePriceAmount: product.basePriceAmount.toString() },
          after: { basePriceAmount: newAmount.toString() },
          reason: dto.reason ?? 'Changement de prix',
          requestId: context.requestId,
        },
        tx,
      );
    });

    return { price: toMoneyView(newAmount) };
  }

  /**
   * Declare une disponibilite ou une rupture.
   *
   * Politique de conflit hors ligne : derniere ecriture acceptee, avec audit
   * (specification section 16.4). Une ecriture plus ancienne que celle deja
   * enregistree est ignoree, sinon une file d'attente rejouee dans le desordre
   * remettrait un plat en rupture apres son retour en stock.
   */
  async setAvailability(
    actor: AuthenticatedActor,
    productId: string,
    dto: SetAvailabilityDto,
    context: { requestId: string },
  ): Promise<{ applied: boolean; status: string }> {
    const product = await this.loadProductInScope(actor, productId);

    const current = await this.prisma.productAvailability.findUnique({
      where: { productId_establishmentId: { productId, establishmentId: product.establishmentId } },
      select: { status: true, changedAt: true },
    });

    const changedAt = parseOptionalDate(dto.clientChangedAt) ?? this.clock.now();

    if (current && changedAt < current.changedAt) {
      return { applied: false, status: current.status };
    }

    const unavailableUntil = parseOptionalDate(dto.unavailableUntil);

    await this.prisma.$transaction(async (tx) => {
      await tx.productAvailability.upsert({
        where: { productId_establishmentId: { productId, establishmentId: product.establishmentId } },
        create: {
          productId,
          establishmentId: product.establishmentId,
          status: dto.status,
          unavailableUntil: unavailableUntil ?? null,
          reason: dto.reason ?? null,
          changedAt,
          changedByUserId: actor.userId,
        },
        update: {
          status: dto.status,
          unavailableUntil: unavailableUntil ?? null,
          reason: dto.reason ?? null,
          changedAt,
          changedByUserId: actor.userId,
        },
      });

      await this.audit.record(
        {
          action: AUDIT_ACTIONS.PRODUCT_AVAILABILITY_CHANGED,
          resourceType: 'product',
          resourceId: productId,
          organizationId: product.organizationId,
          actorUserId: actor.userId,
          before: current ?? undefined,
          after: { status: dto.status, unavailableUntil: unavailableUntil?.toISOString() ?? null },
          ...(dto.reason === undefined ? {} : { reason: dto.reason }),
          requestId: context.requestId,
        },
        tx,
      );

      await this.outbox.enqueue(
        {
          aggregateType: 'product',
          aggregateId: productId,
          eventType: OUTBOX_EVENTS.PRODUCT_AVAILABILITY_CHANGED,
          payload: { productId, establishmentId: product.establishmentId, status: dto.status },
        },
        tx,
      );
    });

    return { applied: true, status: dto.status };
  }

  async setProductStatus(
    actor: AuthenticatedActor,
    productId: string,
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
  ): Promise<void> {
    const product = await this.loadProductInScope(actor, productId);

    await this.prisma.product.update({ where: { id: productId }, data: { status } });

    await this.audit.record({
      action: AUDIT_ACTIONS.PRODUCT_UPDATED,
      resourceType: 'product',
      resourceId: productId,
      organizationId: product.organizationId,
      actorUserId: actor.userId,
      before: { status: product.status },
      after: { status },
    });
  }

  async publishMenu(
    actor: AuthenticatedActor,
    menuId: string,
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
    context: { requestId: string },
  ): Promise<void> {
    const menu = await this.assertMenuInScope(actor, menuId);

    await this.prisma.$transaction(async (tx) => {
      await tx.menu.update({
        where: { id: menuId },
        data: { status, publishedAt: status === 'PUBLISHED' ? this.clock.now() : null },
      });

      await this.audit.record(
        {
          action: AUDIT_ACTIONS.MENU_PUBLISHED,
          resourceType: 'menu',
          resourceId: menuId,
          organizationId: menu.organizationId,
          actorUserId: actor.userId,
          after: { status },
          requestId: context.requestId,
        },
        tx,
      );

      if (status === 'PUBLISHED') {
        await this.outbox.enqueue(
          {
            aggregateType: 'menu',
            aggregateId: menuId,
            eventType: OUTBOX_EVENTS.MENU_PUBLISHED,
            payload: { menuId, establishmentId: menu.establishmentId },
          },
          tx,
        );
      }
    });
  }

  async listMerchantProducts(
    actor: AuthenticatedActor,
    establishmentId: string,
  ): Promise<MerchantProductView[]> {
    await this.tenant.assertEstablishmentInScope(actor, establishmentId);

    const products = await this.prisma.product.findMany({
      where: { establishmentId, deletedAt: null },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        basePriceAmount: true,
        status: true,
        categoryId: true,
        preparationMinutes: true,
        vegetarian: true,
        halal: true,
        spicyLevel: true,
        availability: { select: { status: true } },
      },
    });

    return products.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: toMoneyView(product.basePriceAmount),
      status: product.status,
      categoryId: product.categoryId,
      availability: product.availability[0]?.status ?? 'AVAILABLE',
      preparationMinutes: product.preparationMinutes,
      vegetarian: product.vegetarian,
      halal: product.halal,
      spicyLevel: product.spicyLevel,
    }));
  }

  private async loadProductInScope(
    actor: AuthenticatedActor,
    productId: string,
  ): Promise<{
    id: string;
    organizationId: string;
    establishmentId: string;
    name: string;
    status: string;
    categoryId: string | null;
    basePriceAmount: bigint;
  }> {
    const organizationId = this.tenant.requireOrganization(actor);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        establishmentId: true,
        name: true,
        status: true,
        categoryId: true,
        basePriceAmount: true,
      },
    });

    if (!product) {
      throw new DomainError('NOT_FOUND', `Plat ${productId} hors du tenant ${organizationId}`);
    }

    await this.tenant.assertEstablishmentInScope(actor, product.establishmentId);

    return product;
  }

  private async assertMenuInScope(
    actor: AuthenticatedActor,
    menuId: string,
  ): Promise<{ organizationId: string; establishmentId: string }> {
    const organizationId = this.tenant.requireOrganization(actor);

    const menu = await this.prisma.menu.findFirst({
      where: { id: menuId, organizationId, deletedAt: null },
      select: { organizationId: true, establishmentId: true },
    });

    if (!menu) {
      throw new DomainError('NOT_FOUND', `Menu ${menuId} hors du tenant ${organizationId}`);
    }

    await this.tenant.assertEstablishmentInScope(actor, menu.establishmentId);

    return menu;
  }

  private async assertCategoryInScope(
    actor: AuthenticatedActor,
    categoryId: string,
    establishmentId: string,
  ): Promise<void> {
    const category = await this.prisma.menuCategory.findFirst({
      where: {
        id: categoryId,
        deletedAt: null,
        menu: { establishmentId, organizationId: this.tenant.requireOrganization(actor) },
      },
      select: { id: true },
    });

    if (!category) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `Categorie ${categoryId} etrangere a l'etablissement ${establishmentId}`,
        {
          publicDetail: "Cette categorie n'appartient pas a cet etablissement.",
          fields: [{ field: 'categoryId', code: 'OUT_OF_SCOPE', message: 'Categorie invalide.' }],
        },
      );
    }
  }
}

function parseOptionalDate(value: string | undefined): Date | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new DomainError('VALIDATION_FAILED', `Date illisible : ${value}`, {
      publicDetail: 'La date fournie est invalide.',
    });
  }

  return parsed;
}
