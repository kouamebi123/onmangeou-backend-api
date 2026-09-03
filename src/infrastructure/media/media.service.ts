import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { TenantScopeService } from '../../common/auth/tenant-scope.service';
import { DomainError } from '../../common/errors/domain.error';
import { PrismaService } from '../prisma/prisma.service';
import { MEDIA_STORAGE, type MediaStorage } from './media-storage.port';

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
  ) {}

  async read(key: string) {
    return this.storage.read(key);
  }

  async setAvatar(actor: AuthenticatedActor, file: UploadedImage): Promise<{ url: string }> {
    const stored = await this.store(file);
    await this.prisma.userProfile.upsert({
      where: { userId: actor.userId },
      create: { userId: actor.userId, avatarUrl: stored.publicUrl },
      update: { avatarUrl: stored.publicUrl },
    });
    return { url: stored.publicUrl };
  }

  async setEstablishmentCover(
    actor: AuthenticatedActor,
    id: string,
    file: UploadedImage,
  ): Promise<{ url: string }> {
    await this.tenant.assertEstablishmentInScope(actor, id);
    const stored = await this.store(file);
    await this.prisma.establishment.update({ where: { id }, data: { coverImageUrl: stored.publicUrl } });
    return { url: stored.publicUrl };
  }

  async setProductImage(
    actor: AuthenticatedActor,
    id: string,
    file: UploadedImage,
  ): Promise<{ url: string }> {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId: this.tenant.requireOrganization(actor), deletedAt: null },
      select: { id: true, establishmentId: true },
    });
    if (!product || !actor.establishmentIds.includes(product.establishmentId)) {
      throw new DomainError('NOT_FOUND', 'Plat introuvable');
    }
    const previous = await this.prisma.productImage.findFirst({
      where: { productId: id, position: 0 },
      select: { storageKey: true },
    });
    const stored = await this.store(file);
    await this.prisma.$transaction([
      this.prisma.product.update({ where: { id }, data: { imageUrl: stored.publicUrl } }),
      this.prisma.productImage.deleteMany({ where: { productId: id, position: 0 } }),
      this.prisma.productImage.create({ data: { productId: id, storageKey: stored.key, position: 0 } }),
    ]);
    if (previous) await this.storage.delete(previous.storageKey);
    return { url: stored.publicUrl };
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
    return this.storage.put({ bytes: file.buffer, contentType: file.mimetype });
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
