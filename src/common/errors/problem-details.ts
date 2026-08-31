import { HttpStatus } from '@nestjs/common';

/**
 * Format d'erreur uniforme RFC 7807 (specification section 10.2).
 *
 * Regles :
 *  - jamais d'exception interne renvoyee telle quelle (section 6.7) ;
 *  - aucun jargon technique dans `detail`, qui est lisible par l'utilisateur
 *    (section 19.6) ;
 *  - `code` est stable et destine aux clients, `type` est une URI documentaire.
 */

export const PROBLEM_BASE_URI = 'https://api.onmangeou.ci/problems' as const;

export interface ProblemFieldError {
  field: string;
  code: string;
  message: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  requestId: string;
  fields: ProblemFieldError[];
}

/**
 * Catalogue des erreurs metier connues.
 *
 * Chaque entree porte un slug d'URI, un titre court, un statut HTTP et un
 * message public en francais de Cote d'Ivoire, sans jargon.
 */
export const PROBLEM_CATALOG = {
  VALIDATION_FAILED: {
    slug: 'validation-failed',
    title: 'Informations incompletes',
    status: HttpStatus.BAD_REQUEST,
    detail: 'Certaines informations sont manquantes ou incorrectes.',
  },
  UNAUTHENTICATED: {
    slug: 'unauthenticated',
    title: 'Connexion requise',
    status: HttpStatus.UNAUTHORIZED,
    detail: 'Connectez-vous pour continuer.',
  },
  INVALID_CREDENTIALS: {
    slug: 'invalid-credentials',
    title: 'Code incorrect',
    status: HttpStatus.UNAUTHORIZED,
    detail: "Le code saisi n'est pas valide.",
  },
  SESSION_EXPIRED: {
    slug: 'session-expired',
    title: 'Session expiree',
    status: HttpStatus.UNAUTHORIZED,
    detail: 'Votre session a expire. Connectez-vous a nouveau.',
  },
  REAUTHENTICATION_REQUIRED: {
    slug: 'reauthentication-required',
    title: 'Verification requise',
    status: HttpStatus.UNAUTHORIZED,
    detail: 'Cette action demande de confirmer votre identite.',
  },
  FORBIDDEN: {
    slug: 'forbidden',
    title: 'Action non autorisee',
    status: HttpStatus.FORBIDDEN,
    detail: "Vous n'avez pas l'autorisation d'effectuer cette action.",
  },
  MODULE_NOT_ENABLED: {
    slug: 'module-not-enabled',
    title: 'Fonction non activee',
    status: HttpStatus.FORBIDDEN,
    detail: "Cette fonction n'est pas activee pour votre etablissement.",
  },
  NOT_FOUND: {
    slug: 'not-found',
    title: 'Introuvable',
    status: HttpStatus.NOT_FOUND,
    detail: "Cet element n'existe pas ou n'est plus disponible.",
  },
  CONFLICT: {
    slug: 'conflict',
    title: 'Conflit',
    status: HttpStatus.CONFLICT,
    detail: 'Cette operation entre en conflit avec une modification recente.',
  },
  IDEMPOTENCY_KEY_REUSED: {
    slug: 'idempotency-key-reused',
    title: 'Demande deja envoyee',
    status: HttpStatus.CONFLICT,
    detail: 'Cette demande a deja ete envoyee avec un contenu different.',
  },
  IDEMPOTENCY_REQUEST_IN_PROGRESS: {
    slug: 'idempotency-request-in-progress',
    title: 'Traitement en cours',
    status: HttpStatus.CONFLICT,
    detail: 'Votre demande precedente est encore en cours de traitement.',
  },
  ESTABLISHMENT_NOT_PUBLISHED: {
    slug: 'establishment-not-published',
    title: 'Restaurant indisponible',
    status: HttpStatus.CONFLICT,
    detail: "Ce restaurant n'est pas encore visible du public.",
  },
  PRODUCT_UNAVAILABLE: {
    slug: 'product-unavailable',
    title: 'Plat indisponible',
    status: HttpStatus.CONFLICT,
    detail: "Ce plat n'est plus disponible pour ce creneau.",
  },
  OTP_TOO_MANY_ATTEMPTS: {
    slug: 'otp-too-many-attempts',
    title: 'Trop de tentatives',
    status: HttpStatus.TOO_MANY_REQUESTS,
    detail: 'Trop de tentatives. Patientez avant de demander un nouveau code.',
  },
  RATE_LIMITED: {
    slug: 'rate-limited',
    title: 'Trop de demandes',
    status: HttpStatus.TOO_MANY_REQUESTS,
    detail: 'Vous avez fait trop de demandes. Reessayez dans un instant.',
  },
  PAYLOAD_TOO_LARGE: {
    slug: 'payload-too-large',
    title: 'Fichier trop lourd',
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    detail: 'Ce fichier depasse la taille autorisee.',
  },
  UNSUPPORTED_MEDIA_TYPE: {
    slug: 'unsupported-media-type',
    title: 'Format non accepte',
    status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    detail: "Ce format de fichier n'est pas accepte.",
  },
  INTERNAL_ERROR: {
    slug: 'internal-error',
    title: 'Service momentanement indisponible',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    detail: "L'operation n'a pas abouti. Reessayez dans un instant.",
  },
  SERVICE_UNAVAILABLE: {
    slug: 'service-unavailable',
    title: 'Service indisponible',
    status: HttpStatus.SERVICE_UNAVAILABLE,
    detail: 'Le service est momentanement indisponible.',
  },
} as const satisfies Record<string, { slug: string; title: string; status: number; detail: string }>;

export type ProblemCode = keyof typeof PROBLEM_CATALOG;

export function buildProblemDetails(
  code: ProblemCode,
  requestId: string,
  overrides: { detail?: string; fields?: ProblemFieldError[] } = {},
): ProblemDetails {
  const entry = PROBLEM_CATALOG[code];

  return {
    type: `${PROBLEM_BASE_URI}/${entry.slug}`,
    title: entry.title,
    status: entry.status,
    code,
    detail: overrides.detail ?? entry.detail,
    requestId,
    fields: overrides.fields ?? [],
  };
}
