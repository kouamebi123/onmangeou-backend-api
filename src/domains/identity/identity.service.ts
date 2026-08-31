import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain.error';
import { Clock } from '../../common/time/clock';
import { normalizeIvorianPhone } from '../../common/identity/phone';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OutboxService, OUTBOX_EVENTS } from '../../infrastructure/outbox/outbox.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import type { DevicePlatform } from '../../infrastructure/prisma/generated/enums';

export interface UpsertDeviceInput {
  installId: string;
  platform: DevicePlatform;
  appVersion?: string;
  osVersion?: string;
  model?: string;
  pushToken?: string;
}

export interface UserProfileView {
  id: string;
  phoneE164: string;
  email: string | null;
  fullName: string | null;
  status: string;
  language: string;
  phoneVerified: boolean;
  avatarUrl: string | null;
  defaultCity: string | null;
  defaultDistrict: string | null;
  createdAt: Date;
  memberships: Array<{
    organizationId: string;
    organizationName: string;
    roleCode: string;
    establishmentIds: string[];
  }>;
  platformRole: 'ADMIN' | 'SUPPORT' | null;
}

/**
 * Comptes utilisateurs, appareils et consentements.
 *
 * Reference : specification sections 8.2, 21.1 et 23.
 */
@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Cree ou retrouve un compte apres verification d'un code OTP.
   *
   * La creation implicite est voulue : le compte n'est demande qu'au moment d'une
   * action persistante, et le telephone verifie suffit a l'identifier
   * (specification section 21.1).
   */
  async findOrCreateByVerifiedPhone(input: {
    phoneE164: string;
    requestId?: string;
    ipTruncated?: string;
  }): Promise<{ userId: string; created: boolean }> {
    const now = this.clock.now();

    const existing = await this.prisma.user.findUnique({
      where: { phoneE164: input.phoneE164 },
      select: { id: true, status: true },
    });

    if (existing) {
      if (existing.status === 'SUSPENDED') {
        throw new DomainError('FORBIDDEN', `Compte suspendu : ${existing.id}`);
      }

      if (existing.status === 'ANONYMIZED') {
        throw new DomainError('FORBIDDEN', `Compte anonymise : ${existing.id}`);
      }

      await this.prisma.user.update({
        where: { id: existing.id },
        data: { lastLoginAt: now, phoneVerifiedAt: now, status: 'ACTIVE' },
      });

      return { userId: existing.id, created: false };
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          phoneE164: input.phoneE164,
          status: 'ACTIVE',
          phoneVerifiedAt: now,
          lastLoginAt: now,
          profile: { create: {} },
          authIdentities: {
            create: { type: 'PHONE', identifier: input.phoneE164, verifiedAt: now },
          },
        },
        select: { id: true },
      });

      await this.outbox.enqueue(
        {
          aggregateType: 'user',
          aggregateId: user.id,
          eventType: OUTBOX_EVENTS.USER_REGISTERED,
          payload: { userId: user.id },
        },
        tx,
      );

      return user;
    });

    return { userId: created.id, created: true };
  }

  /**
   * Enregistre l'appareil courant.
   *
   * L'identifiant d'installation est stable : il permet de rattacher les sessions
   * a un appareil, de signaler un nouvel appareil et de cibler les notifications
   * push (specification sections 8.2 et 21.2).
   */
  async upsertDevice(input: UpsertDeviceInput & { userId?: string }): Promise<{ deviceId: string }> {
    const now = this.clock.now();

    const device = await this.prisma.device.upsert({
      where: { installId: input.installId },
      create: {
        installId: input.installId,
        platform: input.platform,
        appVersion: input.appVersion ?? null,
        osVersion: input.osVersion ?? null,
        model: input.model ?? null,
        pushToken: input.pushToken ?? null,
        pushTokenAt: input.pushToken ? now : null,
        userId: input.userId ?? null,
        lastSeenAt: now,
      },
      update: {
        platform: input.platform,
        appVersion: input.appVersion ?? null,
        osVersion: input.osVersion ?? null,
        lastSeenAt: now,
        ...(input.userId === undefined ? {} : { userId: input.userId }),
        ...(input.pushToken === undefined ? {} : { pushToken: input.pushToken, pushTokenAt: now }),
      },
      select: { id: true },
    });

    return { deviceId: device.id };
  }

  async getProfile(userId: string): Promise<UserProfileView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phoneE164: true,
        email: true,
        fullName: true,
        status: true,
        language: true,
        phoneVerifiedAt: true,
        createdAt: true,
        profile: { select: { avatarUrl: true, defaultCity: true, defaultDistrict: true } },
        memberships: {
          where: { status: 'ACTIVE' },
          select: {
            organizationId: true,
            organization: { select: { name: true } },
            role: { select: { code: true } },
            establishments: { select: { establishmentId: true } },
          },
        },
        platformStaff: { select: { role: true, revokedAt: true } },
      },
    });

    if (!user) {
      throw new DomainError('NOT_FOUND', `Utilisateur ${userId} introuvable`);
    }

    return {
      id: user.id,
      phoneE164: user.phoneE164,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      language: user.language,
      phoneVerified: user.phoneVerifiedAt !== null,
      avatarUrl: user.profile?.avatarUrl ?? null,
      defaultCity: user.profile?.defaultCity ?? null,
      defaultDistrict: user.profile?.defaultDistrict ?? null,
      createdAt: user.createdAt,
      memberships: user.memberships.map((membership) => ({
        organizationId: membership.organizationId,
        organizationName: membership.organization.name,
        roleCode: membership.role.code,
        establishmentIds: membership.establishments.map((entry) => entry.establishmentId),
      })),
      platformRole:
        user.platformStaff && user.platformStaff.revokedAt === null ? user.platformStaff.role : null,
    };
  }

  async updateProfile(
    userId: string,
    input: { fullName?: string; email?: string; language?: string; defaultCity?: string; defaultDistrict?: string },
  ): Promise<UserProfileView> {
    if (input.email !== undefined) {
      const conflict = await this.prisma.user.findFirst({
        where: { email: input.email, id: { not: userId } },
        select: { id: true },
      });

      if (conflict) {
        throw new DomainError('CONFLICT', 'Adresse e-mail deja utilisee', {
          publicDetail: 'Cette adresse e-mail est deja associee a un autre compte.',
          fields: [{ field: 'email', code: 'ALREADY_USED', message: 'Cette adresse e-mail est deja utilisee.' }],
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(input.fullName === undefined ? {} : { fullName: input.fullName }),
          ...(input.email === undefined ? {} : { email: input.email }),
          ...(input.language === undefined ? {} : { language: input.language }),
        },
      });

      if (input.defaultCity !== undefined || input.defaultDistrict !== undefined) {
        await tx.userProfile.update({
          where: { userId },
          data: {
            ...(input.defaultCity === undefined ? {} : { defaultCity: input.defaultCity }),
            ...(input.defaultDistrict === undefined ? {} : { defaultDistrict: input.defaultDistrict }),
          },
        });
      }
    });

    return this.getProfile(userId);
  }

  /**
   * Anonymise un compte a la demande de son titulaire.
   *
   * La suppression physique est refusee : l'historique financier et les
   * obligations de conservation subsistent (specification sections 8.3 et 23).
   * Le telephone est remplace par une valeur non attribuable mais unique, afin de
   * ne pas violer la contrainte d'unicite et de ne pas liberer le numero pour une
   * usurpation ulterieure.
   */
  async anonymizeAccount(actor: AuthenticatedActor, reason: string): Promise<void> {
    const now = this.clock.now();
    const placeholder = `+225000${actor.userId.replace(/\D/g, '').slice(0, 7).padEnd(7, '0')}`;

    await this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({
        where: { id: actor.userId },
        select: { status: true, email: true, fullName: true },
      });

      await tx.user.update({
        where: { id: actor.userId },
        data: {
          status: 'ANONYMIZED',
          anonymizedAt: now,
          phoneE164: placeholder,
          email: null,
          fullName: null,
          deletedAt: now,
        },
      });

      await tx.userProfile.updateMany({
        where: { userId: actor.userId },
        data: { avatarUrl: null, displayName: null, defaultCity: null, defaultDistrict: null },
      });

      await tx.session.updateMany({
        where: { userId: actor.userId, revokedAt: null },
        data: { revokedAt: now, revokedCause: 'account_anonymized' },
      });

      await tx.device.updateMany({
        where: { userId: actor.userId },
        data: { pushToken: null, userId: null },
      });

      await this.audit.record(
        {
          action: AUDIT_ACTIONS.ACCOUNT_ANONYMIZED,
          resourceType: 'user',
          resourceId: actor.userId,
          actorUserId: actor.userId,
          before: before ?? undefined,
          after: { status: 'ANONYMIZED' },
          reason,
        },
        tx,
      );
    });
  }

  async listConsents(userId: string) {
    return this.prisma.$queryRaw<
      Array<{ type: string; granted: boolean; policy_version: string; granted_at: Date }>
    >`
      SELECT DISTINCT ON (type) type, granted, policy_version, granted_at
      FROM consents
      WHERE user_id = ${userId}::uuid
      ORDER BY type, granted_at DESC
    `;
  }

  async setConsent(userId: string, type: 'TERMS' | 'PRIVACY' | 'MARKETING' | 'LOCATION', granted: boolean) {
    await this.prisma.$executeRaw`
      INSERT INTO consents (id, user_id, type, policy_version, granted, source, granted_at, created_at)
      VALUES (
        ${randomUUID()}::uuid, ${userId}::uuid, ${type}::"ConsentType", '1.0', ${granted}, 'app', NOW(), NOW()
      )
    `;
    return { type, granted };
  }

  /** Normalise et valide un numero saisi par un utilisateur. */
  normalizePhone(raw: string): string {
    try {
      return normalizeIvorianPhone(raw).e164;
    } catch (error) {
      throw new DomainError('VALIDATION_FAILED', `Telephone invalide : ${raw.length} caracteres`, {
        publicDetail: 'Ce numero de telephone est incorrect.',
        fields: [
          {
            field: 'phone',
            code: 'INVALID_PHONE',
            message: error instanceof Error ? error.message : 'Numero invalide.',
          },
        ],
      });
    }
  }
}
