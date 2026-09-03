import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { notFound, validationFailed } from '../../common/errors/domain.error';
import { PrismaService } from '../prisma/prisma.service';
import { MEDIA_STORAGE, type MediaStorage } from './media-storage.port';
import { matchesImageSignature, type UploadedImage } from './media.service';

@Injectable()
export class ReviewMediaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  async add(actor: AuthenticatedActor, reviewId: string, id: string, file: UploadedImage) {
    if (
      !file ||
      !file.size ||
      file.size > 8 * 1024 * 1024 ||
      !matchesImageSignature(file.buffer, file.mimetype)
    ) {
      throw validationFailed([
        {
          field: 'image',
          code: 'INVALID',
          message: 'Choisissez une image JPEG, PNG ou WebP de moins de 8 Mo.',
        },
      ]);
    }
    return this.prisma.$transaction(
      async (tx) => {
        const owner = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM reviews WHERE id=${reviewId}::uuid AND user_id=${actor.userId}::uuid AND status='PUBLISHED' FOR UPDATE`;
        if (!owner[0]) throw notFound('Avis modifiable', reviewId);
        const photos = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM review_photos WHERE review_id=${reviewId}::uuid`;
        if (photos.some((photo) => photo.id === id)) return { id };
        if (photos.length >= 3)
          throw validationFailed([
            { field: 'image', code: 'LIMIT', message: 'Vous pouvez ajouter trois photos maximum par avis.' },
          ]);
        let bytes: Buffer;
        try {
          // Re-encoding strips EXIF/GPS metadata; decoding is bounded against image bombs.
          bytes = await sharp(file.buffer, { limitInputPixels: 25_000_000 })
            .rotate()
            .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer();
        } catch {
          throw validationFailed([
            { field: 'image', code: 'INVALID', message: 'Cette image est illisible ou trop grande.' },
          ]);
        }
        const stored = await this.storage.put({ bytes, contentType: 'image/webp' });
        try {
          await tx.$executeRaw`INSERT INTO review_photos(id,review_id,storage_key) VALUES (${id}::uuid,${reviewId}::uuid,${stored.key})`;
        } catch (error) {
          await this.storage.delete(stored.key).catch(() => undefined);
          throw error;
        }
        return { id };
      },
      { timeout: 15000 },
    );
  }

  async remove(actor: AuthenticatedActor, reviewId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const owner = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM reviews WHERE id=${reviewId}::uuid AND user_id=${actor.userId}::uuid FOR UPDATE`;
      if (!owner[0]) throw notFound('Avis', reviewId);
      const deleted = await tx.$queryRaw<
        Array<{ storage_key: string }>
      >`DELETE FROM review_photos WHERE id=${id}::uuid AND review_id=${reviewId}::uuid RETURNING storage_key`;
      if (deleted[0]) await this.storage.delete(deleted[0].storage_key);
    });
    return { id };
  }

  async read(reviewId: string, id: string) {
    const photos = await this.prisma.$queryRaw<Array<{ storage_key: string }>>`
      SELECT p.storage_key FROM review_photos p JOIN reviews r ON r.id=p.review_id
      WHERE p.id=${id}::uuid AND r.id=${reviewId}::uuid AND r.status='PUBLISHED'`;
    if (!photos[0]) throw notFound('Photo', id);
    return this.storage.read(photos[0].storage_key);
  }
}
