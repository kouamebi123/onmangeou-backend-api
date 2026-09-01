import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppModule } from '../app.module';
import { AppConfigService } from '../common/config/app-config.service';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { MEDIA_STORAGE, type MediaStorage } from '../infrastructure/media/media-storage.port';
import { DEMO_DISH_IMAGES, DEMO_SLUGS, isReplaceableDemoImage } from './demo-media-manifest';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const prisma = app.get(PrismaService);
    const storage = app.get<MediaStorage>(MEDIA_STORAGE);
    const config = app.get(AppConfigService);
    const establishments = await prisma.establishment.findMany({
      where: { slug: { in: [...DEMO_SLUGS] }, deletedAt: null },
      select: { id: true, slug: true, coverImageUrl: true },
    });
    const products = await prisma.product.findMany({
      where: { establishmentId: { in: establishments.map((item) => item.id) }, deletedAt: null },
      select: { id: true, name: true, imageUrl: true },
    });
    const plan: Array<{
      kind: 'establishment' | 'product';
      id: string;
      previousUrl: string | null;
      image: string;
    }> = [];
    for (const item of establishments) {
      if (isReplaceableDemoImage(item.coverImageUrl)) {
        plan.push({ kind: 'establishment', id: item.id, previousUrl: item.coverImageUrl, image: 'maquis' });
      }
    }
    for (const item of products) {
      const image = DEMO_DISH_IMAGES[item.name];
      if (image && isReplaceableDemoImage(item.imageUrl)) {
        plan.push({ kind: 'product', id: item.id, previousUrl: item.imageUrl, image });
      }
    }
    process.stdout.write(
      JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'dry-run', plan }, null, 2) + '\n',
    );
    if (!process.argv.includes('--apply') || plan.length === 0) return;
    const prepared: Array<(typeof plan)[number] & { key: string; publicUrl: string }> = [];
    try {
      for (const item of plan) {
        const bytes = await readFile(join(process.cwd(), 'assets/demo-media', item.image + '.webp'));
        const media = await storage.put({ bytes, contentType: 'image/webp' });
        prepared.push({ ...item, ...media });
      }
      // Save the exact old/new URLs before changing the database.
      await mkdir(config.media.localRoot, { recursive: true });
      const backup = join(config.media.localRoot, 'demo-media-rollback-' + Date.now() + '.json');
      await writeFile(backup, JSON.stringify(prepared, null, 2), { flag: 'wx' });
      await prisma.$transaction(async (tx) => {
        for (const item of prepared) {
          const result =
            item.kind === 'establishment'
              ? await tx.establishment.updateMany({
                  where: { id: item.id, coverImageUrl: item.previousUrl },
                  data: { coverImageUrl: item.publicUrl },
                })
              : await tx.product.updateMany({
                  where: { id: item.id, imageUrl: item.previousUrl },
                  data: { imageUrl: item.publicUrl },
                });
          if (result.count !== 1) throw new Error('Concurrent image modification; import cancelled');
          if (item.kind === 'product') {
            await tx.productImage.deleteMany({ where: { productId: item.id, position: 0 } });
            await tx.productImage.create({ data: { productId: item.id, storageKey: item.key, position: 0 } });
          }
        }
      });
      process.stdout.write('Images imported. Rollback manifest: ' + backup + '\n');
    } catch (error) {
      await Promise.allSettled(prepared.map((item) => storage.delete(item.key)));
      throw error;
    }
  } finally {
    await app.close();
  }
}
void main().catch(() => {
  process.stderr.write('Demo image import failed; no database changes committed.\n');
  process.exitCode = 1;
});
