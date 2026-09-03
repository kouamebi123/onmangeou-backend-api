import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import type { AuthenticatedActor } from '../../src/common/auth/authenticated-actor';
import { ReviewMediaService } from '../../src/infrastructure/media/review-media.service';
import { ReviewReportsService } from '../../src/domains/commerce/review-reports';
import { PushService } from '../../src/infrastructure/notifications/push.service';
import { expoCall, retryDelay, validExpoToken } from '../../src/infrastructure/notifications/expo-push';

const actor: AuthenticatedActor = {
  userId: 'user',
  sessionId: 'session',
  establishmentIds: [],
  permissions: new Set(),
};
function fixture() {
  const tx = { $queryRaw: vi.fn(), $executeRaw: vi.fn().mockResolvedValue(1), auditLog: { create: vi.fn() } };
  const db = {
    ...tx,
    $transaction: vi.fn(async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const storage = {
    put: vi.fn().mockResolvedValue({ key: 'stored.webp', publicUrl: 'unused' }),
    read: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  return {
    tx,
    db,
    storage,
    media: new ReviewMediaService(db as unknown as PrismaService, storage),
    reports: new ReviewReportsService(db as unknown as PrismaService),
    push: new PushService(db as unknown as PrismaService, new ConfigService()),
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('Review photo protections', () => {
  it('rejects a forged MIME signature before writing', async () => {
    const f = fixture();
    await expect(
      f.media.add(actor, 'r', 'p', { buffer: Buffer.from('bad'), size: 3, mimetype: 'image/jpeg' }),
    ).rejects.toThrow();
    expect(f.storage.put).not.toHaveBeenCalled();
  });
  it('requires the owner of a published review', async () => {
    const f = fixture();
    f.tx.$queryRaw.mockResolvedValue([]);
    const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } })
      .png()
      .toBuffer();
    await expect(
      f.media.add(actor, 'r', 'p', { buffer, size: buffer.length, mimetype: 'image/png' }),
    ).rejects.toThrow();
    expect(f.storage.put).not.toHaveBeenCalled();
  });
  it('enforces the three-photo cap under the review lock', async () => {
    const f = fixture();
    f.tx.$queryRaw
      .mockResolvedValueOnce([{ id: 'r' }])
      .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } })
      .png()
      .toBuffer();
    await expect(
      f.media.add(actor, 'r', 'p', { buffer, size: buffer.length, mimetype: 'image/png' }),
    ).rejects.toThrow();
    expect(f.storage.put).not.toHaveBeenCalled();
  });
  it('re-encodes photos without EXIF metadata', async () => {
    const f = fixture();
    f.tx.$queryRaw.mockResolvedValueOnce([{ id: 'r' }]).mockResolvedValueOnce([]);
    const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } })
      .withExif({ IFD0: { Artist: 'Private person' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(buffer).metadata()).exif).toBeDefined();
    await f.media.add(actor, 'r', 'p', { buffer, size: buffer.length, mimetype: 'image/jpeg' });
    const stored = f.storage.put.mock.calls[0]?.[0] as { bytes: Buffer };
    const metadata = await sharp(stored.bytes).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.exif).toBeUndefined();
  });
  it('does not expose hidden review photos', async () => {
    const f = fixture();
    f.db.$queryRaw.mockResolvedValue([]);
    await expect(f.media.read('r', 'p')).rejects.toThrow();
    expect(f.storage.read).not.toHaveBeenCalled();
  });
});
describe('Review reports', () => {
  it('rejects self-reporting', async () => {
    const f = fixture();
    f.db.$queryRaw.mockResolvedValue([{ user_id: 'user' }]);
    await expect(f.reports.report(actor, 'r', { reason: 'SPAM' })).rejects.toThrow();
  });
  it('does not change a resolved report again', async () => {
    const f = fixture();
    f.tx.$queryRaw.mockResolvedValue([{ review_id: 'r', status: 'DISMISSED' }]);
    expect(
      await f.reports.resolve(actor, 'report', { status: 'ACTIONED', resolution: 'test reason' }),
    ).toEqual({ id: 'report', status: 'DISMISSED' });
    expect(f.tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('audits moderation and hides the review in the same transaction', async () => {
    const f = fixture();
    f.tx.$queryRaw.mockResolvedValue([{ review_id: 'r', status: 'OPEN' }]);
    await f.reports.resolve(actor, 'report', { status: 'ACTIONED', resolution: 'private data' });
    expect(f.tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(f.tx.auditLog.create).toHaveBeenCalledOnce();
  });
});
describe('Push delivery', () => {
  it('validates tokens and caps exponential retry delays', () => {
    expect(validExpoToken('ExpoPushToken[abc_12]')).toBe(true);
    expect(validExpoToken('https://evil')).toBe(false);
    expect(retryDelay(100)).toBe(3600);
  });
  it('classifies provider throttling as retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
    await expect(expoCall('send', {})).rejects.toMatchObject({ retryable: true, code: 'HTTP_429' });
  });
  it('cancels delivery after logout, opt-out or lost access', async () => {
    const f = fixture();
    f.db.$queryRaw.mockResolvedValue([]);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await f.push.deliver({ id: 'd', attempts: 1, ticket_id: null, sent_token: null });
    expect(fetch).not.toHaveBeenCalled();
    expect(f.db.$executeRaw.mock.calls[0]).toContain('CANCELLED');
  });
  it('records a ticket without claiming final delivery', async () => {
    const f = fixture();
    f.db.$queryRaw.mockResolvedValue([
      {
        token: 'ExpoPushToken[abc]',
        subscription_id: 's',
        kind: 'ORDER',
        audience: 'CLIENT',
        target_id: 'o',
      },
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { status: 'ok', id: 'ticket' } }))),
    );
    await f.push.deliver({ id: 'd', attempts: 1, ticket_id: null, sent_token: null });
    expect(f.db.$executeRaw.mock.calls[0]).toContain('ticket');
  });
  it('disables an unregistered token using the sent-token snapshot', async () => {
    const f = fixture();
    f.db.$queryRaw.mockResolvedValue([
      { token: 'new', subscription_id: 's', kind: 'ORDER', audience: 'CLIENT', target_id: 'o' },
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { ticket: { status: 'error', details: { error: 'DeviceNotRegistered' } } },
          }),
        ),
      ),
    );
    await f.push.deliver({ id: 'd', attempts: 2, ticket_id: 'ticket', sent_token: 'old' });
    expect(f.db.$executeRaw.mock.calls[0]).toContain('old');
    expect(f.db.$executeRaw.mock.calls[1]).toContain('FAILED');
  });
});
