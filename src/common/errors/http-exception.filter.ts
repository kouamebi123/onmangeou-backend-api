import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AppLogger } from '../logging/app-logger';
import { APP_LOGGER } from '../logging/app-logger';
import { Inject } from '@nestjs/common';
import { DomainError } from './domain.error';
import {
  buildProblemDetails,
  type ProblemCode,
  type ProblemDetails,
  type ProblemFieldError,
} from './problem-details';
import type { AppRequest } from '../http/request-context';

/**
 * Seuil de gravite : au-dela, l'incident releve du service, pas du client, et
 * doit alimenter les alertes plutot que le simple journal d'avertissements.
 */
const SERVER_ERROR_THRESHOLD = 500;

/**
 * Traduit toute exception en reponse RFC 7807 (specification section 10.2).
 *
 * Aucune trace interne, aucun message d'ORM et aucun jargon technique ne
 * traverse cette frontiere (specifications sections 6.7 et 19.6).
 */
@Injectable()
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  constructor(@Inject(APP_LOGGER) private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<AppRequest>();
    const response = context.getResponse<Response>();
    const requestId = request.requestId ?? 'unknown';

    const problem = this.toProblemDetails(exception, requestId);

    this.log(exception, problem, request);

    response.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblemDetails(exception: unknown, requestId: string): ProblemDetails {
    if (exception instanceof DomainError) {
      return buildProblemDetails(exception.code, requestId, {
        ...(exception.options.publicDetail === undefined ? {} : { detail: exception.options.publicDetail }),
        ...(exception.options.fields === undefined ? {} : { fields: exception.options.fields }),
      });
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception, requestId);
    }

    return buildProblemDetails('INTERNAL_ERROR', requestId);
  }

  private fromHttpException(exception: HttpException, requestId: string): ProblemDetails {
    const status: HttpStatus = exception.getStatus();
    const payload = exception.getResponse();

    // La ValidationPipe de Nest renvoie un tableau de messages : il est converti
    // en erreurs de champ pour que le client puisse les rattacher au formulaire
    // (specification section 20.4).
    const fields = extractFieldErrors(payload);

    return buildProblemDetails(
      mapStatusToProblemCode(status),
      requestId,
      fields.length > 0 ? { fields } : {},
    );
  }

  private log(exception: unknown, problem: ProblemDetails, request: AppRequest): void {
    const base = {
      requestId: problem.requestId,
      code: problem.code,
      status: problem.status,
      method: request.method,
      route: readRoutePath(request),
      userId: request.actor?.userId,
      organizationId: request.actor?.organizationId,
    };

    if (problem.status >= SERVER_ERROR_THRESHOLD) {
      this.logger.error('Requete en erreur serveur', {
        ...base,
        error: exception instanceof Error ? exception.message : 'exception non standard',
        stack: exception instanceof Error ? exception.stack : undefined,
      });
      return;
    }

    this.logger.warn('Requete refusee', {
      ...base,
      error: exception instanceof Error ? exception.message : undefined,
    });
  }
}

/**
 * Chemin de route journalise.
 *
 * Le gabarit de route (`/v1/restaurants/:slug`) est prefere au chemin concret :
 * il agrege les journaux par endpoint et evite d'y faire figurer des
 * identifiants (specification section 23).
 */
function readRoutePath(request: AppRequest): string {
  const route: unknown = request.route;

  if (typeof route === 'object' && route !== null && typeof (route as { path?: unknown }).path === 'string') {
    return (route as { path: string }).path;
  }

  return request.path;
}

function mapStatusToProblemCode(status: HttpStatus): ProblemCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'VALIDATION_FAILED';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHENTICATED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return 'PAYLOAD_TOO_LARGE';
    case HttpStatus.UNSUPPORTED_MEDIA_TYPE:
      return 'UNSUPPORTED_MEDIA_TYPE';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    case HttpStatus.SERVICE_UNAVAILABLE:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= HttpStatus.INTERNAL_SERVER_ERROR ? 'INTERNAL_ERROR' : 'VALIDATION_FAILED';
  }
}

function extractFieldErrors(payload: unknown): ProblemFieldError[] {
  if (typeof payload !== 'object' || payload === null) {
    return [];
  }

  const message = (payload as { message?: unknown }).message;

  if (!Array.isArray(message)) {
    return [];
  }

  return message.filter((entry): entry is string => typeof entry === 'string').map(parseValidationMessage);
}

/**
 * class-validator produit des messages du type `phone doit etre ...`.
 * Le premier segment est le nom du champ.
 */
function parseValidationMessage(message: string): ProblemFieldError {
  const [field = 'unknown'] = message.split(' ');

  return {
    field,
    code: 'INVALID',
    message,
  };
}
