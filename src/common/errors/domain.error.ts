import type { ProblemCode, ProblemFieldError } from './problem-details';

/**
 * Erreur metier levee par les services de domaine.
 *
 * Les services ne connaissent pas HTTP : ils expriment une cause metier que le
 * filtre d'exception traduit en reponse RFC 7807 (specification section 6.7).
 */
export class DomainError extends Error {
  constructor(
    readonly code: ProblemCode,
    /** Message technique destine aux journaux, jamais renvoye au client. */
    message: string,
    readonly options: {
      /** Message public en francais, s'il doit differer du catalogue. */
      publicDetail?: string;
      fields?: ProblemFieldError[];
      /** Contexte structure pour les journaux, deja expurge. */
      context?: Record<string, string | number | boolean | null>;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'DomainError';
  }
}

export function notFound(resource: string, identifier?: string): DomainError {
  return new DomainError('NOT_FOUND', `${resource} introuvable${identifier ? ` : ${identifier}` : ''}`);
}

export function forbidden(reason: string): DomainError {
  return new DomainError('FORBIDDEN', reason);
}

export function conflict(code: ProblemCode, reason: string, publicDetail?: string): DomainError {
  return new DomainError(code, reason, publicDetail === undefined ? {} : { publicDetail });
}

export function validationFailed(fields: ProblemFieldError[], reason = 'Validation metier echouee'): DomainError {
  return new DomainError('VALIDATION_FAILED', reason, { fields });
}
