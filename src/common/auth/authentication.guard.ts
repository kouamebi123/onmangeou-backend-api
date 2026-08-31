import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError } from '../errors/domain.error';
import type { AppRequest } from '../http/request-context';
import { ActorResolverService } from './actor-resolver.service';
import { OPTIONAL_AUTH_METADATA, PUBLIC_ROUTE_METADATA } from './auth.decorators';
import { TokenService } from './token.service';

/**
 * Garde d'authentification applique globalement.
 *
 * Le defaut est securise : un endpoint non annote exige un jeton valide. Ouvrir
 * une route au public est donc une decision visible dans le code, ce qui evite
 * l'exposition accidentelle d'un endpoint sensible (specification section 22).
 */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly actors: ActorResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_METADATA, targets) ?? false;
    const isOptional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH_METADATA, targets) ?? false;

    const request = context.switchToHttp().getRequest<AppRequest>();
    const token = extractBearerToken(request);

    if (token === undefined) {
      if (isPublic || isOptional) {
        return true;
      }
      throw new DomainError('UNAUTHENTICATED', 'En-tete Authorization absente');
    }

    try {
      const claims = await this.tokens.verifyAccessToken(token);
      request.actor = await this.actors.resolve(claims, request.deviceInstallId);
      return true;
    } catch (error) {
      // Sur une route a authentification facultative, un jeton perime ne doit pas
      // casser la decouverte : la requete continue en visiteur anonyme.
      if (isOptional) {
        return true;
      }
      throw error;
    }
  }
}

function extractBearerToken(request: AppRequest): string | undefined {
  const header = request.header('authorization');

  if (!header) {
    return undefined;
  }

  const [scheme, value] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !value || value.length === 0) {
    return undefined;
  }

  return value;
}
