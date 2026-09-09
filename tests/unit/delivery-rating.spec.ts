import { describe, expect, it, vi } from 'vitest';
import { CommerceService } from '../../src/domains/commerce/commerce.service';
import { Clock } from '../../src/common/time/clock';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import type { TenantScopeService } from '../../src/common/auth/tenant-scope.service';
import type { EntitlementsService } from '../../src/domains/entitlements/entitlements.service';
import type { AuthenticatedActor } from '../../src/common/auth/authenticated-actor';
const actor: AuthenticatedActor = {
  userId: 'owner',
  sessionId: 'session',
  establishmentIds: [],
  permissions: new Set(),
};
function fixture(service = 'DELIVERY', delivered = true, user = 'owner') {
  const prisma = {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'order',
          establishment_id: 'est',
          customer_user_id: user,
          status: 'COMPLETED',
          service,
          delivered,
        },
      ])
      .mockResolvedValueOnce([{ id: 'review' }])
      .mockResolvedValueOnce([{ id: 'review' }]),
  };
  return {
    prisma,
    service: new CommerceService(
      prisma as unknown as PrismaService,
      {} as TenantScopeService,
      {} as EntitlementsService,
      new Clock(),
    ),
  };
}
describe('notation du livreur', () => {
  it('refuse la note pour un retrait au restaurant', async () => {
    const f = fixture('TAKEAWAY');
    await expect(
      f.service.createReview(actor, { orderId: 'order', score: 4, deliveryScore: 5 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(f.prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('refuse une livraison non terminée', async () => {
    const f = fixture('DELIVERY', false);
    await expect(
      f.service.createReview(actor, { orderId: 'order', score: 4, deliveryScore: 5 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
  it('refuse la commande d’un autre client', async () => {
    const f = fixture('DELIVERY', true, 'other');
    await expect(
      f.service.createReview(actor, { orderId: 'order', score: 4, deliveryScore: 5 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('enregistre les deux notes séparément', async () => {
    const f = fixture();
    await f.service.createReview(actor, { orderId: 'order', score: 4, deliveryScore: 2 });
    expect(f.prisma.$queryRaw.mock.calls[1]?.slice(1)).toContain(4);
    expect(f.prisma.$queryRaw.mock.calls[1]?.slice(1)).toContain(2);
  });
});
