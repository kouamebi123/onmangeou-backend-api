import type { Prisma } from '../../infrastructure/prisma/generated/client';
import { calculateCoupon, normalizeCouponCode, type CouponRule } from './coupon-rules';

/** A shared row lock serializes checkout against coupon updates until the order is saved. */
export async function priceCoupon(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>,
  establishmentId: string,
  subtotal: bigint,
  code: string | undefined,
  now: () => Date,
) {
  if (!code) return { total: subtotal, discount: 0n, couponCode: null };
  const normalized = normalizeCouponCode(code);
  const rows = await db.$queryRaw<CouponRule[]>`
    SELECT code, discount_bps, active, expires_at, minimum_amount FROM coupons
    WHERE establishment_id=${establishmentId}::uuid AND code=${normalized} FOR SHARE`;
  return calculateCoupon(subtotal, rows[0] ?? null, now());
}
