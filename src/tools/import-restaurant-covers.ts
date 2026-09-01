import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppModule } from '../app.module';
import { AppConfigService } from '../common/config/app-config.service';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { MEDIA_STORAGE, type MediaStorage } from '../infrastructure/media/media-storage.port';
import { DEMO_SLUGS } from './demo-media-manifest';

interface Target {
  id: string;
  slug: string;
  name: string;
  previousUrl: string;
  image: string;
  sha256: string;
}
type Prepared = Target & { key: string; publicUrl: string };

async function main() {
  const root = join(process.cwd(), 'assets/demo-media');
  const targets = JSON.parse(await readFile(join(root, 'restaurant-covers-v1.json'), 'utf8')) as Target[];
  if (
    targets.length !== DEMO_SLUGS.length ||
    new Set(targets.map((item) => item.id)).size !== targets.length ||
    new Set(targets.map((item) => item.sha256)).size !== targets.length ||
    !DEMO_SLUGS.every((slug) => targets.filter((item) => item.slug === slug).length === 1)
  ) {
    throw new Error('Invalid or duplicate restaurant cover targets');
  }
  const images = new Map<string, Buffer>();
  for (const item of targets) {
    if (!/^cover-[a-z-]+$/.test(item.image)) throw new Error('Invalid cover filename');
    const bytes = await readFile(join(root, item.image + '.webp'));
    if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) {
      throw new Error('Cover asset checksum mismatch: ' + item.slug);
    }
    images.set(item.id, bytes);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const prisma = app.get(PrismaService);
    const storage = app.get<MediaStorage>(MEDIA_STORAGE);
    const config = app.get(AppConfigService);
    const backup = join(config.media.localRoot, 'restaurant-covers-v1-rollback.json');
    const rows = await prisma.establishment.findMany({
      where: { slug: { in: targets.map((item) => item.slug) }, deletedAt: null },
      select: { id: true, slug: true, coverImageUrl: true },
    });
    if (rows.length !== targets.length) throw new Error('Restaurant count changed; import cancelled');

    let prepared: Prepared[] = [];
    if (existsSync(backup)) {
      prepared = JSON.parse(await readFile(backup, 'utf8')) as Prepared[];
      if (
        prepared.length !== targets.length ||
        !targets.every((target) =>
          prepared.some(
            (item) =>
              item.id === target.id &&
              item.slug === target.slug &&
              item.sha256 === target.sha256 &&
              item.previousUrl === target.previousUrl,
          ),
        )
      ) {
        throw new Error('Existing rollback manifest does not match these targets');
      }
      if (
        prepared.every((item) =>
          rows.some((row) => row.id === item.id && row.coverImageUrl === item.publicUrl),
        )
      ) {
        process.stdout.write('Restaurant covers v1 already applied; no changes.\n');
        return;
      }
    }
    for (const target of targets) {
      if (
        !rows.some(
          (row) =>
            row.id === target.id && row.slug === target.slug && row.coverImageUrl === target.previousUrl,
        )
      ) {
        throw new Error('Cover changed since approval; import cancelled: ' + target.slug);
      }
    }
    process.stdout.write(
      JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'dry-run', targets }) + '\n',
    );
    if (!process.argv.includes('--apply')) return;

    if (prepared.length === 0) {
      for (const item of targets) {
        const media = await storage.put({ bytes: images.get(item.id)!, contentType: 'image/webp' });
        prepared.push({ ...item, ...media });
      }
      await mkdir(config.media.localRoot, { recursive: true });
      // Keep the old files and this durable receipt for rollback and safe restart.
      await writeFile(backup, JSON.stringify(prepared, null, 2), { flag: 'wx' });
    }
    await prisma.$transaction(async (tx) => {
      for (const item of prepared) {
        const result = await tx.establishment.updateMany({
          where: { id: item.id, slug: item.slug, coverImageUrl: item.previousUrl, deletedAt: null },
          data: { coverImageUrl: item.publicUrl },
        });
        if (result.count !== 1) throw new Error('Concurrent cover update; transaction cancelled');
      }
    });
    process.stdout.write(
      JSON.stringify({ message: 'Distinct restaurant covers imported', count: prepared.length, backup }) +
        '\n',
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    'Restaurant cover import failed: ' + (error instanceof Error ? error.message : 'unknown error') + '\n',
  );
  process.exitCode = 1;
});
