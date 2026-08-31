import { Inject, Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { AppConfigService } from '../../common/config/app-config.service';
import { DomainError } from '../../common/errors/domain.error';
import { Clock } from '../../common/time/clock';
import { generateOpaqueToken, hashHighEntropySecret } from '../../common/security/hashing';
import { TokenService } from '../../common/auth/token.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { APP_LOGGER, type AppLogger } from '../../common/logging/app-logger';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';

export interface IssuedTokenPair {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  sessionId: string;
}

export interface CreateSessionInput {
  userId: string;
  organizationId?: string;
  deviceId?: string;
  userAgent?: string;
  ipTruncated?: string;
  requestId?: string;
  /** Vrai lorsqu'un facteur fort vient d'etre verifie (OTP, MFA). */
  strongAuthentication: boolean;
}

/**
 * Cycle de vie des sessions et rotation des refresh tokens.
 *
 * Reference : specification section 21.3.
 *
 * Le refresh token est un secret opaque stocke hashe, rotatif a chaque usage.
 * Chaque session appartient a une famille : si un jeton deja consomme est
 * represente, la famille entiere est revoquee. C'est la contre-mesure standard
 * au vol de refresh token, car un attaquant et l'utilisateur legitime ne peuvent
 * pas utiliser la meme chaine sans que l'un des deux rejoue un jeton.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly clock: Clock,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  async create(input: CreateSessionInput): Promise<IssuedTokenPair> {
    if (input.organizationId !== undefined) {
      await this.assertActiveMembership(input.userId, input.organizationId);
    }

    const refreshToken = generateOpaqueToken();
    const familyId = uuidv7();

    const session = await this.prisma.session.create({
      data: {
        userId: input.userId,
        familyId,
        refreshTokenHash: this.hashRefresh(refreshToken),
        expiresAt: this.refreshExpiry(),
        deviceId: input.deviceId ?? null,
        userAgent: input.userAgent?.slice(0, 512) ?? null,
        ipTruncated: input.ipTruncated ?? null,
        mfaSatisfiedAt: input.strongAuthentication ? this.clock.now() : null,
      },
      select: { id: true, expiresAt: true, mfaSatisfiedAt: true },
    });

    return this.issuePair({
      sessionId: session.id,
      userId: input.userId,
      refreshToken,
      refreshTokenExpiresAt: session.expiresAt,
      ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId }),
      ...(session.mfaSatisfiedAt === null ? {} : { mfaSatisfiedAt: session.mfaSatisfiedAt }),
    });
  }

  /**
   * Rotation du refresh token.
   *
   * L'ancienne session est revoquee et remplacee par une nouvelle ligne liee par
   * `replacedById`, ce qui conserve la chaine complete pour l'audit.
   */
  async refresh(input: {
    refreshToken: string;
    organizationId?: string;
    ipTruncated?: string;
    requestId?: string;
  }): Promise<IssuedTokenPair> {
    const hash = this.hashRefresh(input.refreshToken);

    const existing = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hash },
      select: {
        id: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
        deviceId: true,
        userAgent: true,
        mfaSatisfiedAt: true,
        replacedById: true,
      },
    });

    if (!existing) {
      throw new DomainError('SESSION_EXPIRED', 'Refresh token inconnu');
    }

    // Un jeton deja remplace qui revient signale une reutilisation : la famille
    // entiere devient suspecte (specification section 21.3).
    if (existing.revokedAt !== null || existing.replacedById !== null) {
      await this.revokeFamily(existing.familyId, 'refresh_token_replay');

      await this.audit.record({
        action: AUDIT_ACTIONS.AUTH_TOKEN_REPLAY_DETECTED,
        resourceType: 'session',
        resourceId: existing.id,
        actorUserId: existing.userId,
        reason: 'Refresh token deja utilise : famille revoquee',
        ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
        ...(input.ipTruncated === undefined ? {} : { ipTruncated: input.ipTruncated }),
      });

      this.logger.warn('Reutilisation de refresh token detectee', {
        sessionId: existing.id,
        familyId: existing.familyId,
        domain: 'identity',
      });

      throw new DomainError('SESSION_EXPIRED', `Refresh token rejoue sur la session ${existing.id}`);
    }

    if (this.clock.isExpired(existing.expiresAt)) {
      throw new DomainError('SESSION_EXPIRED', `Session ${existing.id} expiree`);
    }

    if (input.organizationId !== undefined) {
      await this.assertActiveMembership(existing.userId, input.organizationId);
    }

    const nextToken = generateOpaqueToken();
    const now = this.clock.now();

    const rotated = await this.prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          userId: existing.userId,
          familyId: existing.familyId,
          refreshTokenHash: this.hashRefresh(nextToken),
          expiresAt: this.refreshExpiry(),
          deviceId: existing.deviceId,
          userAgent: existing.userAgent,
          ipTruncated: input.ipTruncated ?? null,
          mfaSatisfiedAt: existing.mfaSatisfiedAt,
        },
        select: { id: true, expiresAt: true, mfaSatisfiedAt: true },
      });

      await tx.session.update({
        where: { id: existing.id },
        data: { revokedAt: now, revokedCause: 'rotated', replacedById: created.id, lastUsedAt: now },
      });

      return created;
    });

    return this.issuePair({
      sessionId: rotated.id,
      userId: existing.userId,
      refreshToken: nextToken,
      refreshTokenExpiresAt: rotated.expiresAt,
      ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId }),
      ...(rotated.mfaSatisfiedAt === null ? {} : { mfaSatisfiedAt: rotated.mfaSatisfiedAt }),
    });
  }

  async revoke(sessionId: string, cause: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: this.clock.now(), revokedCause: cause },
    });
  }

  async revokeFamily(familyId: string, cause: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: this.clock.now(), revokedCause: cause },
    });
  }

  async listActiveSessions(userId: string): Promise<
    Array<{
      id: string;
      createdAt: Date;
      lastUsedAt: Date | null;
      userAgent: string | null;
      platform: string | null;
    }>
  > {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: this.clock.now() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        userAgent: true,
        device: { select: { platform: true } },
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      userAgent: session.userAgent,
      platform: session.device?.platform ?? null,
    }));
  }

  private async issuePair(input: {
    sessionId: string;
    userId: string;
    refreshToken: string;
    refreshTokenExpiresAt: Date;
    organizationId?: string;
    mfaSatisfiedAt?: Date;
  }): Promise<IssuedTokenPair> {
    const access = await this.tokens.issueAccessToken({
      userId: input.userId,
      sessionId: input.sessionId,
      ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId }),
      ...(input.mfaSatisfiedAt === undefined ? {} : { mfaSatisfiedAt: input.mfaSatisfiedAt }),
    });

    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: input.refreshToken,
      refreshTokenExpiresAt: input.refreshTokenExpiresAt,
      sessionId: input.sessionId,
    };
  }

  /**
   * L'organisation active vient du jeton, jamais d'un identifiant accepte
   * aveuglement (specification section 4.4). Une appartenance absente ou
   * revoquee est un refus, pas un jeton "vide" qui semblerait valide.
   */
  private async assertActiveMembership(userId: string, organizationId: string): Promise<void> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { status: true, organization: { select: { status: true } } },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new DomainError('FORBIDDEN', `Appartenance absente a l'organisation ${organizationId}`);
    }

    if (membership.organization.status === 'SUSPENDED') {
      throw new DomainError('FORBIDDEN', `Organisation suspendue : ${organizationId}`);
    }
  }

  private hashRefresh(token: string): string {
    return hashHighEntropySecret(token, this.config.otp.pepper);
  }

  private refreshExpiry(): Date {
    return this.clock.plusSeconds(this.config.jwt.refreshTokenTtlSeconds);
  }
}
