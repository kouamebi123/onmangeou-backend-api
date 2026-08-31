import { DomainError } from '../errors/domain.error';

/**
 * Pagination par curseur (specification sections 10.1 et 24.2).
 *
 * Un `OFFSET` eleve degrade une lecture PostgreSQL et peut sauter ou dupliquer
 * des lignes lorsque des ecritures surviennent entre deux pages. Le curseur
 * encode la derniere position lue, ce qui rend la pagination stable.
 *
 * Le curseur est opaque pour le client : il est encode en base64url et ne doit
 * jamais etre construit cote client.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export interface CursorPayload {
  /** Valeur de tri de la derniere ligne renvoyee. */
  sortValue: string;
  /** Identifiant de la derniere ligne, pour lever les egalites de tri. */
  id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new DomainError('VALIDATION_FAILED', 'Curseur de pagination illisible', {
      fields: [{ field: 'cursor', code: 'INVALID', message: 'Curseur de pagination invalide.' }],
    });
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as CursorPayload).sortValue !== 'string' ||
    typeof (parsed as CursorPayload).id !== 'string'
  ) {
    throw new DomainError('VALIDATION_FAILED', 'Curseur de pagination incomplet', {
      fields: [{ field: 'cursor', code: 'INVALID', message: 'Curseur de pagination invalide.' }],
    });
  }

  return parsed as CursorPayload;
}

export function normalizePageSize(requested: number | undefined): number {
  if (requested === undefined) {
    return DEFAULT_PAGE_SIZE;
  }
  if (!Number.isInteger(requested) || requested < 1) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(requested, MAX_PAGE_SIZE);
}

export interface PageResult<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Decoupe une lecture surdimensionnee en page.
 *
 * La requete SQL demande `limit + 1` lignes : la presence de la ligne
 * supplementaire indique qu'une page suivante existe, sans requete de comptage.
 */
export function buildPage<T>(rows: T[], limit: number, toCursor: (row: T) => CursorPayload): PageResult<T> {
  if (rows.length <= limit) {
    return { items: rows, nextCursor: null };
  }

  const items = rows.slice(0, limit);
  const last = items[items.length - 1];

  return {
    items,
    nextCursor: last === undefined ? null : encodeCursor(toCursor(last)),
  };
}
