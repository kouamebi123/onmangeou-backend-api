import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../infrastructure/prisma/generated/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { APP_LOGGER, type AppLogger } from '../../common/logging/app-logger';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';

/**
 * Journal d'audit append-only (specification sections 22.1 et 31).
 *
 * Sont journalises : connexion sensible, roles, prix, menu publie, annulation,
 * remise, caisse, depense, remboursement, paiement, abonnement, export,
 * consultation administrative sensible et moderation.
 *
 * Le journal est separe des logs techniques et protege en base par un
 * declencheur qui refuse UPDATE et DELETE.
 */

export const AUDIT_ACTIONS = {
  AUTH_OTP_REQUESTED: 'auth.otp.requested',
  AUTH_OTP_VERIFIED: 'auth.otp.verified',
  AUTH_OTP_FAILED: 'auth.otp.failed',
  AUTH_SESSION_REFRESHED: 'auth.session.refreshed',
  AUTH_SESSION_REVOKED: 'auth.session.revoked',
  AUTH_TOKEN_REPLAY_DETECTED: 'auth.token.replay_detected',
  ACCOUNT_ANONYMIZED: 'account.anonymized',
  ORGANIZATION_CREATED: 'organization.created',
  ESTABLISHMENT_CREATED: 'establishment.created',
  ESTABLISHMENT_UPDATED: 'establishment.updated',
  ESTABLISHMENT_HOURS_UPDATED: 'establishment.hours.updated',
  ESTABLISHMENT_PUBLISHED: 'establishment.published',
  ESTABLISHMENT_VERIFICATION_SUBMITTED: 'establishment.verification.submitted',
  ESTABLISHMENT_VERIFICATION_DECIDED: 'establishment.verification.decided',
  MEMBER_INVITED: 'member.invited',
  MEMBER_ROLE_CHANGED: 'member.role.changed',
  MENU_CREATED: 'menu.created',
  MENU_PUBLISHED: 'menu.published',
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_PRICE_CHANGED: 'product.price.changed',
  PRODUCT_AVAILABILITY_CHANGED: 'product.availability.changed',
  MODULE_ENTITLEMENT_OVERRIDDEN: 'module.entitlement.overridden',
  MODULE_PRICES_UPDATED: 'module.prices.updated',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditEntryInput {
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  organizationId?: string;
  actorUserId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  requestId?: string;
  ipTruncated?: string;
  deviceInstallId?: string;
}

/** Transaction Prisma ou client racine : l'audit suit la transaction metier. */
type PrismaLike = Pick<PrismaService, 'auditLog'>;

/**
 * Champs jamais journalises, meme dans un etat avant/apres.
 *
 * Un audit doit permettre de reconstituer une decision, pas de rejouer un
 * secret (specification section 22).
 */
const SENSITIVE_KEYS = new Set([
  'code',
  'codeHash',
  'otp',
  'password',
  'secretHash',
  'refreshToken',
  'refreshTokenHash',
  'accessToken',
  'token',
  'pin',
  'cardNumber',
  'cvv',
  'storageKey',
]);

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  /**
   * Enregistre une entree d'audit.
   *
   * Lorsqu'un client de transaction est fourni, l'audit est valide ou annule avec
   * l'operation metier : une action reussie sans trace, ou une trace sans action,
   * seraient toutes deux fausses.
   */
  async record(input: AuditEntryInput, tx?: PrismaLike): Promise<void> {
    const client = tx ?? this.prisma;

    try {
      await client.auditLog.create({
        data: {
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId ?? null,
          organizationId: input.organizationId ?? null,
          actorUserId: input.actorUserId ?? null,
          // Prisma distingue  colonne SQL NULL  (DbNull) de  valeur JSON null  :
          // l'absence d'etat doit etre un NULL SQL, filtrable en base.
          beforeState: redact(input.before) ?? Prisma.DbNull,
          afterState: redact(input.after) ?? Prisma.DbNull,
          reason: input.reason ?? null,
          requestId: input.requestId ?? null,
          ipTruncated: input.ipTruncated ?? null,
          deviceInstallId: input.deviceInstallId ?? null,
        },
      });
    } catch (error) {
      // Hors transaction, un echec d'audit ne doit pas masquer l'operation reussie,
      // mais il doit declencher une alerte : un trou dans le journal est un
      // incident de conformite.
      this.logger.error("Echec d'ecriture du journal d'audit", {
        action: input.action,
        resourceType: input.resourceType,
        detail: error instanceof Error ? error.message : undefined,
      });

      if (tx) {
        throw error;
      }
    }
  }

  /** Variante pratique lorsque l'acteur authentifie est disponible. */
  async recordForActor(
    actor: AuthenticatedActor,
    input: Omit<AuditEntryInput, 'actorUserId' | 'organizationId'> & { organizationId?: string },
    tx?: PrismaLike,
  ): Promise<void> {
    await this.record(
      {
        ...input,
        actorUserId: actor.userId,
        organizationId: input.organizationId ?? actor.organizationId,
        ...(actor.deviceInstallId === undefined ? {} : { deviceInstallId: actor.deviceInstallId }),
      },
      tx,
    );
  }
}

function redact(value: unknown): Prisma.InputJsonObject | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'object') {
    return { value: normalizeScalar(value) };
  }

  return redactObject(value as Record<string, unknown>);
}

function redactObject(source: Record<string, unknown>): Prisma.InputJsonObject {
  const output: Record<string, Prisma.InputJsonValue | null> = {};

  for (const [key, entry] of Object.entries(source)) {
    if (SENSITIVE_KEYS.has(key)) {
      output[key] = '[expurge]';
      continue;
    }

    if (typeof entry === 'bigint') {
      output[key] = entry.toString();
      continue;
    }

    if (entry instanceof Date) {
      output[key] = entry.toISOString();
      continue;
    }

    if (Array.isArray(entry)) {
      output[key] = entry.map((item) =>
        typeof item === 'object' && item !== null
          ? redactObject(item as Record<string, unknown>)
          : normalizeScalar(item),
      );
      continue;
    }

    if (typeof entry === 'object' && entry !== null) {
      output[key] = redactObject(entry as Record<string, unknown>);
      continue;
    }

    output[key] = normalizeScalar(entry);
  }

  return output;
}

/**
 * Reduit une valeur inconnue a un scalaire JSON.
 *
 * Une fonction, un symbole ou une instance de classe n'a pas de representation
 * JSON utile : la journaliser sous forme de chaine reste plus informatif qu'un
 * champ absent.
 */
function normalizeScalar(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  return `[${typeof value} non serialisable]`;
}
