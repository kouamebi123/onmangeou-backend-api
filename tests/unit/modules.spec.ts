import { describe, expect, it } from 'vitest';
import {
  ALL_MODULE_CODES,
  filterServicesByModules,
  MODULE_CODES,
  MODULE_LABELS,
  PUBLIC_MODULE_CODES,
  toPublicModules,
} from '../../src/domains/entitlements/module-codes';
import { quoteMonthlyAmount } from '../../src/domains/entitlements/module-pricing';

describe('catalogue des modules', () => {
  it('expose un code et un libellé uniques pour chaque module', () => {
    expect(new Set(ALL_MODULE_CODES).size).toBe(ALL_MODULE_CODES.length);
    expect(Object.keys(MODULE_LABELS)).toHaveLength(ALL_MODULE_CODES.length);
    for (const code of ALL_MODULE_CODES) {
      expect(MODULE_LABELS[code]).not.toBe('');
    }
  });

  it('ne rend publics que les modules autorisés', () => {
    const enabled = [
      MODULE_CODES.STOREFRONT_BASIC,
      MODULE_CODES.DELIVERY_INTERNAL,
      MODULE_CODES.CASH_REGISTER,
      'module.inconnu',
    ];

    expect(toPublicModules(enabled)).toEqual([MODULE_CODES.STOREFRONT_BASIC, MODULE_CODES.DELIVERY_INTERNAL]);
    expect(PUBLIC_MODULE_CODES).not.toContain(MODULE_CODES.CASH_REGISTER);
  });

  it('masque livraison et réservation lorsque leurs modules sont désactivés', () => {
    const services = ['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'RESERVATION'];

    expect(filterServicesByModules(services, [])).toEqual(['DINE_IN', 'TAKEAWAY']);
    expect(filterServicesByModules(services, [MODULE_CODES.DELIVERY_INTERNAL])).toEqual([
      'DINE_IN',
      'TAKEAWAY',
      'DELIVERY',
    ]);
    expect(filterServicesByModules(services, [MODULE_CODES.RESERVATIONS_TABLES])).toEqual([
      'DINE_IN',
      'TAKEAWAY',
      'RESERVATION',
    ]);
  });
});

describe('tarification des modules', () => {
  it('additionne les prix activés sans flottant', () => {
    const prices = {
      [MODULE_CODES.DELIVERY_INTERNAL]: 2_500n,
      [MODULE_CODES.INVENTORY_SIMPLE]: 1_500n,
    };

    expect(quoteMonthlyAmount([MODULE_CODES.DELIVERY_INTERNAL, MODULE_CODES.INVENTORY_SIMPLE], prices)).toBe(
      4_000n,
    );
  });

  it('ignore un module sans prix publié et ne compte pas les doublons absents', () => {
    expect(quoteMonthlyAmount(['module.inconnu'], {})).toBe(0n);
  });
});
