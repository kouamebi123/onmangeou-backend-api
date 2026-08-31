import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import { DomainError } from '../errors/domain.error';
import type { AppRequest } from '../http/request-context';
import type { AuthenticatedActor } from './authenticated-actor';
import type { AnyPermissionCode } from './permissions';

export const PUBLIC_ROUTE_METADATA = 'onmangeou:public-route';
export const OPTIONAL_AUTH_METADATA = 'onmangeou:optional-auth';
export const REQUIRED_PERMISSIONS_METADATA = 'onmangeou:required-permissions';

/**
 * Route accessible sans compte.
 *
 * La decouverte doit fonctionner sans creation de compte (principe non
 * negociable 2). Le marquage est explicite : par defaut, tout endpoint exige une
 * authentification.
 */
export const PublicRoute = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PUBLIC_ROUTE_METADATA, true);

/**
 * Route publique enrichie si un jeton valide est presente.
 *
 * Utilisee pour la decouverte : un visiteur anonyme voit les restaurants, un
 * utilisateur connecte voit en plus ses favoris.
 */
export const OptionalAuth = (): MethodDecorator & ClassDecorator =>
  SetMetadata(OPTIONAL_AUTH_METADATA, true);

/** Exige des permissions atomiques (specification section 9.1). */
export const RequirePermissions = (...permissions: AnyPermissionCode[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSIONS_METADATA, permissions);

/** Injecte l'acteur resolu cote serveur. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedActor => {
    const request = context.switchToHttp().getRequest<AppRequest>();

    if (!request.actor) {
      throw new DomainError('UNAUTHENTICATED', 'Acteur absent du contexte de requete');
    }

    return request.actor;
  },
);

/** Injecte l'acteur s'il existe, sans exiger l'authentification. */
export const OptionalActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedActor | undefined =>
    context.switchToHttp().getRequest<AppRequest>().actor,
);
