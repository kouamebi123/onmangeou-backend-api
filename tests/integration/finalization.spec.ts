import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestContext,
  destroyTestContext,
  payloadOf,
  resetDatabase,
  resetRedis,
  type TestContext,
} from '../helpers/test-app';
import {
  authenticate,
  createMerchant,
  createEstablishment,
  idempotencyKey,
  type MerchantTenant,
} from '../helpers/fixtures';

describe('parcours de finalisation hors paiements réels', () => {
  let context: TestContext;
  let merchant: MerchantTenant;
  let establishmentId: string;
  let mediaDirectory: string;
  beforeAll(async () => {
    mediaDirectory = await mkdtemp(join(tmpdir(), 'onmangeou-media-test-'));
    process.env['MEDIA_LOCAL_ROOT'] = mediaDirectory;
    context = await createTestContext();
    context.app.get(ConfigService).set('MEDIA_LOCAL_ROOT', mediaDirectory);
  });
  afterAll(async () => {
    if (context) await destroyTestContext(context);
    if (mediaDirectory) await rm(mediaDirectory, { recursive: true, force: true });
    delete process.env['MEDIA_LOCAL_ROOT'];
  });
  beforeEach(async () => {
    await resetDatabase(context.prisma);
    await resetRedis(context);
    merchant = await createMerchant(context);
    ({ establishmentId } = await createEstablishment(context, merchant));
    await context
      .http()
      .put('/api/v1/merchant/modules')
      .set('Authorization', `Bearer ${merchant.accessToken}`)
      .send({
        modules: ['orders.manual', 'finance.expenses', 'marketing.promotions'].map((code) => ({
          code,
          enabled: true,
        })),
      })
      .expect(200);
    // Publication is setup here; its verification workflow has its own integration suite.
    await context.prisma.establishment.update({
      where: { id: establishmentId },
      data: { status: 'PUBLISHED' },
    });
  });
  it('rejoue une dépense sans doublon et refuse un prix de commande devenu obsolète', async () => {
    const key = idempotencyKey();
    const expense = { establishmentId, amount: '1200', label: 'Achat cuisine' };
    const first = await context
      .http()
      .post('/api/v1/merchant/expenses')
      .set('Authorization', `Bearer ${merchant.accessToken}`)
      .set('Idempotency-Key', key)
      .send(expense)
      .expect(201);
    // Wait for the existing interceptor to persist the response before simulating a retry.
    await expect
      .poll(async () => (await context.prisma.idempotencyKey.findFirst({ where: { key } }))?.status)
      .toBe('COMPLETED');
    const second = await context
      .http()
      .post('/api/v1/merchant/expenses')
      .set('Authorization', `Bearer ${merchant.accessToken}`)
      .set('Idempotency-Key', key)
      .send(expense)
      .expect(201);
    expect(payloadOf<{ id: string }>(first.body).id).toBe(payloadOf<{ id: string }>(second.body).id);
    const expenseCount = await context.prisma.$queryRaw<
      Array<{ count: number }>
    >`SELECT count(*)::int AS count FROM expenses`;
    expect(expenseCount[0]?.count).toBe(1);
    const created = await context
      .http()
      .post('/api/v1/merchant/products')
      .set('Authorization', `Bearer ${merchant.accessToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ establishmentId, name: 'Plat test', basePriceAmount: '3000' })
      .expect(201);
    const { productId } = payloadOf<{ productId: string }>(created.body);
    await context
      .http()
      .patch(`/api/v1/merchant/products/${productId}/status`)
      .set('Authorization', `Bearer ${merchant.accessToken}`)
      .send({ status: 'PUBLISHED' })
      .expect(204);
    const order = {
      establishmentId,
      customerName: 'Client de salle',
      service: 'DINE_IN',
      paymentMethod: 'CASH',
      items: [{ productId, quantity: 1 }],
      expectedTotalAmount: '2000',
    };
    await context
      .http()
      .post('/api/v1/merchant/orders')
      .set('Authorization', `Bearer ${merchant.accessToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(order)
      .expect(409);
    const accepted = await context
      .http()
      .post('/api/v1/merchant/orders')
      .set('Authorization', `Bearer ${merchant.accessToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ ...order, expectedTotalAmount: '3000' })
      .expect(201);
    const { id } = payloadOf<{ id: string }>(accepted.body);
    for (const status of ['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED']) {
      await context
        .http()
        .post(`/api/v1/merchant/orders/${id}/status`)
        .set('Authorization', `Bearer ${merchant.accessToken}`)
        .send({ status })
        .expect(201);
    }
  });
  it('traite les images et sert une miniature après une vraie transaction PostgreSQL', async () => {
    const image = await sharp({ create: { width: 1800, height: 900, channels: 3, background: 'blue' } })
      .jpeg()
      .withMetadata()
      .toBuffer();
    const response = await context
      .http()
      .post(`/api/v1/media/establishments/${establishmentId}/cover`)
      .set('Authorization', `Bearer ${merchant.accessToken}`)
      .attach('image', image, { filename: 'cover.jpg', contentType: 'image/jpeg' })
      .expect(201);
    const { url, thumbnailUrl } = payloadOf<{ url: string; thumbnailUrl: string }>(response.body);
    const main = await context.http().get(new URL(url).pathname).expect(200);
    const thumbnail = await context.http().get(new URL(thumbnailUrl).pathname).expect(200);
    expect((await sharp(main.body as Buffer).metadata()).exif).toBeUndefined();
    expect((await sharp(thumbnail.body as Buffer).metadata()).width).toBe(400);
    const rows = await context.prisma.$queryRaw<
      Array<{ count: number }>
    >`SELECT count(*)::int AS count FROM media_assets`;
    expect(rows[0]?.count).toBe(1);
  });
  it('réserve la supervision aux administrateurs et détecte une tâche bloquée', async () => {
    await context
      .http()
      .get('/api/v1/admin/operations')
      .set('Authorization', `Bearer ${merchant.accessToken}`)
      .expect(403);
    const admin = await authenticate(context);
    await context.prisma.platformStaff.create({ data: { userId: admin.userId, role: 'ADMIN' } });
    await context.prisma
      .$executeRaw`UPDATE outbox_events SET status='PROCESSING', available_at=now()-interval '20 minutes'`;
    const response = await context
      .http()
      .get('/api/v1/admin/operations')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(payloadOf<{ healthy: boolean }>(response.body).healthy).toBe(false);
  });
  it('diffuse uniquement après validation admin et déduplique les événements', async () => {
    const created = await context
      .http()
      .post('/api/v1/merchant/ad-campaigns')
      .set('Authorization', `Bearer ${merchant.accessToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        establishmentId,
        title: 'Menu du jour',
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 86400_000).toISOString(),
      })
      .expect(201);
    const { id } = payloadOf<{ id: string }>(created.body);
    expect(payloadOf((await context.http().get('/api/v1/sponsored').expect(200)).body)).toBeNull();
    const admin = await authenticate(context);
    await context.prisma.platformStaff.create({ data: { userId: admin.userId, role: 'ADMIN' } });
    await context
      .http()
      .post(`/api/v1/admin/ad-campaigns/${id}/decision`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'APPROVED', reason: 'Contenu contrôlé' })
      .expect(201);
    const ad = payloadOf<{ viewId: string }>(
      (await context.http().get('/api/v1/sponsored').expect(200)).body,
    );
    for (const event of ['IMPRESSION', 'IMPRESSION', 'CLICK', 'CLICK'])
      await context.http().post(`/api/v1/sponsored/${ad.viewId}/events`).send({ event }).expect(201);
    const rows = payloadOf<Array<{ impressions: string; clicks: string }>>(
      (
        await context
          .http()
          .get('/api/v1/merchant/ad-campaigns')
          .query({ establishmentId })
          .set('Authorization', `Bearer ${merchant.accessToken}`)
          .expect(200)
      ).body,
    );
    expect(rows[0]).toMatchObject({ impressions: '1', clicks: '1' });
    await context
      .http()
      .post(`/api/v1/merchant/ad-campaigns/${id}/pause`)
      .set('Authorization', `Bearer ${merchant.accessToken}`)
      .expect(201);
    expect(payloadOf((await context.http().get('/api/v1/sponsored').expect(200)).body)).toBeNull();
  });
});
