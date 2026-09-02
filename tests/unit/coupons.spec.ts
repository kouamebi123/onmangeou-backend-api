import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  calculateCoupon,
  normalizeCouponCode,
  type CouponRule,
} from '../../src/domains/commerce/coupon-rules';
import { priceCoupon } from '../../src/domains/commerce/coupon-pricing';
import { CouponWriteDto, CouponStatusDto } from '../../src/domains/commerce/coupon.dto';

const now = new Date('2026-09-02T12:00:00Z');
const rule: CouponRule = {
  code: 'BONJOUR',
  discount_bps: 1000,
  active: true,
  minimum_amount: 0n,
  expires_at: null,
};
describe('Coupon rules', () => {
  it('normalizes a code consistently', () => expect(normalizeCouponCode(' bonjour-10 ')).toBe('BONJOUR-10'));
  it.each(['', 'AB', 'A B C', '<script>', 'ééé', 'A'.repeat(41)])('rejects invalid code %s', (value) => {
    expect(() => normalizeCouponCode(value)).toThrow();
  });
  it('rounds discount half up using bigint FCFA', () => {
    expect(calculateCoupon(1005n, rule, now)).toEqual({ total: 904n, discount: 101n, couponCode: 'BONJOUR' });
  });
  it('keeps exact large integer amounts', () => {
    const subtotal = 9007199254740993n;
    const result = calculateCoupon(subtotal, rule, now);
    expect(result.total + result.discount).toBe(subtotal);
    expect(result.discount).toBe(900719925474099n);
  });
  it('supports a free order without a negative total', () => {
    expect(calculateCoupon(5000n, { ...rule, discount_bps: 10000 }, now).total).toBe(0n);
  });
  it('rejects a missing or disabled coupon', () => {
    expect(() => calculateCoupon(5000n, null, now)).toThrow('indisponible');
    expect(() => calculateCoupon(5000n, { ...rule, active: false }, now)).toThrow('indisponible');
  });
  it('expires at the exact deadline', () => {
    expect(() => calculateCoupon(5000n, { ...rule, expires_at: now }, now)).toThrow('expiré');
    expect(calculateCoupon(5000n, { ...rule, expires_at: new Date(now.getTime() + 1) }, now).total).toBe(
      4500n,
    );
  });
  it('requires the minimum before discount, inclusive', () => {
    const coupon = { ...rule, minimum_amount: 5000n };
    expect(() => calculateCoupon(4999n, coupon, now)).toThrow('au moins');
    expect(calculateCoupon(5000n, coupon, now).total).toBe(4500n);
  });
  it.each([0, -1, 10001, 3.5])('rejects unsafe legacy percentages %s', (discount_bps) => {
    expect(() => calculateCoupon(5000n, { ...rule, discount_bps }, now)).toThrow();
  });
  it('does not query coupons for an ordinary checkout', async () => {
    const query = vi.fn();
    const db = { $queryRaw: query } as unknown as Parameters<typeof priceCoupon>[0];
    expect(await priceCoupon(db, 'restaurant', 5000n, undefined, () => now)).toEqual({
      total: 5000n,
      discount: 0n,
      couponCode: null,
    });
    expect(query).not.toHaveBeenCalled();
  });
  it('scopes and locks the lookup and revalidates on each checkout', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([rule])
      .mockResolvedValueOnce([{ ...rule, active: false }]);
    const db = { $queryRaw: query } as unknown as Parameters<typeof priceCoupon>[0];
    expect((await priceCoupon(db, 'restaurant-a', 5000n, 'bonjour', () => now)).total).toBe(4500n);
    const [strings, ...values] = query.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join('')).toContain('establishment_id=');
    expect(strings.join('')).toContain('FOR SHARE');
    expect(values).toEqual(['restaurant-a', 'BONJOUR']);
    await expect(priceCoupon(db, 'restaurant-a', 5000n, 'bonjour', () => now)).rejects.toThrow(
      'indisponible',
    );
  });
});

describe('Coupon request validation', () => {
  const valid = {
    establishmentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    code: ' hello ',
    discountBps: 1000,
    minimumAmount: '5000',
  };
  it('normalizes a valid merchant request', async () => {
    const dto = plainToInstance(CouponWriteDto, valid);
    expect(await validate(dto)).toEqual([]);
    expect(dto.code).toBe('HELLO');
  });
  it.each([
    { discountBps: 10001 },
    { discountBps: 0 },
    { minimumAmount: '-1' },
    { minimumAmount: '1.5' },
    { expiresAt: 'tomorrow' },
    { code: '' },
  ])('rejects invalid conditions %o', async (patch) => {
    expect((await validate(plainToInstance(CouponWriteDto, { ...valid, ...patch }))).length).toBeGreaterThan(
      0,
    );
  });
  it('does not coerce the string false into true', async () => {
    expect((await validate(plainToInstance(CouponStatusDto, { active: 'false' }))).length).toBeGreaterThan(0);
    expect(await validate(plainToInstance(CouponStatusDto, { active: false }))).toEqual([]);
  });
});
