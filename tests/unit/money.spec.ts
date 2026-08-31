import { describe, expect, it } from 'vitest';
import {
  allocateAmount,
  applyDiscountBasisPoints,
  formatAmount,
  multiplyAmount,
  subtractToFloor,
  sumAmounts,
  toAmount,
  toMoneyView,
} from '../../src/common/money/money';

/**
 * Le franc CFA n'a pas de sous-unite : tout montant est un entier.
 * Reference : specification section 13.3.
 */
describe('money', () => {
  describe('toAmount', () => {
    it('accepte un entier transmis en chaine', () => {
      expect(toAmount('3500')).toBe(3500n);
    });

    it('accepte un bigint et un number entier', () => {
      expect(toAmount(4000n)).toBe(4000n);
      expect(toAmount(250)).toBe(250n);
    });

    it('refuse une valeur decimale, qui trahirait un calcul en flottant', () => {
      expect(() => toAmount('3500.50')).toThrow();
      expect(() => toAmount(1500.75)).toThrow();
    });

    it('refuse un montant negatif', () => {
      expect(() => toAmount('-100')).toThrow();
    });

    it('refuse une chaine non numerique et une chaine vide', () => {
      expect(() => toAmount('abc')).toThrow();
      expect(() => toAmount('')).toThrow();
    });
  });

  describe('sumAmounts', () => {
    it('additionne sans perte de precision au-dela de 2^53', () => {
      // Un total en flottant serait deja faux a cette echelle.
      const large = 9_007_199_254_740_993n;
      expect(sumAmounts([large, 1n])).toBe(9_007_199_254_740_994n);
    });

    it('renvoie zero pour une liste vide', () => {
      expect(sumAmounts([])).toBe(0n);
    });
  });

  describe('multiplyAmount', () => {
    it('multiplie par une quantite entiere', () => {
      expect(multiplyAmount(2500n, 3)).toBe(7500n);
    });

    it('refuse une quantite fractionnaire', () => {
      expect(() => multiplyAmount(2500n, 1.5)).toThrow();
    });
  });

  describe('subtractToFloor', () => {
    it('ne descend jamais sous zero', () => {
      // Une remise superieure au total ne doit pas produire un montant negatif,
      // qui se traduirait par un remboursement involontaire.
      expect(subtractToFloor(1000n, 1500n)).toBe(0n);
    });

    it('soustrait normalement', () => {
      expect(subtractToFloor(5000n, 1500n)).toBe(3500n);
    });
  });

  describe('applyDiscountBasisPoints', () => {
    it('retourne le montant net apres une remise de 10 pour cent', () => {
      expect(applyDiscountBasisPoints(5000n, 1000)).toBe(4500n);
    });

    it('une remise nulle laisse le montant intact, une remise totale l annule', () => {
      expect(applyDiscountBasisPoints(5000n, 0)).toBe(5000n);
      expect(applyDiscountBasisPoints(5000n, 10_000)).toBe(0n);
    });

    it('arrondit la remise au FCFA le plus proche, de facon deterministe', () => {
      // 1333 * 10 % = 133,3 arrondi a 133, donc un net de 1200 FCFA.
      const first = applyDiscountBasisPoints(1333n, 1000);
      const second = applyDiscountBasisPoints(1333n, 1000);
      expect(first).toBe(second);
      expect(first).toBe(1200n);
    });

    it('refuse une remise superieure a cent pour cent', () => {
      expect(() => applyDiscountBasisPoints(1000n, 10_001)).toThrow();
    });
  });

  describe('allocateAmount', () => {
    it('conserve le total exact lors d un partage inegal', () => {
      // 1000 partages en 3 : aucune part ne doit etre perdue par arrondi.
      const parts = allocateAmount(1000n, 3);
      expect(parts).toHaveLength(3);
      expect(sumAmounts(parts)).toBe(1000n);
    });

    it('repartit un montant divisible a parts egales', () => {
      expect(allocateAmount(900n, 3)).toEqual([300n, 300n, 300n]);
    });

    it('refuse un nombre de parts nul', () => {
      expect(() => allocateAmount(1000n, 0)).toThrow();
    });
  });

  describe('formatAmount et toMoneyView', () => {
    it('formate avec un separateur de milliers et le libelle FCFA', () => {
      const formatted = formatAmount(1_250_000n);
      expect(formatted).toContain('FCFA');
      expect(formatted).toMatch(/1.250.000/);
    });

    it('expose le montant en chaine, jamais en nombre JSON', () => {
      const view = toMoneyView(5000n);
      expect(view).toEqual({ amount: '5000', currency: 'XOF', formatted: expect.any(String) });
      expect(typeof view.amount).toBe('string');
    });
  });
});
