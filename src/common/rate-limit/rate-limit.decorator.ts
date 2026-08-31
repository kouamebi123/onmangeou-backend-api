import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_METADATA = 'onmangeou:rate-limit';

/**
 * Dimension de comptage.
 *
 * La specification section 10.1 exige une limitation par IP, utilisateur,
 * appareil et operation couteuse. Un endpoint peut cumuler plusieurs dimensions :
 * une limite par IP protege des inconnus, une limite par utilisateur protege
 * d'un compte compromis derriere plusieurs adresses.
 */
export type RateLimitDimension = 'ip' | 'user' | 'device' | 'destination';

export interface RateLimitRule {
  dimension: RateLimitDimension;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitOptions {
  /** Nom court identifiant l'operation dans la cle Redis et les metriques. */
  name: string;
  rules: RateLimitRule[];
}

export const RateLimit = (options: RateLimitOptions): MethodDecorator & ClassDecorator =>
  SetMetadata(RATE_LIMIT_METADATA, options);
