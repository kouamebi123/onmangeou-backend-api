import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppConfigService } from '../../common/config/app-config.service';
import { DomainError } from '../../common/errors/domain.error';
import type { MediaStorage, StoredMedia } from './media-storage.port';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class LocalMediaStorage implements MediaStorage {
  constructor(private readonly config: AppConfigService) {}

  async put(input: { bytes: Buffer; contentType: string }): Promise<StoredMedia> {
    const extension = EXTENSIONS[input.contentType];
    if (!extension) {
      throw new DomainError('VALIDATION_FAILED', 'Format image refuse', {
        publicDetail: 'Choisissez une image JPEG, PNG ou WebP.',
      });
    }
    await mkdir(this.config.media.localRoot, { recursive: true });
    const key = `${randomUUID()}.${extension}`;
    await writeFile(join(this.config.media.localRoot, key), input.bytes, { flag: 'wx' });
    return { key, publicUrl: `${this.config.media.publicBaseUrl.replace(/\/$/, '')}/${key}` };
  }

  async read(key: string): Promise<{ bytes: Buffer; contentType: string }> {
    if (!/^[0-9a-f-]+\.(jpg|png|webp)$/.test(key)) {
      throw new DomainError('NOT_FOUND', 'Image introuvable');
    }
    try {
      const bytes = await readFile(join(this.config.media.localRoot, key));
      const extension = key.split('.').pop();
      const contentType = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
      return { bytes, contentType };
    } catch (cause: unknown) {
      throw new DomainError('NOT_FOUND', 'Image introuvable', { cause });
    }
  }

  async delete(key: string): Promise<void> {
    await rm(join(this.config.media.localRoot, key), { force: true });
  }
}
