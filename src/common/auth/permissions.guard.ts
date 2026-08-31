import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError } from '../errors/domain.error';
import type { AppRequest } from '../http/request-context';
import { REQUIRED_PERMISSIONS_METADATA } from './auth.decorators';
import { REAUTH_REQUIRED_PERMISSIONS, type AnyPermissionCode } from './permissions';

/** Duree de validite d'une authentification forte pour une action sensible. */
const REAUTH_MAX_AGE_SECONDS = 15 * 60;

/**
 * Verifie les permissions atomiques de l'acteur (specification section 9.1).
 *
 * L'interface masque les actions interdites, mais la securite est ici : le
 * masquage cote client ne constitue jamais un controle (section 9.2).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AnyPermissionCode[] | undefined>(
      REQUIRED_PERMISSIONS_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AppRequest>();
    const actor = request.actor;

    if (!actor) {
      throw new DomainError('UNAUTHENTICATED', 'Permissions exigees sans acteur authentifie');
    }

    const missing = required.filter((permission) => !actor.permissions.has(permission));

    if (missing.length > 0) {
      throw new DomainError('FORBIDDEN', `Permissions manquantes : ${missing.join(', ')}`);
    }

    this.assertRecentAuthentication(required, actor.mfaSatisfiedAt);

    return true;
  }

  /**
   * Reauthentification pour remboursement, gestion des roles et export massif
   * (specification section 9.2). Un jeton vole ne suffit alors pas.
   */
  private assertRecentAuthentication(
    required: AnyPermissionCode[],
    mfaSatisfiedAt: Date | undefined,
  ): void {
    const sensitive = required.filter((permission) => REAUTH_REQUIRED_PERMISSIONS.has(permission));

    if (sensitive.length === 0) {
      return;
    }

    if (mfaSatisfiedAt === undefined) {
      throw new DomainError('REAUTHENTICATION_REQUIRED', `Action sensible sans MFA : ${sensitive.join(', ')}`);
    }

    const ageSeconds = (Date.now() - mfaSatisfiedAt.getTime()) / 1000;

    if (ageSeconds > REAUTH_MAX_AGE_SECONDS) {
      throw new DomainError(
        'REAUTHENTICATION_REQUIRED',
        `Authentification forte trop ancienne (${Math.round(ageSeconds)}s) pour ${sensitive.join(', ')}`,
      );
    }
  }
}
