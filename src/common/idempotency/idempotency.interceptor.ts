import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, of, type Observable, switchMap, tap, catchError, throwError } from 'rxjs';
import { Prisma } from '../../infrastructure/prisma/generated/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { Clock } from '../time/clock';
import { DomainError } from '../errors/domain.error';
import { IDEMPOTENCY_KEY_HEADER, type AppRequest } from '../http/request-context';
import { APP_LOGGER, type AppLogger } from '../logging/app-logger';
import { hashRequestPayload } from '../security/hashing';
import { IDEMPOTENT_METADATA, type IdempotentOptions } from './idempotent.decorator';

const DEFAULT_RETENTION_SECONDS = 24 * 60 * 60;

/**
 * Rejeu idempotent adosse a la table `idempotency_keys`.
 *
 * Invariants (specification sections 10.1 et 12.2) :
 *  - une meme cle avec le meme corps renvoie la reponse d'origine, sans reexecuter
 *    l'effet de bord ;
 *  - une meme cle avec un corps different est un conflit explicite, jamais une
 *    ecriture silencieuse ;
 *  - une cle encore en cours de traitement renvoie un conflit : le client doit
 *    attendre, pas relancer l'operation ;
 *  - l'unicite est garantie par une contrainte en base, pas par une lecture
 *    prealable, afin de resister a deux requetes strictement simultanees.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<IdempotentOptions | undefined>(
      IDEMPOTENT_METADATA,
      context.getHandler(),
    );

    if (!options) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AppRequest>();
    const key = request.header(IDEMPOTENCY_KEY_HEADER);

    if (!key || key.trim().length === 0) {
      return throwError(
        () =>
          new DomainError('VALIDATION_FAILED', `En-tete ${IDEMPOTENCY_KEY_HEADER} absente`, {
            publicDetail: "Cette action necessite un identifiant de demande. Reessayez depuis l'application.",
            fields: [
              {
                field: IDEMPOTENCY_KEY_HEADER,
                code: 'REQUIRED',
                message: `L'en-tete ${IDEMPOTENCY_KEY_HEADER} est obligatoire.`,
              },
            ],
          }),
      );
    }

    return from(this.reserve(options, key.trim(), request)).pipe(
      switchMap((reserved) => {
        if (reserved.kind === 'replay') {
          this.logger.info('Reponse idempotente rejouee', {
            requestId: request.requestId,
            scope: options.scope,
          });
          return of(reserved.body);
        }

        return next.handle().pipe(
          tap({
            next: (payload: unknown) => {
              void this.complete(reserved.id, payload);
            },
            error: () => {
              void this.fail(reserved.id);
            },
          }),
          catchError((error: unknown) => throwError(() => error)),
        );
      }),
    );
  }

  private async reserve(
    options: IdempotentOptions,
    key: string,
    request: AppRequest,
  ): Promise<{ kind: 'reserved'; id: string } | { kind: 'replay'; body: unknown }> {
    const scope = options.scope;
    const userId = request.actor?.userId ?? null;
    const requestHash = hashRequestPayload(request.body);
    const now = this.clock.now();
    const expiresAt = new Date(
      now.getTime() + (options.retentionSeconds ?? DEFAULT_RETENTION_SECONDS) * 1000,
    );

    try {
      const created = await this.prisma.idempotencyKey.create({
        data: { key, scope, userId, requestHash, expiresAt, lockedAt: now },
        select: { id: true },
      });

      return { kind: 'reserved', id: created.id };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }

    const existing = await this.prisma.idempotencyKey.findFirst({
      where: { scope, key, userId },
    });

    if (!existing) {
      // La ligne concurrente a expire entre l'insertion et la lecture.
      throw new DomainError('CONFLICT', 'Etat idempotent introuvable apres collision');
    }

    if (existing.requestHash !== requestHash) {
      throw new DomainError(
        'IDEMPOTENCY_KEY_REUSED',
        `Cle idempotente ${scope} reutilisee avec un corps different`,
      );
    }

    if (existing.status === 'COMPLETED') {
      return { kind: 'replay', body: existing.responseBody };
    }

    if (existing.status === 'FAILED') {
      // Une tentative echouee est rejouable : la ligne est reinitialisee pour
      // permettre une nouvelle execution sous la meme cle.
      await this.prisma.idempotencyKey.update({
        where: { id: existing.id },
        data: {
          status: 'IN_PROGRESS',
          lockedAt: now,
          responseBody: Prisma.DbNull,
          responseStatus: null,
        },
      });

      return { kind: 'reserved', id: existing.id };
    }

    throw new DomainError(
      'IDEMPOTENCY_REQUEST_IN_PROGRESS',
      `Cle idempotente ${scope} encore en cours de traitement`,
    );
  }

  private async complete(id: string, payload: unknown): Promise<void> {
    try {
      await this.prisma.idempotencyKey.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          responseStatus: 200,
          responseBody: toJsonValue(payload),
        },
      });
    } catch (error) {
      this.logger.error("Echec d'enregistrement de la reponse idempotente", {
        idempotencyKeyId: id,
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  }

  private async fail(id: string): Promise<void> {
    try {
      await this.prisma.idempotencyKey.update({ where: { id }, data: { status: 'FAILED' } });
    } catch (error) {
      this.logger.error("Echec de marquage d'une cle idempotente en erreur", {
        idempotencyKeyId: id,
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

/**
 * Les montants circulent en `bigint` dans le domaine, ce que `JSON.stringify`
 * refuse. La conversion en chaine est deja la representation retenue par l'API
 * (specification section 13.3).
 */
function toJsonValue(payload: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (payload === undefined || payload === null) {
    return Prisma.DbNull;
  }

  return JSON.parse(
    JSON.stringify(payload, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value)),
  ) as Prisma.InputJsonValue;
}
