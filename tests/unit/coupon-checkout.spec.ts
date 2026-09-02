import { describe, expect, it, vi } from 'vitest';
import { OrdersService } from '../../src/domains/orders/orders.service';
import { CommerceService } from '../../src/domains/commerce/commerce.service';
import { Clock } from '../../src/common/time/clock';
import type { AuthenticatedActor } from '../../src/common/auth/authenticated-actor';
import type { TenantScopeService } from '../../src/common/auth/tenant-scope.service';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import type { EntitlementsService } from '../../src/domains/entitlements/entitlements.service';

const actor = { userId: 'customer' } as AuthenticatedActor;
const input = {
  establishmentId: 'restaurant',
  items: [{ productId: 'dish', quantity: 1 }],
  couponCode: 'bonjour',
};
function fixture(active = true) {
  const coupon = { code: 'BONJOUR', discount_bps: 1000, active, minimum_amount: 0n, expires_at: null };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([coupon]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    auditLog: { create: vi.fn() },
  };
  const prisma = {
    establishment: { findFirst: vi.fn().mockResolvedValue({ id: 'restaurant', organizationId: 'org' }) },
    product: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'dish',
          name: 'Attiéké',
          basePriceAmount: 1005n,
          availability: [] as Array<{ status: string }>,
        },
      ]),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ fullName: 'Client', phoneE164: '+2250700000000' }) },
    $queryRaw: vi.fn().mockResolvedValue([coupon]),
    $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const tenant = { assertEstablishmentInScope: vi.fn(), requireOrganization: () => 'org' };
  const entitlements = {
    assertModuleEnabled: vi.fn().mockResolvedValue(undefined),
    isModuleEnabled: vi.fn().mockResolvedValue(true),
  };
  const args = [
    prisma as unknown as PrismaService,
    tenant as unknown as TenantScopeService,
    entitlements as unknown as EntitlementsService,
    new Clock(),
  ] as const;
  const orders = new OrdersService(...args);
  vi.spyOn(orders, 'schedule').mockResolvedValue({
    timezone: 'Africa/Abidjan',
    asapAvailable: true,
    slots: [],
  });
  return { tx, prisma, tenant, entitlements, orders, commerce: new CommerceService(...args) };
}
describe('Coupon checkout wiring', () => {
  it('quotes the same amounts that checkout saves, and exposes the snapshots', async () => {
    const f = fixture();
    const quote = await f.commerce.quote(input.establishmentId, input.items, input.couponCode);
    f.prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 'order',
          public_ref: 'OMO-TEST',
          establishment_id: 'restaurant',
          status: 'PENDING_RESTAURANT',
          service: 'TAKEAWAY',
          payment_method: 'CASH',
          customer_name: 'Client',
          customer_phone: '',
          notes: null,
          total_amount: 904n,
          subtotal_amount: 1005n,
          discount_amount: 101n,
          coupon_code: 'BONJOUR',
          placed_at: new Date('2026-09-02T12:00:00Z'),
          scheduled_for: null,
          timezone: 'Africa/Abidjan',
          establishment_name: 'Restaurant',
          establishment_slug: 'restaurant',
        },
      ])
      .mockResolvedValueOnce([]);
    const order = await f.orders.create(actor, input);
    const [, ...values] = f.tx.$executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(values.slice(11, 15)).toEqual([1005n, 904n, 'BONJOUR', 101n]);
    expect(order.total).toEqual(quote.total);
    expect(order.discount).toEqual(quote.discount);
    expect(order.subtotal).toEqual(quote.subtotal);
    expect(order.couponCode).toBe('BONJOUR');
    expect(f.tx.$queryRaw).toHaveBeenCalledOnce();
  });
  it('does not insert an order when the coupon has been disabled after the quote', async () => {
    const f = fixture(false);
    await expect(f.orders.create(actor, input)).rejects.toThrow('indisponible');
    expect(f.tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('blocks coupon access when the merchant marketing module is disabled', async () => {
    const f = fixture();
    f.entitlements.assertModuleEnabled.mockRejectedValue(new Error('Module disabled'));
    await expect(f.commerce.quote(input.establishmentId, input.items, input.couponCode)).rejects.toThrow(
      'Module disabled',
    );
    expect(f.prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it('does not let a merchant toggle another restaurant’s coupon', async () => {
    const f = fixture();
    f.prisma.$queryRaw.mockResolvedValueOnce([{ establishment_id: 'other-restaurant' }]);
    f.tenant.assertEstablishmentInScope.mockRejectedValue(new Error('Forbidden'));
    await expect(f.commerce.setCouponActive(actor, 'coupon', false)).rejects.toThrow('Forbidden');
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects a sold-out product already at quote time', async () => {
    const f = fixture();
    f.prisma.product.findMany.mockResolvedValue([
      { id: 'dish', name: 'Attiéké', basePriceAmount: 1005n, availability: [{ status: 'UNAVAILABLE' }] },
    ]);
    await expect(f.commerce.quote(input.establishmentId, input.items)).rejects.toThrow();
  });
});
