import { Clock } from '../../src/common/time/clock';
import { describe, expect, it, vi } from 'vitest';
import { orderSchedule } from '../../src/domains/orders/order-schedule';
import { OrdersService } from '../../src/domains/orders/orders.service';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import type { TenantScopeService } from '../../src/common/auth/tenant-scope.service';
import type { EntitlementsService } from '../../src/domains/entitlements/entitlements.service';
import type { AuthenticatedActor } from '../../src/common/auth/authenticated-actor';

describe('Order slots', () => {
  const hours = [{ weekDay: 'WEDNESDAY' as const, opensAtMinutes: 720, closesAtMinutes: 840 }];
  it('offers quarter hours with minimum lead time and excludes closing time', () => {
    const result = orderSchedule(new Date('2026-09-02T12:01:00Z'), hours, [], 'Africa/Abidjan');
    expect(result.asapAvailable).toBe(true);
    expect(result.slots[0]).toBe('2026-09-02T12:15:00.000Z');
    expect(result.slots).not.toContain('2026-09-02T14:00:00.000Z');
  });
  it('honours exceptional closures and missing hours', () => {
    const result = orderSchedule(
      new Date('2026-09-02T12:01:00Z'),
      hours,
      [{ dateKey: '2026-09-02', closed: true, opensAtMinutes: null, closesAtMinutes: null }],
      'Africa/Abidjan',
    );
    expect(result.asapAvailable).toBe(false);
    expect(result.slots.some((slot) => slot.startsWith('2026-09-02'))).toBe(false);
    expect(orderSchedule(new Date(), [], [], 'Africa/Abidjan').slots).toEqual([]);
  });
  it('uses restaurant timezone instead of the customer timezone', () => {
    const result = orderSchedule(new Date('2026-09-02T10:01:00Z'), hours, [], 'Europe/Paris');
    expect(result.asapAvailable).toBe(true);
    expect(result.slots[0]).toBe('2026-09-02T10:15:00.000Z');
  });
  it('supports regular service after midnight', () => {
    const result = orderSchedule(
      new Date('2026-09-03T00:00:00Z'),
      [{ weekDay: 'WEDNESDAY', opensAtMinutes: 1080, closesAtMinutes: 1560 }],
      [],
      'Africa/Abidjan',
    );
    expect(result.asapAvailable).toBe(true);
    expect(result.slots[0]).toBe('2026-09-03T00:15:00.000Z');
  });
});

describe('Overnight exceptions', () => {
  it('does not restore regular overnight hours after an exceptional closure', () => {
    const result = orderSchedule(
      new Date('2026-09-03T00:00:00Z'),
      [{ weekDay: 'WEDNESDAY', opensAtMinutes: 1080, closesAtMinutes: 1560 }],
      [{ dateKey: '2026-09-02', closed: true, opensAtMinutes: null, closesAtMinutes: null }],
      'Africa/Abidjan',
    );
    expect(result.asapAvailable).toBe(false);
    expect(result.slots).not.toContain('2026-09-03T00:15:00.000Z');
  });
});

describe('Customer cancellation', () => {
  it.each(['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'REJECTED'])(
    'rejects cancellation of a %s order without writing',
    async (status) => {
      const prisma = {
        $queryRaw: vi.fn().mockResolvedValue([{ status, service: 'TAKEAWAY' }]),
        $transaction: vi.fn(),
      };
      const service = new OrdersService(
        prisma as unknown as PrismaService,
        {} as TenantScopeService,
        {} as EntitlementsService,
        new Clock(),
      );
      const actor = { userId: 'customer' } as AuthenticatedActor;
      await expect(service.cancelMine(actor, 'order')).rejects.toThrow('non annulable');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});
