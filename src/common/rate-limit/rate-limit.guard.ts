import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { AppConfigService } from '../config/app-config.service';
import { DomainError } from '../errors/domain.error';
import type { AppRequest } from '../http/request-context';
import { APP_LOGGER, type AppLogger } from '../logging/app-logger';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { RATE_LIMIT_METADATA, type RateLimitOptions, type RateLimitRule } from './rate-limit.decorator';

/**
 * Limitation de debit adossee a Redis (specification section 10.1).
 *
 * Choix d'implementation : `@nestjs/throttler` ne declare pas encore NestJS 12
 * en pair et ne gere qu'une dimension par garde. La specification exige un
 * comptage simultane par IP, utilisateur, appareil et destination, ce que ce
 * garde realise en une seule passe. Voir docs/adr/0003.
 *
 * Degradation controlee : si Redis est indisponible, la requete passe et un
 * avertissement est journalise. Bloquer tout le trafic parce que le cache est
 * tombe serait un deni de service auto-infflige (specification section 24.2).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
    private readonly config: AppConfigService,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.rateLimitEnabled) {
      return true;
    }

    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AppRequest>();

    for (const rule of options.rules) {
      const subject = this.resolveSubject(rule, request);

      if (subject === undefined) {
        continue;
      }

      await this.enforce(options.name, rule, subject, request);
    }

    return true;
  }

  private resolveSubject(rule: RateLimitRule, request: AppRequest): string | undefined {
    switch (rule.dimension) {
      case 'ip':
        return request.ip;
      case 'user':
        return request.actor?.userId;
      case 'device':
        return request.deviceInstallId;
      case 'destination':
        // La destination d'un OTP est une donnee personnelle : seule son
        // empreinte entre dans la cle Redis (specification section 23).
        return readDestination(request);
      default:
        return undefined;
    }
  }

  private async enforce(
    name: string,
    rule: RateLimitRule,
    subject: string,
    request: AppRequest,
  ): Promise<void> {
    const key = buildKey(name, rule, subject);

    let count: number;
    let ttlSeconds: number;

    try {
      ({ count, ttlSeconds } = await this.redis.incrementWithWindow(key, rule.windowSeconds));
    } catch (error) {
      this.logger.warn('Limitation de debit non appliquee : cache indisponible', {
        requestId: request.requestId,
        operation: name,
        dimension: rule.dimension,
        detail: error instanceof Error ? error.message : undefined,
      });
      return;
    }

    if (count > rule.limit) {
      this.logger.warn('Limitation de debit atteinte', {
        requestId: request.requestId,
        operation: name,
        dimension: rule.dimension,
        limit: rule.limit,
        retryAfterSeconds: ttlSeconds,
      });

      throw new DomainError('RATE_LIMITED', `Limite ${name}/${rule.dimension} depassee`, {
        publicDetail: `Vous avez fait trop de demandes. Reessayez dans ${formatDelay(ttlSeconds)}.`,
      });
    }
  }
}

function buildKey(name: string, rule: RateLimitRule, subject: string): string {
  const hashedSubject = createHash('sha256').update(subject).digest('base64url').slice(0, 24);
  return `rl:${name}:${rule.dimension}:${rule.windowSeconds}:${hashedSubject}`;
}

function readDestination(request: AppRequest): string | undefined {
  const body = request.body as { phone?: unknown; destination?: unknown } | undefined;

  if (typeof body?.phone === 'string') {
    return body.phone;
  }
  if (typeof body?.destination === 'string') {
    return body.destination;
  }
  return undefined;
}

function formatDelay(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} seconde${seconds > 1 ? 's' : ''}`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}
