import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { ConfigService } from '@nestjs/config';
import { MediaService } from '../../src/infrastructure/media/media.service';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import type { TenantScopeService } from '../../src/common/auth/tenant-scope.service';
import type { AuthenticatedActor } from '../../src/common/auth/authenticated-actor';
const actor: AuthenticatedActor = {
  userId: 'user',
  sessionId: 'session',
  establishmentIds: [],
  permissions: new Set(),
};
function fixture(quota = 1000000) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    userProfile: { upsert: vi.fn().mockResolvedValue({}) },
  };
  const prisma = { $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx) };
  const storage = {
    put: vi
      .fn()
      .mockResolvedValueOnce({ key: 'main.webp', publicUrl: '/main.webp' })
      .mockResolvedValueOnce({ key: 'thumb.webp', publicUrl: '/thumb.webp' }),
    read: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const service = new MediaService(
    storage,
    prisma as unknown as PrismaService,
    {} as TenantScopeService,
    new ConfigService({ MEDIA_USER_QUOTA_BYTES: quota }),
  );
  return { service, storage, tx };
}
async function file() {
  const buffer = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'blue' } })
    .png()
    .toBuffer();
  return { buffer, size: buffer.length, mimetype: 'image/png' };
}
describe('quota et remplacement de média', () => {
  it('refuse le dépassement avant de stocker les fichiers', async () => {
    const f = fixture(1);
    await expect(f.service.setAvatar(actor, await file())).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(f.storage.put).not.toHaveBeenCalled();
    expect(f.tx.userProfile.upsert).not.toHaveBeenCalled();
  });
  it('enregistre la photo traitée et sa miniature', async () => {
    const f = fixture();
    expect(await f.service.setAvatar(actor, await file())).toEqual({
      url: '/main.webp',
      thumbnailUrl: '/main.webp/thumbnail',
    });
    expect(f.storage.put).toHaveBeenCalledTimes(2);
    expect(f.storage.put.mock.calls[0]?.[0]).toMatchObject({ contentType: 'image/webp' });
  });
  it('nettoie les nouveaux fichiers si le rattachement échoue', async () => {
    const f = fixture();
    f.tx.userProfile.upsert.mockRejectedValue(new Error('database'));
    await expect(f.service.setAvatar(actor, await file())).rejects.toThrow('database');
    expect(f.storage.delete).toHaveBeenCalledWith('main.webp');
    expect(f.storage.delete).toHaveBeenCalledWith('thumb.webp');
  });
});
