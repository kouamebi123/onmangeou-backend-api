import { describe, expect, it } from 'vitest';
import { canonicalDestination } from '../../src/common/rate-limit/rate-limit.guard';

describe('destination de la limitation de debit', () => {
  it('compte un meme numero une seule fois, quelle que soit son ecriture', () => {
    const expected = '+2250701020304';
    expect(canonicalDestination('0701020304')).toBe(expected);
    expect(canonicalDestination('07 01 02 03 04')).toBe(expected);
    expect(canonicalDestination('+225 07 01 02 03 04')).toBe(expected);
    expect(canonicalDestination('00225 0701020304')).toBe(expected);
    expect(canonicalDestination('07.01.02.03.04')).toBe(expected);
  });

  it('garde une cle stable pour une destination qui n est pas un numero valide', () => {
    expect(canonicalDestination('Contact@Exemple.ci ')).toBe('contact@exemple.ci');
    expect(canonicalDestination('12 34')).toBe('1234');
  });
});
