import { describe, expect, it, vi } from 'vitest';
import { Clock } from '../../src/common/time/clock';
import { decodeCursor, encodeCursor } from '../../src/common/pagination/cursor';
import { CommerceService } from '../../src/domains/commerce/commerce.service';
import { canAdvanceDelivery } from '../../src/domains/commerce/delivery-rules';
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLE_PERMISSION_MATRIX,
  REAUTH_REQUIRED_PERMISSIONS,
} from '../../src/common/auth/permissions';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import type { TenantScopeService } from '../../src/common/auth/tenant-scope.service';
import type { EntitlementsService } from '../../src/domains/entitlements/entitlements.service';
import type { AuthenticatedActor } from '../../src/common/auth/authenticated-actor';

const actor: AuthenticatedActor = {
  userId: 'user',
  sessionId: 'session',
  organizationId: 'org',
  establishmentIds: ['est'],
  permissions: new Set(),
};
function fixture() {
  const tx = {
    $queryRaw: vi.fn<(strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>>(),
    $executeRaw: vi
      .fn<(strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>>()
      .mockResolvedValue(1),
  };
  const prisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const tenant = {
    requireOrganization: () => 'org',
    assertEstablishmentInScope: vi.fn().mockResolvedValue(undefined),
  };
  const entitlements = { isModuleEnabled: vi.fn().mockResolvedValue(true) };
  return {
    tx,
    prisma,
    tenant,
    entitlements,
    service: new CommerceService(
      prisma as unknown as PrismaService,
      tenant as unknown as TenantScopeService,
      entitlements as unknown as EntitlementsService,
      new Clock(),
    ),
  };
}

describe('Reservation history', () => {
  it('returns 20 terminal bookings with a stable next cursor and establishment scope', async () => {
    const f = fixture();
    const rows = Array.from({ length: 21 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      starts_at: new Date('2026-09-01T12:00:00Z'),
    }));
    f.prisma.$queryRaw.mockResolvedValue(rows);
    const page = await f.service.listReservationHistory(actor, 'est');
    expect(page.items).toHaveLength(20);
    expect(decodeCursor(page.nextCursor ?? '')).toEqual({
      id: rows[19]?.id,
      sortValue: '2026-09-01T12:00:00.000Z',
    });
    expect(f.tenant.assertEstablishmentInScope).toHaveBeenCalledWith(actor, 'est');
    const sql = (f.prisma.$queryRaw.mock.calls[0]?.[0] as TemplateStringsArray).join('');
    expect(sql).toContain("'COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'");
    expect(sql).toContain('ORDER BY r.starts_at DESC, r.id DESC LIMIT 21');
  });
  it('rejects invalid date or UUID cursors before querying', async () => {
    const f = fixture();
    await expect(
      f.service.listReservationHistory(actor, 'est', encodeCursor({ sortValue: 'invalid', id: 'invalid' })),
    ).rejects.toThrow();
    expect(f.prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it('does not query bookings outside the permitted establishment', async () => {
    const f = fixture();
    f.tenant.assertEstablishmentInScope.mockRejectedValue(new Error('Forbidden'));
    await expect(f.service.listReservationHistory(actor, 'other')).rejects.toThrow('Forbidden');
    expect(f.prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('Delivery contract', () => {
  it('only permits ordered steps on an accepted or ready delivery order', () => {
    expect(canAdvanceDelivery('UNASSIGNED', 'ASSIGNED', 'ACCEPTED', 'DELIVERY')).toBe(true);
    expect(canAdvanceDelivery('ASSIGNED', 'PICKED_UP', 'READY', 'DELIVERY')).toBe(true);
    expect(canAdvanceDelivery('PICKED_UP', 'DELIVERING', 'READY', 'DELIVERY')).toBe(true);
    expect(canAdvanceDelivery('DELIVERING', 'DELIVERED', 'READY', 'DELIVERY')).toBe(true);
    expect(canAdvanceDelivery('ASSIGNED', 'DELIVERED', 'READY', 'DELIVERY')).toBe(false);
    expect(canAdvanceDelivery('ASSIGNED', 'PICKED_UP', 'PREPARING', 'DELIVERY')).toBe(false);
    expect(canAdvanceDelivery('DELIVERING', 'DELIVERED', 'CANCELLED', 'DELIVERY')).toBe(false);
    expect(canAdvanceDelivery('DELIVERING', 'DELIVERED', 'READY', 'TAKEAWAY')).toBe(false);
  });
  it('writes delivery and order completion inside the same transaction', async () => {
    const f = fixture();
    f.prisma.$queryRaw.mockResolvedValue([{ establishment_id: 'est', order_id: 'order' }]);
    f.tx.$queryRaw
      .mockResolvedValueOnce([{ status: 'READY', service: 'DELIVERY' }])
      .mockResolvedValueOnce([{ status: 'DELIVERING' }]);
    await f.service.changeDelivery(actor, 'task', { status: 'DELIVERED' });
    expect(f.prisma.$transaction).toHaveBeenCalledOnce();
    expect(f.tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(f.tx.$executeRaw.mock.calls[1]?.[0].join('')).toContain("status = 'COMPLETED'");
  });
  it('does not write an out-of-order delivery', async () => {
    const f = fixture();
    f.prisma.$queryRaw.mockResolvedValue([{ establishment_id: 'est', order_id: 'order' }]);
    f.tx.$queryRaw
      .mockResolvedValueOnce([{ status: 'READY', service: 'DELIVERY' }])
      .mockResolvedValueOnce([{ status: 'ASSIGNED' }]);
    await expect(f.service.changeDelivery(actor, 'task', { status: 'DELIVERED' })).rejects.toThrow();
    expect(f.tx.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('Table allocation', () => {
  it('refuses confirmation when no suitable table is available', async () => {
    const f = fixture();
    f.prisma.$queryRaw.mockResolvedValue([{ establishment_id: 'est' }]);
    f.tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { status: 'REQUESTED', starts_at: new Date('2099-01-01'), party_size: 4, table_id: null },
      ])
      .mockResolvedValueOnce([]);
    await expect(f.service.changeReservationStatus(actor, 'reservation', 'CONFIRMED')).rejects.toThrow();
    expect(f.tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('locks the establishment and records the selected table', async () => {
    const f = fixture();
    f.prisma.$queryRaw
      .mockResolvedValueOnce([{ establishment_id: 'est' }])
      .mockResolvedValueOnce([{ id: 'reservation' }]);
    f.tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { status: 'REQUESTED', starts_at: new Date('2099-01-01'), party_size: 4, table_id: null },
      ])
      .mockResolvedValueOnce([{ id: 'table' }]);
    await f.service.changeReservationStatus(actor, 'reservation', 'CONFIRMED');
    expect(f.tx.$queryRaw.mock.calls[0]?.[0].join('')).toContain('FOR UPDATE');
    const allocation = f.tx.$queryRaw.mock.calls[2]?.[0] as unknown as { text: string };
    expect(allocation.text).toContain('NOT EXISTS');
    expect(allocation.text.match(/::timestamptz/g)).toHaveLength(3);
    expect(f.tx.$executeRaw.mock.calls[0]).toContain('table');
  });
});

describe('Sandbox payment consistency', () => {
  it('does not confirm a cancelled order', async () => {
    const f = fixture();
    f.prisma.$queryRaw.mockResolvedValue([{ order_id: 'order', user_id: actor.userId }]);
    f.tx.$queryRaw
      .mockResolvedValueOnce([{ status: 'CANCELLED' }])
      .mockResolvedValueOnce([{ status: 'REQUIRES_ACTION' }]);
    await expect(f.service.confirmSandboxIntent(actor, 'intent')).rejects.toThrow();
    expect(f.tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('never resurrects a refunded payment', async () => {
    const f = fixture();
    f.prisma.$queryRaw.mockResolvedValue([{ order_id: 'order', user_id: actor.userId }]);
    f.tx.$queryRaw
      .mockResolvedValueOnce([{ status: 'PENDING_PAYMENT' }])
      .mockResolvedValueOnce([{ status: 'REFUNDED' }]);
    await expect(f.service.confirmSandboxIntent(actor, 'intent')).rejects.toThrow();
    expect(f.tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('replays successful confirmation without another write', async () => {
    const f = fixture();
    f.prisma.$queryRaw.mockResolvedValue([{ order_id: 'order', user_id: actor.userId }]);
    f.tx.$queryRaw
      .mockResolvedValueOnce([{ status: 'PENDING_RESTAURANT' }])
      .mockResolvedValueOnce([{ status: 'SUCCEEDED' }]);
    expect(await f.service.confirmSandboxIntent(actor, 'intent')).toEqual({
      id: 'intent',
      status: 'SUCCEEDED',
      replayed: true,
    });
    expect(f.tx.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('Administrative write permissions', () => {
  it('does not grant mutation permissions to read-only support', () => {
    for (const code of [
      PLATFORM_PERMISSIONS.ADMIN_PAYMENT_REFUND,
      PLATFORM_PERMISSIONS.ADMIN_REVIEW_MODERATE,
      PLATFORM_PERMISSIONS.ADMIN_SUPPORT_WRITE,
    ]) {
      expect(PLATFORM_ROLE_PERMISSION_MATRIX.ADMIN).toContain(code);
      expect(PLATFORM_ROLE_PERMISSION_MATRIX.SUPPORT).not.toContain(code);
    }
    expect(REAUTH_REQUIRED_PERMISSIONS.has(PLATFORM_PERMISSIONS.ADMIN_PAYMENT_REFUND)).toBe(true);
  });
});
