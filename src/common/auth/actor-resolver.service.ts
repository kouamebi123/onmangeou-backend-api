import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { DomainError } from '../errors/domain.error';
import { Clock } from '../time/clock';
import type { AuthenticatedActor } from './authenticated-actor';
import { PLATFORM_ROLE_PERMISSION_MATRIX } from './permissions';
import type { AccessTokenClaims } from './token.service';

/**
 * Reconstitue l'acteur autorise a partir d'un access token valide.
 *
 * Reference : specification sections 4.4 et 9.2.
 *
 * Le jeton prouve seulement l'identite et la session. Le tenant, le role, les
 * etablissements accessibles et les permissions sont relus en base a chaque
 * requete : une revocation de role doit prendre effet immediatement, sans
 * attendre l'expiration du jeton.
 */
@Injectable()
export class ActorResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async resolve(claims: AccessTokenClaims, deviceInstallId?: string): Promise<AuthenticatedActor> {
    const session = await this.prisma.session.findUnique({
      where: { id: claims.sid },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
        expiresAt: true,
        mfaSatisfiedAt: true,
        user: { select: { status: true } },
      },
    });

    if (!session || session.userId !== claims.sub) {
      throw new DomainError('UNAUTHENTICATED', 'Session absente ou detachee du jeton');
    }

    if (session.revokedAt !== null) {
      throw new DomainError('SESSION_EXPIRED', 'Session revoquee');
    }

    if (this.clock.isExpired(session.expiresAt)) {
      throw new DomainError('SESSION_EXPIRED', 'Session expiree');
    }

    if (session.user.status === 'SUSPENDED' || session.user.status === 'ANONYMIZED') {
      throw new DomainError('FORBIDDEN', `Compte non utilisable : ${session.user.status}`);
    }

    const actor: AuthenticatedActor = {
      userId: session.userId,
      sessionId: session.id,
      establishmentIds: [],
      permissions: new Set<string>(),
      ...(session.mfaSatisfiedAt === null ? {} : { mfaSatisfiedAt: session.mfaSatisfiedAt }),
      ...(deviceInstallId === undefined ? {} : { deviceInstallId }),
    };

    const withStaff = await this.withPlatformStaff(actor);

    if (claims.org === undefined) {
      return withStaff;
    }

    return this.withMembership(withStaff, claims.org);
  }

  /**
   * Charge le mandat interne s'il existe.
   *
   * Un administrateur n'a pas besoin d'organisation active : le tenant des
   * actions admin est la plateforme elle-meme, jamais un identifiant fourni
   * par le client.
   */
  private async withPlatformStaff(actor: AuthenticatedActor): Promise<AuthenticatedActor> {
    const staff = await this.prisma.platformStaff.findUnique({
      where: { userId: actor.userId },
      select: { role: true, revokedAt: true },
    });

    if (!staff || staff.revokedAt !== null) {
      return actor;
    }

    const extra = PLATFORM_ROLE_PERMISSION_MATRIX[staff.role];

    return {
      ...actor,
      platformRole: staff.role,
      permissions: new Set([...actor.permissions, ...extra]),
    };
  }

  /**
   * Charge l'appartenance a l'organisation demandee.
   *
   * L'organisation vient du jeton, jamais du corps de la requete. Une
   * appartenance absente ou revoquee produit un refus, meme si le jeton la
   * mentionne encore.
   */
  private async withMembership(
    actor: AuthenticatedActor,
    organizationId: string,
  ): Promise<AuthenticatedActor> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: actor.userId } },
      select: {
        status: true,
        role: {
          select: {
            code: true,
            permissions: { select: { permission: { select: { code: true } } } },
          },
        },
        establishments: { select: { establishmentId: true } },
        organization: { select: { status: true } },
      },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new DomainError('FORBIDDEN', `Appartenance inactive a l'organisation ${organizationId}`);
    }

    if (membership.organization.status === 'SUSPENDED') {
      throw new DomainError('FORBIDDEN', `Organisation suspendue : ${organizationId}`);
    }

    return {
      ...actor,
      organizationId,
      roleCode: membership.role.code,
      establishmentIds: membership.establishments.map((entry) => entry.establishmentId),
      permissions: new Set([
        ...actor.permissions,
        ...membership.role.permissions.map((entry) => entry.permission.code),
      ]),
    };
  }
}
