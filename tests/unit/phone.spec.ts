import { describe, expect, it } from 'vitest';
import { isValidE164, maskPhone, normalizeIvorianPhone } from '../../src/common/identity/phone';

/**
 * Le telephone est l'identifiant de connexion principal : deux ecritures du meme
 * numero doivent produire exactement la meme cle, sinon un utilisateur pourrait
 * creer deux comptes pour une seule ligne.
 *
 * Reference : specification sections 8.2 et 21.1.
 */
describe('normalizeIvorianPhone', () => {
  const expected = '+2250701020304';

  it.each([
    ['0701020304', 'saisie locale'],
    ['07 01 02 03 04', 'espaces'],
    ['07.01.02.03.04', 'points'],
    ['07-01-02-03-04', 'tirets'],
    ['+225 07 01 02 03 04', 'indicatif international'],
    ['+2250701020304', 'format E.164 deja normalise'],
    ['00225 0701020304', 'prefixe international 00'],
    ['(07) 01 02 03 04', 'parentheses'],
  ])('normalise %s (%s) vers le format canonique', (input) => {
    expect(normalizeIvorianPhone(input).e164).toBe(expected);
  });

  it('expose le numero national pour l affichage local', () => {
    const result = normalizeIvorianPhone('+2250701020304');
    expect(result.national).toBe('0701020304');
    expect(result.countryCallingCode).toBe('225');
  });

  it('refuse un numero trop court', () => {
    // Ancien format a huit chiffres, invalide depuis la reforme de 2021.
    expect(() => normalizeIvorianPhone('01020304')).toThrow();
  });

  it('refuse un numero trop long', () => {
    expect(() => normalizeIvorianPhone('070102030405')).toThrow();
  });

  it('refuse une chaine vide ou non numerique', () => {
    expect(() => normalizeIvorianPhone('')).toThrow();
    expect(() => normalizeIvorianPhone('   ')).toThrow();
    expect(() => normalizeIvorianPhone('07ABCDEF04')).toThrow();
  });
});

describe('isValidE164', () => {
  it('valide un numero canonique', () => {
    expect(isValidE164('+2250701020304')).toBe(true);
  });

  it('refuse un numero sans indicatif', () => {
    expect(isValidE164('0701020304')).toBe(false);
  });
});

describe('maskPhone', () => {
  it('ne laisse pas reconstituer le numero complet', () => {
    const masked = maskPhone('+2250701020304');
    expect(masked).not.toContain('0701020');
    expect(masked).toContain('*');
    expect(masked.endsWith('04')).toBe(true);
  });

  it('masque entierement une valeur trop courte', () => {
    expect(maskPhone('+225')).toBe('***');
  });
});
