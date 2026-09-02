import { DomainError } from '../../common/errors/domain.error';
import { applyDiscountBasisPoints, toMoneyView } from '../../common/money/money';

export function couponError(message: string): never {
  throw new DomainError('VALIDATION_FAILED', message, {
    publicDetail: message,
    fields: [{ field: 'couponCode', code: 'invalid', message }],
  });
}

export function normalizeCouponCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(code))
    couponError('Le code doit contenir 3 à 40 lettres, chiffres, tirets ou underscores.');
  return code;
}

export interface CouponRule {
  code: string;
  discount_bps: number;
  active: boolean;
  expires_at: Date | null;
  minimum_amount: bigint;
}

export function calculateCoupon(subtotal: bigint, coupon: CouponRule | null, now: Date) {
  if (!coupon || !coupon.active) couponError('Ce code promo est indisponible pour ce restaurant.');
  if (coupon.expires_at && coupon.expires_at.getTime() <= now.getTime())
    couponError('Ce code promo a expiré.');
  if (!Number.isInteger(coupon.discount_bps) || coupon.discount_bps < 1 || coupon.discount_bps > 10000)
    couponError('Ce code promo est indisponible pour ce restaurant.');
  if (subtotal < coupon.minimum_amount)
    couponError(`Ce code nécessite un panier d’au moins ${toMoneyView(coupon.minimum_amount).formatted}.`);
  const total = applyDiscountBasisPoints(subtotal, coupon.discount_bps);
  return { total, discount: subtotal - total, couponCode: coupon.code };
}
