import { describe, expect, it } from 'vitest';
import {
  generateNumericCode,
  generateOpaqueToken,
  hashHighEntropySecret,
  hashLowEntropySecret,
  hashRequestPayload,
  verifyLowEntropySecret,
} from '../../src/common/security/hashing';

const PEPPER = 'poivre-de-test-uniquement';

/**
 * Reference : specification sections 8.2, 21.3 et 22.
 */
describe('secrets a faible entropie (codes OTP)', () => {
  it('un code correct est reconnu', async () => {
    const stored = await hashLowEntropySecret('482913', PEPPER);
    await expect(verifyLowEntropySecret('482913', stored, PEPPER)).resolves.toBe(true);
  });

  it('un code errone est rejete', async () => {
    const stored = await hashLowEntropySecret('482913', PEPPER);
    await expect(verifyLowEntropySecret('482914', stored, PEPPER)).resolves.toBe(false);
  });

  it('le hachage ne contient jamais le code en clair', async () => {
    const stored = await hashLowEntropySecret('482913', PEPPER);
    expect(stored).not.toContain('482913');
  });

  it('deux hachages du meme code diffèrent grace au sel aleatoire', async () => {
    // Sans sel par enregistrement, une table precalculee de dix mille entrees
    // suffirait a casser tous les codes a six chiffres de la base.
    const first = await hashLowEntropySecret('482913', PEPPER);
    const second = await hashLowEntropySecret('482913', PEPPER);
    expect(first).not.toBe(second);
  });

  it('un poivre different invalide la verification', async () => {
    // Le poivre est cote serveur : une base volee sans lui reste inexploitable.
    const stored = await hashLowEntropySecret('482913', PEPPER);
    await expect(verifyLowEntropySecret('482913', stored, 'autre-poivre')).resolves.toBe(false);
  });

  it('un hachage malforme est rejete sans lever d exception', async () => {
    await expect(verifyLowEntropySecret('482913', 'valeur-invalide', PEPPER)).resolves.toBe(false);
    await expect(verifyLowEntropySecret('482913', '', PEPPER)).resolves.toBe(false);
  });
});

describe('secrets a forte entropie (refresh tokens)', () => {
  it('le hachage est deterministe, condition d une recherche indexee', () => {
    const token = generateOpaqueToken();
    expect(hashHighEntropySecret(token, PEPPER)).toBe(hashHighEntropySecret(token, PEPPER));
  });

  it('deux jetons distincts produisent deux empreintes distinctes', () => {
    expect(hashHighEntropySecret(generateOpaqueToken(), PEPPER)).not.toBe(
      hashHighEntropySecret(generateOpaqueToken(), PEPPER),
    );
  });

  it('le jeton genere porte au moins 256 bits', () => {
    // 32 octets encodes en base64url occupent 43 caracteres.
    expect(generateOpaqueToken().length).toBeGreaterThanOrEqual(43);
  });
});

describe('generateNumericCode', () => {
  it('respecte la longueur demandee et ne contient que des chiffres', () => {
    const code = generateNumericCode(6);
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^\d{6}$/);
  });

  it('evite les codes trivialement devinables', () => {
    // Un attaquant tente d'abord 000000, 111111 ou 123456.
    const codes = Array.from({ length: 200 }, () => generateNumericCode(6));
    expect(codes).not.toContain('000000');
    expect(codes).not.toContain('111111');
    expect(codes).not.toContain('123456');
  });

  it('produit des valeurs variees', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateNumericCode(6)));
    expect(codes.size).toBeGreaterThan(40);
  });
});

describe('hashRequestPayload', () => {
  it('donne la meme empreinte quel que soit l ordre des cles', () => {
    // Deux clients peuvent serialiser le meme corps dans un ordre different :
    // la detection de rejeu ne doit pas y etre sensible.
    expect(hashRequestPayload({ a: 1, b: 2 })).toBe(hashRequestPayload({ b: 2, a: 1 }));
  });

  it('distingue deux corps differents', () => {
    expect(hashRequestPayload({ amount: '1000' })).not.toBe(hashRequestPayload({ amount: '2000' }));
  });

  it('ignore les proprietes non definies', () => {
    expect(hashRequestPayload({ a: 1, b: undefined })).toBe(hashRequestPayload({ a: 1 }));
  });

  it('traite les structures imbriquees', () => {
    expect(hashRequestPayload({ x: { a: 1, b: [1, 2] } })).toBe(
      hashRequestPayload({ x: { b: [1, 2], a: 1 } }),
    );
  });
});
