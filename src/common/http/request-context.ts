import type { Request } from 'express';
import type { AuthenticatedActor } from '../auth/authenticated-actor';

export const REQUEST_ID_HEADER = 'x-request-id' as const;
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key' as const;
export const DEVICE_INSTALL_HEADER = 'x-device-install-id' as const;

/**
 * Requete enrichie par les intercepteurs transverses.
 *
 * `actor` est renseigne par le garde d'authentification. Le tenant n'est jamais
 * lu depuis le corps de la requete (specification section 4.4).
 */
export interface AppRequest extends Request {
  requestId: string;
  actor?: AuthenticatedActor;
  deviceInstallId?: string;
}

/**
 * Tronque une adresse IP pour la journalisation.
 *
 * IPv4 : dernier octet retire. IPv6 : seuls les 48 premiers bits conserves.
 * La minimisation s'applique des la collecte (specification section 23).
 */
export function truncateIp(ip: string | undefined): string | undefined {
  if (!ip) {
    return undefined;
  }

  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;

  if (normalized.includes('.')) {
    const parts = normalized.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
    return undefined;
  }

  if (normalized.includes(':')) {
    const groups = normalized.split(':').filter((group) => group.length > 0);
    return `${groups.slice(0, 3).join(':')}::`;
  }

  return undefined;
}
