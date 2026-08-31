import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildPage,
  decodeCursor,
  encodeCursor,
  normalizePageSize,
} from '../../src/common/pagination/cursor';
import { DomainError } from '../../src/common/errors/domain.error';

/** Reference : specification sections 10.1 et 24.2. */
describe('curseur de pagination', () => {
  it('un aller-retour restitue la position exacte', () => {
    const payload = { sortValue: '000000001234', id: 'est-1' };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it('le curseur est opaque : la position n apparait pas en clair', () => {
    const cursor = encodeCursor({ sortValue: '000000001234', id: 'est-1' });
    expect(cursor).not.toContain('est-1');
    expect(cursor).not.toContain('sortValue');
  });

  it('un curseur illisible est une erreur de validation, pas une erreur serveur', () => {
    expect(() => decodeCursor('pas-du-base64-valide!!!')).toThrow(DomainError);
  });

  it('un curseur au contenu incomplet est refuse', () => {
    const forged = Buffer.from(JSON.stringify({ sortValue: 'x' }), 'utf8').toString('base64url');
    expect(() => decodeCursor(forged)).toThrow(DomainError);
  });
});

describe('normalizePageSize', () => {
  it('applique la taille par defaut en l absence de demande', () => {
    expect(normalizePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('plafonne la taille demandee', () => {
    // Sans plafond, un client pourrait demander cent mille lignes et saturer la
    // base comme le reseau.
    expect(normalizePageSize(5000)).toBe(MAX_PAGE_SIZE);
  });

  it('ignore une taille absurde et revient au defaut', () => {
    expect(normalizePageSize(0)).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizePageSize(-10)).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizePageSize(1.5)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('respecte une taille valide', () => {
    expect(normalizePageSize(10)).toBe(10);
  });
});

describe('buildPage', () => {
  const toCursor = (row: { id: string }) => ({ sortValue: row.id, id: row.id });

  it('sans ligne supplementaire, il n y a pas de page suivante', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    const page = buildPage(rows, 2, toCursor);

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it('la ligne surnumeraire signale une page suivante sans etre renvoyee', () => {
    // La requete demande limit + 1 lignes : la presence de la derniere indique
    // qu'il reste des resultats, sans requete de comptage.
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const page = buildPage(rows, 2, toCursor);

    expect(page.items.map((row) => row.id)).toEqual(['a', 'b']);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeCursor(page.nextCursor as string).id).toBe('b');
  });

  it('une page vide ne produit pas de curseur', () => {
    const page = buildPage([], 20, toCursor);
    expect(page.items).toHaveLength(0);
    expect(page.nextCursor).toBeNull();
  });
});
