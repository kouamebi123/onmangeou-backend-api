import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DomainError } from '../../common/errors/domain.error';
import { Clock } from '../../common/time/clock';
import { toAmount } from '../../common/money/money';
import { normalizeIvorianPhone } from '../../common/identity/phone';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { TenantScopeService } from '../../common/auth/tenant-scope.service';
import { ROLE_CODES } from '../../common/auth/permissions';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OutboxService, OUTBOX_EVENTS } from '../../infrastructure/outbox/outbox.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { MODULE_CODES } from '../entitlements/module-codes';
import { findOverlappingSlots, type HoursSlot } from './opening-hours';
import { slugify, withSlugSuffix } from './slug';
import type { CreateEstablishmentDto, CreateOrganizationDto, UpdateEstablishmentDto } from './dto/merchant.dto';

/**
 * Organisations, etablissements, horaires et services.
 *
 * Reference : specification sections 3.2, 4.4 et 8.2.
 */
@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly tenant: TenantScopeService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Cree une organisation et rend son createur proprietaire.
   *
   * Le createur est immediatement `OWNER` et actif : sans cela il ne pourrait pas
   * poursuivre son propre onboarding. Le statut de l'organisation reste `DRAFT`
   * jusqu'a la verification par la plateforme (specification section 3.4).
   */
  async createOrganization(
    actor: AuthenticatedActor,
    dto: CreateOrganizationDto,
    context: { requestId: string },
  ): Promise<{ organizationId: string; slug: string }> {
    const existingOwnership = await this.prisma.organizationMember.findFirst({
      where: { userId: actor.userId, role: { code: ROLE_CODES.OWNER }, status: 'ACTIVE' },
      select: { organizationId: true },
    });

    if (existingOwnership) {
      throw new DomainError(
        'CONFLICT',
        `Utilisateur ${actor.userId} deja proprietaire de ${existingOwnership.organizationId}`,
        {
          publicDetail:
            'Vous gerez deja une organisation. Ajoutez un etablissement plutot que de creer une nouvelle organisation.',
        },
      );
    }

    const contactPhoneE164 = this.normalizePhoneOrFail(dto.contactPhone, 'contactPhone');
    const ownerRole = await this.requireRole(ROLE_CODES.OWNER);
    const slug = await this.allocateSlug(dto.name, 'organization');

    const organization = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: dto.name,
          slug,
          status: 'DRAFT',
          legalName: dto.legalName ?? null,
          taxId: dto.taxId ?? null,
          contactPhoneE164,
          contactEmail: dto.contactEmail ?? null,
          members: {
            create: {
              userId: actor.userId,
              roleId: ownerRole.id,
              status: 'ACTIVE',
              acceptedAt: this.clock.now(),
            },
          },
          // La vitrine de base est ouverte des la creation : sans elle, le
          // restaurant ne pourrait rien configurer avant son abonnement.
          moduleEntitlements: {
            create: {
              moduleCode: MODULE_CODES.STOREFRONT_BASIC,
              enabled: true,
              overrideReason: 'Vitrine de base ouverte a la creation',
            },
          },
        },
        select: { id: true, slug: true, name: true },
      });

      await this.audit.record(
        {
          action: AUDIT_ACTIONS.ORGANIZATION_CREATED,
          resourceType: 'organization',
          resourceId: created.id,
          organizationId: created.id,
          actorUserId: actor.userId,
          after: { name: created.name, slug: created.slug, status: 'DRAFT' },
          requestId: context.requestId,
        },
        tx,
      );

      await this.outbox.enqueue(
        {
          aggregateType: 'organization',
          aggregateId: created.id,
          eventType: OUTBOX_EVENTS.ORGANIZATION_CREATED,
          payload: { organizationId: created.id, ownerUserId: actor.userId },
        },
        tx,
      );

      return created;
    });

    return { organizationId: organization.id, slug: organization.slug };
  }

  /**
   * Cree un etablissement dans l'organisation active.
   *
   * Le createur y est automatiquement affecte : un proprietaire qui cree un site
   * sans y avoir acces serait immediatement bloque par le controle de perimetre.
   */
  async createEstablishment(
    actor: AuthenticatedActor,
    dto: CreateEstablishmentDto,
    context: { requestId: string },
  ): Promise<{ establishmentId: string; slug: string }> {
    const organizationId = this.tenant.requireOrganization(actor);

    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: actor.userId } },
      select: { id: true },
    });

    if (!membership) {
      throw new DomainError('FORBIDDEN', `Aucune appartenance a ${organizationId}`);
    }

    const existingCount = await this.prisma.establishment.count({
      where: { organizationId, deletedAt: null },
    });

    // Le multi-etablissements est un module payant (specification section 30).
    // Le premier site reste toujours possible.
    if (existingCount >= 1) {
      const multisite = await this.prisma.moduleEntitlement.findFirst({
        where: {
          organizationId,
          establishmentId: null,
          moduleCode: MODULE_CODES.ORGANIZATION_MULTISITE,
          enabled: true,
        },
        select: { id: true },
      });

      if (!multisite) {
        throw new DomainError(
          'MODULE_NOT_ENABLED',
          `Multi-etablissements inactif pour ${organizationId}`,
          {
            publicDetail:
              "La gestion de plusieurs etablissements n'est pas activee sur votre abonnement.",
          },
        );
      }
    }

    const slug = await this.allocateSlug(dto.name, 'establishment');
    const phoneE164 = dto.phone === undefined ? null : this.normalizePhoneOrFail(dto.phone, 'phone');

    const establishment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.establishment.create({
        data: {
          organizationId,
          name: dto.name,
          slug,
          status: 'DRAFT',
          description: dto.description ?? null,
          phoneE164,
          city: dto.city,
          district: dto.district ?? null,
          addressLine: dto.addressLine ?? null,
          landmarkText: dto.landmarkText ?? null,
          latitude: dto.latitude,
          longitude: dto.longitude,
          averagePreparationMinutes: dto.averagePreparationMinutes ?? null,
          stockMode: dto.stockMode ?? 'NONE',
          memberAssignments: { create: { memberId: membership.id } },
        },
        select: { id: true, slug: true, name: true, city: true },
      });

      await this.audit.record(
        {
          action: AUDIT_ACTIONS.ESTABLISHMENT_CREATED,
          resourceType: 'establishment',
          resourceId: created.id,
          organizationId,
          actorUserId: actor.userId,
          after: { name: created.name, city: created.city, slug: created.slug },
          requestId: context.requestId,
        },
        tx,
      );

      await this.outbox.enqueue(
        {
          aggregateType: 'establishment',
          aggregateId: created.id,
          eventType: OUTBOX_EVENTS.ESTABLISHMENT_CREATED,
          payload: { establishmentId: created.id, organizationId },
        },
        tx,
      );

      return created;
    });

    return { establishmentId: establishment.id, slug: establishment.slug };
  }

  async updateEstablishment(
    actor: AuthenticatedActor,
    establishmentId: string,
    dto: UpdateEstablishmentDto,
    context: { requestId: string },
  ): Promise<void> {
    const { organizationId } = await this.tenant.assertEstablishmentInScope(actor, establishmentId);

    const before = await this.prisma.establishment.findUniqueOrThrow({
      where: { id: establishmentId },
      select: {
        name: true,
        description: true,
        city: true,
        district: true,
        addressLine: true,
        landmarkText: true,
        latitude: true,
        longitude: true,
        stockMode: true,
        averagePreparationMinutes: true,
      },
    });

    const phoneE164 = dto.phone === undefined ? undefined : this.normalizePhoneOrFail(dto.phone, 'phone');

    await this.prisma.$transaction(async (tx) => {
      await tx.establishment.update({
        where: { id: establishmentId },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.description === undefined ? {} : { description: dto.description }),
          ...(phoneE164 === undefined ? {} : { phoneE164 }),
          ...(dto.city === undefined ? {} : { city: dto.city }),
          ...(dto.district === undefined ? {} : { district: dto.district }),
          ...(dto.addressLine === undefined ? {} : { addressLine: dto.addressLine }),
          ...(dto.landmarkText === undefined ? {} : { landmarkText: dto.landmarkText }),
          ...(dto.latitude === undefined ? {} : { latitude: dto.latitude }),
          ...(dto.longitude === undefined ? {} : { longitude: dto.longitude }),
          ...(dto.stockMode === undefined ? {} : { stockMode: dto.stockMode }),
          ...(dto.averagePreparationMinutes === undefined
            ? {}
            : { averagePreparationMinutes: dto.averagePreparationMinutes }),
        },
      });

      if (
        dto.hasTerrace !== undefined ||
        dto.hasAirConditioning !== undefined ||
        dto.accessible !== undefined
      ) {
        await tx.$executeRaw`
          UPDATE establishments SET
            has_terrace = COALESCE(${dto.hasTerrace ?? null}, has_terrace),
            has_air_conditioning = COALESCE(${dto.hasAirConditioning ?? null}, has_air_conditioning),
            accessible = COALESCE(${dto.accessible ?? null}, accessible),
            updated_at = NOW()
          WHERE id = ${establishmentId}::uuid
        `;
      }

      await this.audit.record(
        {
          action: AUDIT_ACTIONS.ESTABLISHMENT_UPDATED,
          resourceType: 'establishment',
          resourceId: establishmentId,
          organizationId,
          actorUserId: actor.userId,
          before,
          after: dto,
          requestId: context.requestId,
        },
        tx,
      );
    });
  }

  /**
   * Remplace integralement la grille d'horaires.
   *
   * Un remplacement complet plutot qu'un ajout incremental : une grille partielle
   * issue d'une synchronisation hors ligne interrompue produirait des horaires
   * publics faux, ce qui est pire qu'une absence d'horaires.
   */
  async listHours(actor: AuthenticatedActor, establishmentId: string) {
    await this.tenant.assertEstablishmentInScope(actor, establishmentId);
    return this.prisma.establishmentHours.findMany({
      where: { establishmentId },
      orderBy: [{ weekDay: 'asc' }, { opensAtMinutes: 'asc' }],
      select: { weekDay: true, opensAtMinutes: true, closesAtMinutes: true },
    });
  }

  async replaceHours(
    actor: AuthenticatedActor,
    establishmentId: string,
    slots: HoursSlot[],
    context: { requestId: string },
  ): Promise<void> {
    const { organizationId } = await this.tenant.assertEstablishmentInScope(actor, establishmentId);

    const overlapping = findOverlappingSlots(slots);

    if (overlapping.length > 0) {
      throw new DomainError('VALIDATION_FAILED', `Creneaux chevauchants : ${overlapping.length}`, {
        publicDetail: 'Deux creneaux du meme jour se chevauchent. Corrigez les horaires.',
        fields: overlapping.map((slot) => ({
          field: `slots.${slot.weekDay}`,
          code: 'OVERLAP',
          message: `Le creneau de ${slot.weekDay} chevauche le precedent.`,
        })),
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const before = await tx.establishmentHours.findMany({
        where: { establishmentId },
        select: { weekDay: true, opensAtMinutes: true, closesAtMinutes: true },
      });

      await tx.establishmentHours.deleteMany({ where: { establishmentId } });

      if (slots.length > 0) {
        await tx.establishmentHours.createMany({
          data: slots.map((slot) => ({
            establishmentId,
            weekDay: slot.weekDay,
            opensAtMinutes: slot.opensAtMinutes,
            closesAtMinutes: slot.closesAtMinutes,
          })),
        });
      }

      await this.audit.record(
        {
          action: AUDIT_ACTIONS.ESTABLISHMENT_HOURS_UPDATED,
          resourceType: 'establishment',
          resourceId: establishmentId,
          organizationId,
          actorUserId: actor.userId,
          before: { slots: before },
          after: { slots },
          requestId: context.requestId,
        },
        tx,
      );
    });
  }

  async replaceServices(
    actor: AuthenticatedActor,
    establishmentId: string,
    services: Array<{
      type: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'RESERVATION';
      enabled: boolean;
      minimumOrderAmount?: string;
      leadTimeMinutes?: number;
    }>,
  ): Promise<void> {
    await this.tenant.assertEstablishmentInScope(actor, establishmentId);

    await this.prisma.$transaction(async (tx) => {
      for (const service of services) {
        const minimumOrderAmount =
          service.minimumOrderAmount === undefined
            ? null
            : toAmount(service.minimumOrderAmount, 'montant minimum de commande');

        await tx.restaurantService.upsert({
          where: { establishmentId_type: { establishmentId, type: service.type } },
          create: {
            establishmentId,
            type: service.type,
            enabled: service.enabled,
            minimumOrderAmount,
            leadTimeMinutes: service.leadTimeMinutes ?? null,
          },
          update: {
            enabled: service.enabled,
            minimumOrderAmount,
            leadTimeMinutes: service.leadTimeMinutes ?? null,
          },
        });
      }
    });
  }

  /**
   * Publie un etablissement, le rendant visible du public.
   *
   * Conditions verifiees cote serveur : etablissement verifie, horaires
   * renseignes et au moins un menu publie contenant un plat publie. Un
   * restaurant visible sans menu ni horaires degraderait la confiance dans toute
   * la plateforme.
   */
  async publishEstablishment(
    actor: AuthenticatedActor,
    establishmentId: string,
    context: { requestId: string },
  ): Promise<void> {
    const { organizationId } = await this.tenant.assertEstablishmentInScope(actor, establishmentId);

    const establishment = await this.prisma.establishment.findUniqueOrThrow({
      where: { id: establishmentId },
      select: {
        status: true,
        verifiedAt: true,
        _count: { select: { hours: true } },
        menus: {
          where: { status: 'PUBLISHED', deletedAt: null },
          select: {
            id: true,
            categories: {
              where: { deletedAt: null },
              select: { products: { where: { status: 'PUBLISHED', deletedAt: null }, select: { id: true } } },
            },
          },
        },
      },
    });

    const blockers: string[] = [];

    if (establishment.verifiedAt === null) {
      blockers.push("l'etablissement n'est pas encore verifie");
    }

    if (establishment._count.hours === 0) {
      blockers.push('aucun horaire d\'ouverture n\'est renseigne');
    }

    const publishedProducts = establishment.menus.flatMap((menu) =>
      menu.categories.flatMap((category) => category.products),
    );

    if (publishedProducts.length === 0) {
      blockers.push('aucun plat publie');
    }

    if (blockers.length > 0) {
      throw new DomainError(
        'ESTABLISHMENT_NOT_PUBLISHED',
        `Publication refusee : ${blockers.join(' ; ')}`,
        {
          publicDetail: `Avant publication, il reste a completer : ${blockers.join(' ; ')}.`,
        },
      );
    }

    const now = this.clock.now();

    await this.prisma.$transaction(async (tx) => {
      await tx.establishment.update({
        where: { id: establishmentId },
        data: { status: 'PUBLISHED', publishedAt: now },
      });

      await this.audit.record(
        {
          action: AUDIT_ACTIONS.ESTABLISHMENT_PUBLISHED,
          resourceType: 'establishment',
          resourceId: establishmentId,
          organizationId,
          actorUserId: actor.userId,
          before: { status: establishment.status },
          after: { status: 'PUBLISHED' },
          requestId: context.requestId,
        },
        tx,
      );

      await this.outbox.enqueue(
        {
          aggregateType: 'establishment',
          aggregateId: establishmentId,
          eventType: OUTBOX_EVENTS.ESTABLISHMENT_PUBLISHED,
          payload: { establishmentId, organizationId },
        },
        tx,
      );
    });
  }

  async listEstablishments(actor: AuthenticatedActor): Promise<
    Array<{
      id: string;
      name: string;
      slug: string;
      status: string;
      description: string | null;
      phoneE164: string | null;
      city: string;
      district: string | null;
      addressLine: string | null;
      landmarkText: string | null;
      stockMode: string;
      averagePreparationMinutes: number | null;
      publishedAt: Date | null;
      verifiedAt: Date | null;
      hasTerrace: boolean;
      hasAirConditioning: boolean;
      accessible: boolean;
    }>
  > {
    const organizationId = this.tenant.requireOrganization(actor);

    const establishments = await this.prisma.establishment.findMany({
      where: {
        organizationId,
        deletedAt: null,
        // Un membre ne voit que ses etablissements (specification section 8.3).
        id: { in: actor.establishmentIds },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        description: true,
        phoneE164: true,
        city: true,
        district: true,
        addressLine: true,
        landmarkText: true,
        stockMode: true,
        averagePreparationMinutes: true,
        publishedAt: true,
        verifiedAt: true,
      },
    });

    const extras = await this.prisma.$queryRaw<
      Array<{
        id: string;
        has_terrace: boolean;
        has_air_conditioning: boolean;
        accessible: boolean;
      }>
    >`
      SELECT id, has_terrace, has_air_conditioning, accessible
      FROM establishments
      WHERE organization_id = ${organizationId}::uuid AND deleted_at IS NULL
    `;
    const extraById = new Map(extras.map((row) => [row.id, row]));

    return establishments.map((establishment) => {
      const extra = extraById.get(establishment.id);
      return {
        ...establishment,
        hasTerrace: extra?.has_terrace ?? false,
        hasAirConditioning: extra?.has_air_conditioning ?? false,
        accessible: extra?.accessible ?? false,
      };
    });
  }

  async listMembers(actor: AuthenticatedActor) {
    const organizationId = this.tenant.requireOrganization(actor);
    const rows = await this.prisma.organizationMember.findMany({
      where: { organizationId, revokedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        displayName: true,
        user: { select: { phoneE164: true, fullName: true } },
        role: { select: { code: true } },
        establishments: { select: { establishmentId: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      roleCode: row.role.code,
      displayName: row.displayName ?? row.user.fullName,
      phoneE164: row.user.phoneE164,
      establishmentIds: row.establishments.map((entry) => entry.establishmentId),
    }));
  }

  async inviteMember(
    actor: AuthenticatedActor,
    input: { phone: string; roleCode: string; displayName?: string; establishmentId?: string },
    context: { requestId: string },
  ): Promise<{ memberId: string; status: string }> {
    const organizationId = this.tenant.requireOrganization(actor);
    const allowedRoles = new Set(['MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'COURIER', 'ACCOUNTANT']);
    if (!allowedRoles.has(input.roleCode)) {
      throw new DomainError('VALIDATION_FAILED', `Role invite invalide : ${input.roleCode}`, {
        publicDetail: 'Ce role ne peut pas etre attribue depuis l’application.',
      });
    }

    const phoneE164 = this.normalizePhoneOrFail(input.phone, 'phone');
    const role = await this.requireRole(input.roleCode);
    let user = await this.prisma.user.findUnique({
      where: { phoneE164 },
      select: { id: true, status: true },
    });

    if (user?.status === 'SUSPENDED' || user?.status === 'ANONYMIZED') {
      throw new DomainError('FORBIDDEN', `Compte ${user.id} non inviteable`);
    }

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phoneE164,
          fullName: input.displayName?.trim() || null,
          status: 'PENDING',
          profile: { create: {} },
        },
        select: { id: true, status: true },
      });
    }

    const existing = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      select: { id: true, status: true, revokedAt: true },
    });
    if (existing && existing.status === 'ACTIVE' && existing.revokedAt === null) {
      throw new DomainError('CONFLICT', `Membre deja actif ${existing.id}`, {
        publicDetail: 'Cette personne fait deja partie de l’equipe.',
      });
    }

    const establishmentIds = input.establishmentId
      ? [input.establishmentId]
      : (
          await this.prisma.establishment.findMany({
            where: { organizationId, deletedAt: null },
            select: { id: true },
          })
        ).map((row) => row.id);

    if (input.establishmentId) {
      await this.tenant.assertEstablishmentInScope(actor, input.establishmentId);
    }

    const member = await this.prisma.$transaction(async (tx) => {
      const created = existing
        ? await tx.organizationMember.update({
            where: { id: existing.id },
            data: {
              roleId: role.id,
              status: 'ACTIVE',
              displayName: input.displayName?.trim() || null,
              acceptedAt: this.clock.now(),
              revokedAt: null,
            },
            select: { id: true, status: true },
          })
        : await tx.organizationMember.create({
            data: {
              organizationId,
              userId: user.id,
              roleId: role.id,
              status: 'ACTIVE',
              displayName: input.displayName?.trim() || null,
              acceptedAt: this.clock.now(),
            },
            select: { id: true, status: true },
          });

      if (establishmentIds.length > 0) {
        await tx.memberEstablishment.createMany({
          data: establishmentIds.map((establishmentId) => ({
            memberId: created.id,
            establishmentId,
          })),
          skipDuplicates: true,
        });
      }

      await this.audit.recordForActor(
        actor,
        {
          action: AUDIT_ACTIONS.MEMBER_INVITED,
          resourceType: 'organization_member',
          resourceId: created.id,
          organizationId,
          requestId: context.requestId,
          after: { roleCode: input.roleCode, phoneE164 },
        },
        tx,
      );

      return created;
    });

    return { memberId: member.id, status: member.status };
  }

  private async requireRole(code: string): Promise<{ id: string }> {
    const role = await this.prisma.role.findUnique({ where: { code }, select: { id: true } });

    if (!role) {
      // Les roles proviennent du seed : leur absence est une erreur de deploiement,
      // pas une erreur utilisateur.
      throw new DomainError('INTERNAL_ERROR', `Role ${code} absent : verifier le seed de reference`);
    }

    return role;
  }

  /**
   * Soumet un dossier de verification pour un etablissement.
   *
   * Un seul dossier ouvert a la fois : un second envoi renvoie le dossier
   * existant plutot que d'en creer un doublon (connexion faible).
   */
  async submitVerification(
    actor: AuthenticatedActor,
    establishmentId: string,
    context: { requestId: string },
  ): Promise<{ caseId: string; status: string }> {
    const { organizationId } = await this.tenant.assertEstablishmentInScope(actor, establishmentId);

    const existing = await this.prisma.verificationCase.findFirst({
      where: {
        establishmentId,
        status: { in: ['OPEN', 'IN_REVIEW'] },
      },
      select: { id: true, status: true },
    });

    if (existing) {
      return { caseId: existing.id, status: existing.status };
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const verification = await tx.verificationCase.create({
        data: {
          organizationId,
          establishmentId,
          status: 'OPEN',
        },
        select: { id: true, status: true },
      });

      await tx.establishment.update({
        where: { id: establishmentId },
        data: { status: 'PENDING_VERIFICATION' },
      });

      await this.audit.recordForActor(
        actor,
        {
          action: AUDIT_ACTIONS.ESTABLISHMENT_VERIFICATION_SUBMITTED,
          resourceType: 'verification_case',
          resourceId: verification.id,
          organizationId,
          requestId: context.requestId,
        },
        tx,
      );

      await this.outbox.enqueue(
        {
          aggregateType: 'verification_case',
          aggregateId: verification.id,
          eventType: OUTBOX_EVENTS.VERIFICATION_SUBMITTED,
          payload: { organizationId, establishmentId },
        },
        tx,
      );

      return verification;
    });

    return { caseId: created.id, status: created.status };
  }

  private normalizePhoneOrFail(raw: string, field: string): string {
    try {
      return normalizeIvorianPhone(raw).e164;
    } catch (error) {
      throw new DomainError('VALIDATION_FAILED', `Telephone invalide sur ${field}`, {
        publicDetail: 'Ce numero de telephone est incorrect.',
        fields: [
          {
            field,
            code: 'INVALID_PHONE',
            message: error instanceof Error ? error.message : 'Numero invalide.',
          },
        ],
      });
    }
  }

  /**
   * Reserve un slug unique.
   *
   * L'unicite est garantie par une contrainte en base ; cette boucle evite
   * seulement le va-et-vient d'une collision previsible sur un nom courant.
   */
  private async allocateSlug(name: string, kind: 'organization' | 'establishment'): Promise<string> {
    const base = slugify(name);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = attempt === 0 ? base : withSlugSuffix(base, randomBytes(3).toString('hex'));

      const taken =
        kind === 'organization'
          ? await this.prisma.organization.findUnique({ where: { slug: candidate }, select: { id: true } })
          : await this.prisma.establishment.findUnique({ where: { slug: candidate }, select: { id: true } });

      if (!taken) {
        return candidate;
      }
    }

    return withSlugSuffix(base, randomBytes(6).toString('hex'));
  }
}
