import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import type { AppRequest } from './request-context';

/**
 * Enveloppe de reponse standard (specification section 10.2) :
 * `{ "data": ..., "meta": { "requestId": ..., "nextCursor": ... } }`
 *
 * Un service qui renvoie deja une pagination expose `items` et `nextCursor` :
 * l'intercepteur remonte alors le curseur dans `meta` sans le dupliquer.
 */
export interface ResponseEnvelope<T> {
  data: T;
  meta: {
    requestId: string;
    nextCursor: string | null;
  };
}

export interface PaginatedPayload<T> {
  items: T[];
  nextCursor: string | null;
}

function isPaginatedPayload(value: unknown): value is PaginatedPayload<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { items?: unknown }).items) &&
    'nextCursor' in value
  );
}

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ResponseEnvelope<unknown>> {
    const request = context.switchToHttp().getRequest<AppRequest>();

    return next.handle().pipe(
      map((payload: unknown) => {
        if (isPaginatedPayload(payload)) {
          return {
            data: payload.items,
            meta: { requestId: request.requestId, nextCursor: payload.nextCursor },
          };
        }

        return {
          data: payload ?? null,
          meta: { requestId: request.requestId, nextCursor: null },
        };
      }),
    );
  }
}
