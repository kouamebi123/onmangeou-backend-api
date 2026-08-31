import { Injectable } from '@nestjs/common';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { DomainError, validationFailed } from '../../common/errors/domain.error';
import { Clock } from '../../common/time/clock';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { toAmount, toMoneyView, type MoneyView } from '../../common/money/money';
import { ALL_MODULE_CODES, MODULE_CODES, MODULE_LABELS, type ModuleCode } from './module-codes';
import { quoteMonthlyAmount, type ModuleCatalogView } from './module-pricing';

export interface EntitlementsView {
  organizationId: string;
  establishmentId: string | null;
  subscriptionStatus: string | null;
  planCode: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  /** Modules effectivement utilisables maintenant. */
  enabledModules: ModuleCode[];
  modules: Array<{ code: ModuleCode; label: string; enabled: boolean; source: EntitlementSource }>;
  monthlyQuote: MoneyView;
  catalog: ModuleCatalogView;
}

export type EntitlementSource = 'plan' | 'override' | 'none';

/**
 * Calcul des droits fonctionnels.
 *
 * Reference : specification section 30.
 *
 * Ordre de resolution, du plus general au plus specifique :
 *   1. modules du plan de l'abonnement actif ;
 *   2. override par organisation ;
 *   3. override par etablissement.
 *
 * Un abonnement suspendu ou annule conserve les donnees mais bloque les
 * nouvelles operations : seule la vitrine de base reste active, pour que le
 * restaurant ne disparaisse pas brutalement du public le temps de regulariser.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly audit: AuditService,
  ) {}

  async resolve(organizationId: string, establishmentId?: string): Promise<EntitlementsView> {
    const now = this.clock.now();

    const subscription = await this.prisma.subscription.findFirst({
      where: { organizationId, status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] } },
      orderBy: { currentPeriodEnd: 'desc' },
      select: {
        status: true,
        trialEndsAt: true,
        currentPeriodEnd: true,
        plan: { select: { code: true, modules: { select: { moduleCode: true } } } },
      },
    });

    const overrides = await this.prisma.moduleEntitlement.findMany({
      where: {
        organizationId,
        effectiveFrom: { lte: now },
        // Une periode ouverte (`effectiveUntil` nul) reste active indefiniment.
        AND: [
          { OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }] },
          // Les overrides d'organisation (establishmentId nul) s'appliquent a
          // tous les sites ; ceux d'un site precis viennent s'y superposer.
          establishmentId === undefined
            ? { establishmentId: null }
            : { OR: [{ establishmentId: null }, { establishmentId }] },
        ],
      },
      select: { moduleCode: true, enabled: true, establishmentId: true },
      orderBy: { effectiveFrom: 'asc' },
    });

    const planModules = new Set<string>(subscription?.plan.modules.map((entry) => entry.moduleCode) ?? []);

    const subscriptionUsable = subscription !== null && this.isSubscriptionUsable(subscription.status);

    const overrideByModule = new Map<string, boolean>();

    // Les overrides d'organisation sont appliques avant ceux d'etablissement, de
    // sorte qu'un reglage par site prime sur le reglage global.
    for (const override of overrides.filter((entry) => entry.establishmentId === null)) {
      overrideByModule.set(override.moduleCode, override.enabled);
    }
    for (const override of overrides.filter((entry) => entry.establishmentId !== null)) {
      overrideByModule.set(override.moduleCode, override.enabled);
    }

    const modules = ALL_MODULE_CODES.map((code) => {
      // La vitrine reste toujours visible : un restaurant ne doit pas disparaitre
      // du catalogue ni perdre l'edition de sa fiche (specification section 30).
      if (code === MODULE_CODES.STOREFRONT_BASIC) {
        const override = overrideByModule.get(code);
        return {
          code,
          label: MODULE_LABELS[code],
          enabled: true,
          source:
            override !== undefined
              ? ('override' as const)
              : subscriptionUsable && planModules.has(code)
                ? ('plan' as const)
                : ('none' as const),
        };
      }

      const override = overrideByModule.get(code);

      if (override !== undefined) {
        return { code, label: MODULE_LABELS[code], enabled: override, source: 'override' as const };
      }

      const fromPlan = subscriptionUsable && planModules.has(code);

      return {
        code,
        label: MODULE_LABELS[code],
        enabled: fromPlan,
        source: fromPlan ? ('plan' as const) : ('none' as const),
      };
    });

    const catalog = await this.catalog();
    const prices = Object.fromEntries(
      catalog.modules.map((item) => [item.code, toAmount(item.monthlyPrice.amount, item.code)]),
    );

    return {
      organizationId,
      establishmentId: establishmentId ?? null,
      subscriptionStatus: subscription?.status ?? null,
      planCode: subscription?.plan.code ?? null,
      trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
      enabledModules: modules.filter((entry) => entry.enabled).map((entry) => entry.code),
      modules,
      monthlyQuote: toMoneyView(
        quoteMonthlyAmount(
          modules.filter((entry) => entry.enabled).map((entry) => entry.code),
          prices,
        ),
      ),
      catalog,
    };
  }

  async catalog(): Promise<ModuleCatalogView> {
    const [rows, billing] = await Promise.all([this.loadCatalogRows(), this.loadBillingSettings()]);
    return {
      currency: billing.currency,
      published: billing.published,
      notice: billing.notice,
      modules: rows.map((row) => ({
        code: row.module_code as ModuleCode,
        label: row.label,
        included: row.included,
        monthlyPrice: toMoneyView(toAmount(row.monthly_price_amount, row.module_code)),
      })),
    };
  }

  async setPlatformPrices(
    actor: AuthenticatedActor,
    payload: {
      notice?: string;
      modules: Array<{ code: string; monthlyPriceAmount: number; label?: string; included?: boolean }>;
    },
    context: { requestId: string },
  ): Promise<ModuleCatalogView> {
    const existing = await this.loadCatalogRows();
    const known = new Set(existing.map((row) => row.module_code));
    const seen = new Set<string>();

    for (const entry of payload.modules) {
      if (!known.has(entry.code)) {
        throw validationFailed([
          { field: 'modules', code: 'invalid', message: `Module inconnu : ${entry.code}` },
        ]);
      }
      if (!Number.isInteger(entry.monthlyPriceAmount) || entry.monthlyPriceAmount < 0) {
        throw validationFailed([
          {
            field: 'modules',
            code: 'invalid',
            message: 'Le prix mensuel doit être un entier FCFA positif ou nul.',
          },
        ]);
      }
      if (seen.has(entry.code)) {
        throw validationFailed([
          { field: 'modules', code: 'duplicate', message: `Module en double : ${entry.code}` },
        ]);
      }
      seen.add(entry.code);
    }

    const before = await this.catalog();

    await this.prisma.$transaction(async (tx) => {
      for (const entry of payload.modules) {
        const amount = BigInt(entry.monthlyPriceAmount);
        const label = entry.label?.trim();
        const included = entry.included ?? null;
        await tx.$executeRaw`
          UPDATE module_prices
          SET
            monthly_price_amount = ${amount},
            label = COALESCE(${label ?? null}, label),
            included = COALESCE(${included}, included),
            updated_by_user_id = ${actor.userId}::uuid,
            updated_at = NOW()
          WHERE module_code = ${entry.code}
        `;
      }

      await tx.$executeRaw`
        UPDATE platform_billing
        SET
          published = true,
          notice = COALESCE(${payload.notice ?? null}, notice),
          updated_by_user_id = ${actor.userId}::uuid,
          updated_at = NOW()
        WHERE id = 1
      `;

      await this.audit.record(
        {
          action: AUDIT_ACTIONS.MODULE_PRICES_UPDATED,
          resourceType: 'platform_billing',
          resourceId: '1',
          actorUserId: actor.userId,
          before,
          after: payload,
          reason: 'Publication du bareme d’abonnement',
          requestId: context.requestId,
        },
        tx,
      );
    });

    return this.catalog();
  }

  private async loadCatalogRows(): Promise<
    Array<{ module_code: string; label: string; included: boolean; monthly_price_amount: unknown }>
  > {
    return this.prisma.$queryRaw`
      SELECT module_code, label, included, monthly_price_amount
      FROM module_prices
      ORDER BY sort_order ASC, module_code ASC
    `;
  }

  private async loadBillingSettings(): Promise<{ currency: string; published: boolean; notice: string }> {
    const rows = await this.prisma.$queryRaw<Array<{ currency: string; published: boolean; notice: string }>>`
      SELECT currency, published, notice FROM platform_billing WHERE id = 1 LIMIT 1
    `;
    const row = rows[0];
    if (row === undefined) {
      throw new DomainError('INTERNAL_ERROR', 'Ligne platform_billing absente', {
        publicDetail: 'Le barème n’est pas encore initialisé en base.',
      });
    }
    return row;
  }

  async setOwnerModules(
    actor: AuthenticatedActor,
    modules: Array<{ code: string; enabled: boolean }>,
    context: { requestId: string },
  ): Promise<EntitlementsView> {
    const organizationId = actor.organizationId;
    if (!organizationId) {
      throw new DomainError('FORBIDDEN', 'Organisation absente pour le reglage des modules', {
        publicDetail: 'Creez d’abord votre organisation.',
      });
    }

    const known = new Set<string>(ALL_MODULE_CODES);
    for (const entry of modules) {
      if (!known.has(entry.code)) {
        throw validationFailed([
          { field: 'modules', code: 'invalid', message: `Module inconnu : ${entry.code}` },
        ]);
      }
      if (entry.code === MODULE_CODES.STOREFRONT_BASIC && !entry.enabled) {
        throw validationFailed([
          { field: 'modules', code: 'required', message: 'La vitrine de base ne peut pas être désactivée.' },
        ]);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const entry of modules) {
        const existing = await tx.moduleEntitlement.findFirst({
          where: { organizationId, establishmentId: null, moduleCode: entry.code },
          select: { id: true, enabled: true },
        });
        if (existing) {
          await tx.moduleEntitlement.update({
            where: { id: existing.id },
            data: {
              enabled: entry.enabled,
              overrideReason: 'Reglage par le proprietaire',
              overrideByUserId: actor.userId,
            },
          });
        } else {
          await tx.moduleEntitlement.create({
            data: {
              organizationId,
              moduleCode: entry.code,
              enabled: entry.enabled,
              overrideReason: 'Reglage par le proprietaire',
              overrideByUserId: actor.userId,
            },
          });
        }
      }

      await this.audit.record(
        {
          action: AUDIT_ACTIONS.MODULE_ENTITLEMENT_OVERRIDDEN,
          resourceType: 'organization',
          resourceId: organizationId,
          organizationId,
          actorUserId: actor.userId,
          after: { modules },
          reason: 'Reglage par le proprietaire',
          requestId: context.requestId,
        },
        tx,
      );
    });

    return this.resolve(organizationId);
  }

  async isModuleEnabled(
    organizationId: string,
    moduleCode: ModuleCode,
    establishmentId?: string,
  ): Promise<boolean> {
    const view = await this.resolve(organizationId, establishmentId);
    return view.enabledModules.includes(moduleCode);
  }

  /**
   * Refuse l'operation si le module n'est pas actif.
   *
   * Un module desactive ne doit produire aucun ecran ni blocage cote client
   * (specification section 14 et scenario obligatoire 6), mais le serveur reste
   * l'autorite : un client obsolete ne doit pas pouvoir contourner l'offre.
   */
  async assertModuleEnabled(
    organizationId: string,
    moduleCode: ModuleCode,
    establishmentId?: string,
  ): Promise<void> {
    if (!(await this.isModuleEnabled(organizationId, moduleCode, establishmentId))) {
      throw new DomainError('MODULE_NOT_ENABLED', `Module ${moduleCode} inactif pour ${organizationId}`, {
        publicDetail: `La fonction  ${MODULE_LABELS[moduleCode]}  n'est pas activee pour votre etablissement.`,
      });
    }
  }

  private isSubscriptionUsable(status: string): boolean {
    // PAST_DUE reste utilisable : couper l'exploitation d'un restaurant des le
    // premier retard de paiement serait disproportionne. La suspension effective
    // est une decision de la plateforme, materialisee par le statut SUSPENDED.
    return status === 'TRIALING' || status === 'ACTIVE' || status === 'PAST_DUE';
  }
}
