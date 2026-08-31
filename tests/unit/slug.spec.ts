import { describe, expect, it } from 'vitest';
import { slugify, withSlugSuffix } from '../../src/domains/organizations/slug';

describe('slugify', () => {
  it('normalise les accents, espaces et signes', () => {
    expect(slugify("Maquis Chez Maman — Côte d'Ivoire")).toBe('maquis-chez-maman-cote-d-ivoire');
  });

  it('retourne une valeur sûre lorsque le nom ne contient aucun caractère latin', () => {
    expect(slugify('---')).toBe('restaurant');
  });

  it('limite la longueur à 160 caractères', () => {
    expect(slugify('a'.repeat(200))).toHaveLength(160);
  });
});

describe('withSlugSuffix', () => {
  it('ajoute le suffixe en conservant la longueur maximale', () => {
    const result = withSlugSuffix('a'.repeat(160), 'k9x2');

    expect(result).toHaveLength(160);
    expect(result.endsWith('-k9x2')).toBe(true);
  });
});
