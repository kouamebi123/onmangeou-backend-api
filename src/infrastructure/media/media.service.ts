import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { TenantScopeService } from '../../common/auth/tenant-scope.service';
import { DomainError } from '../../common/errors/domain.error';
import { PrismaService } from '../prisma/prisma.service';
import { MEDIA_STORAGE, type MediaStorage, type StoredMedia } from './media-storage.port';
import { processImage } from './process-image';
import type { Prisma } from '../prisma/generated/client';
import { ConfigService } from '@nestjs/config';

export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Injectable()
export class MediaService {
  constructor(
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    private readonly prisma: PrismaService,
    private readonly tenant: TenantScopeService,
    private readonly config: ConfigService,
  ) {}

  async read(key: string) {
    return this.storage.read(key);
  }

  async thumbnail(key: string) {
    const rows = await this.prisma.$queryRaw<Array<{ thumbnail_key: string }>>`
      SELECT thumbnail_key FROM media_assets WHERE storage_key=${key}`;
    if (!rows[0]) throw new DomainError('NOT_FOUND', 'Miniature introuvable');
    return this.storage.read(rows[0].thumbnail_key);
  }

  async setAvatar(actor: AuthenticatedActor, file: UploadedImage) {
    return this.replace(`user:${actor.userId}`, `avatar:${actor.userId}`, file, async (tx, stored) => {
      await tx.userProfile.upsert({
        where: { userId: actor.userId },
        create: { userId: actor.userId, avatarUrl: stored.publicUrl },
        update: { avatarUrl: stored.publicUrl },
      });
    });
  }

  async setEstablishmentCover(actor: AuthenticatedActor, id: string, file: UploadedImage) {
    await this.tenant.assertEstablishmentInScope(actor, id);
    return this.replace(`establishment:${id}`, `cover:${id}`, file, async (tx, stored) => {
      await tx.establishment.update({ where: { id }, data: { coverImageUrl: stored.publicUrl } });
    });
  }

  async setProductImage(actor: AuthenticatedActor, id: string, file: UploadedImage) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId: this.tenant.requireOrganization(actor), deletedAt: null },
      select: { id: true, establishmentId: true },
    });
    if (!product || !actor.establishmentIds.includes(product.establishmentId)) {
      throw new DomainError('NOT_FOUND', 'Plat introuvable');
    }
    return this.replace(
      `establishment:${product.establishmentId}`,
      `product:${id}`,
      file,
      async (tx, stored) => {
        await tx.product.update({ where: { id }, data: { imageUrl: stored.publicUrl } });
        await tx.productImage.deleteMany({ where: { productId: id, position: 0 } });
        await tx.productImage.create({ data: { productId: id, storageKey: stored.key, position: 0 } });
      },
    );
  }

  private async replace(
    owner: string,
    resource: string,
    file: UploadedImage,
    attach: (tx: Prisma.TransactionClient, stored: StoredMedia) => Promise<void>,
  ) {
    const processed = await this.store(file);
    const uploaded: string[] = [];
    let retired: Array<{ storage_key: string; thumbnail_key: string }> = [];
    const limit = Number(
      this.config.get(
        owner.startsWith('user:') ? 'MEDIA_USER_QUOTA_BYTES' : 'MEDIA_ESTABLISHMENT_QUOTA_BYTES',
      ),
    );
    if (!Number.isSafeInteger(limit) || limit <= 0)
      throw new DomainError('INTERNAL_ERROR', 'Quota média non configuré');
    let result: { url: string; thumbnailUrl: string };
    try {
      result = await this.prisma.$transaction(
        async (tx) => {
          // Serializes replacements and quota reservations for the same owner.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${owner}, 0))`;
          const usage = await tx.$queryRaw<Array<{ total: bigint }>>`
          SELECT COALESCE(SUM(byte_size),0)::bigint AS total FROM media_assets
          WHERE owner_key=${owner} AND resource_key<>${resource}`;
          if (
            BigInt(usage[0]?.total ?? 0) + BigInt(processed.bytes.length + processed.thumbnail.length) >
            BigInt(limit)
          ) {
            throw new DomainError('VALIDATION_FAILED', 'Quota média dépassé', {
              publicDetail: 'Le quota de stockage des images est atteint.',
            });
          }
          retired = await tx.$queryRaw<Array<{ storage_key: string; thumbnail_key: string }>>`
          SELECT storage_key, thumbnail_key FROM media_assets WHERE resource_key=${resource}`;
          const main = await this.storage.put({ bytes: processed.bytes, contentType: 'image/webp' });
          uploaded.push(main.key);
          const thumbnail = await this.storage.put({ bytes: processed.thumbnail, contentType: 'image/webp' });
          uploaded.push(thumbnail.key);
          await attach(tx, main);
          await tx.$executeRaw`
          INSERT INTO media_assets(resource_key,owner_key,storage_key,thumbnail_key,byte_size)
          VALUES (${resource},${owner},${main.key},${thumbnail.key},${processed.bytes.length + processed.thumbnail.length})
          ON CONFLICT(resource_key) DO UPDATE SET storage_key=EXCLUDED.storage_key,
          thumbnail_key=EXCLUDED.thumbnail_key,byte_size=EXCLUDED.byte_size,updated_at=NOW()`;
          return { url: main.publicUrl, thumbnailUrl: `${main.publicUrl}/thumbnail` };
        },
        { timeout: 15000 },
      );
    } catch (error) {
      await Promise.all(uploaded.map((key) => this.storage.delete(key).catch(() => undefined)));
      throw error;
    }
    // Database now points to the new images; a failed cleanup must not undo the response.
    await Promise.all(
      retired
        .flatMap((row) => [row.storage_key, row.thumbnail_key])
        .map((key) => this.storage.delete(key).catch(() => undefined)),
    );
    return result;
  }

  private async store(file: UploadedImage) {
    if (!file || file.size === 0) {
      throw new DomainError('VALIDATION_FAILED', 'Fichier image absent', {
        publicDetail: 'Choisissez une image.',
      });
    }
    if (file.size > 8 * 1024 * 1024) {
      throw new DomainError('VALIDATION_FAILED', 'Image trop volumineuse', {
        publicDetail: "L'image ne doit pas dépasser 8 Mo.",
      });
    }
    if (!matchesImageSignature(file.buffer, file.mimetype)) {
      throw new DomainError('VALIDATION_FAILED', 'Contenu image invalide', {
        publicDetail: 'Le fichier choisi ne correspond pas à une image JPEG, PNG ou WebP valide.',
      });
    }
    return processImage(file.buffer);
  }
}

export function matchesImageSignature(bytes: Buffer, contentType: string): boolean {
  if (contentType === 'image/jpeg')
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/png')
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType === 'image/webp')
    return (
      bytes.length >= 12 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP'
    );
  return false;
}
