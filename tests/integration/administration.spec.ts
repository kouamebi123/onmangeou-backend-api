import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestContext,
  destroyTestContext,
  payloadOf,
  resetDatabase,
  resetRedis,
  type TestContext,
} from '../helpers/test-app';
import { authenticate, createEstablishment, createMerchant, idempotencyKey } from '../helpers/fixtures';

describe('administration plateforme', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestContext();
  });

  afterAll(async () => {
    await destroyTestContext(context);
  });

  beforeEach(async () => {
    await resetDatabase(context.prisma);
    await resetRedis(context);
  });

  it('un restaurant ne consulte pas les dossiers de verification', async () => {
    const merchant = await createMerchant(context, { name: 'Chez Marie' });

    const response = await context
      .http()
      .get('/api/v1/admin/verification-cases')
      .set('Authorization', `Bearer ${merchant.accessToken}`)
      .expect(403);

    expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('un administrateur approuve un dossier et verifie l etablissement', async () => {
    const merchant = await createMerchant(context, { name: 'Chez Awa' });
    const establishment = await createEstablishment(context, merchant, { name: 'Awa Cocody' });

    const submitted = await context
      .http()
      .post(`/api/v1/merchant/establishments/${establishment.establishmentId}/verification`)
      .set('Authorization', `Bearer ${merchant.accessToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .expect(201);

    const dossier = payloadOf<{ caseId: string }>(submitted.body);

    const adminUser = await authenticate(context);
    await context.prisma.platformStaff.create({
      data: { userId: adminUser.userId, role: 'ADMIN' },
    });

    const listed = await context
      .http()
      .get('/api/v1/admin/verification-cases')
      .set('Authorization', `Bearer ${adminUser.accessToken}`)
      .expect(200);

    const cases = payloadOf<Array<{ id: string }>>(listed.body);
    expect(cases.map((item) => item.id)).toContain(dossier.caseId);

    await context
      .http()
      .post(`/api/v1/admin/verification-cases/${dossier.caseId}/decide`)
      .set('Authorization', `Bearer ${adminUser.accessToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ decision: 'APPROVED', reason: 'Documents coherents, visite confirmee.' })
      .expect(201);

    const establishmentRow = await context.prisma.establishment.findUniqueOrThrow({
      where: { id: establishment.establishmentId },
      select: { verifiedAt: true },
    });

    expect(establishmentRow.verifiedAt).not.toBeNull();

    const organization = await context.prisma.organization.findUniqueOrThrow({
      where: { id: merchant.organizationId },
      select: { status: true },
    });

    expect(organization.status).toBe('VERIFIED');
  });

  it('le journal d audit n est pas alterable via l API', async () => {
    const adminUser = await authenticate(context);
    await context.prisma.platformStaff.create({
      data: { userId: adminUser.userId, role: 'ADMIN' },
    });

    const response = await context
      .http()
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${adminUser.accessToken}`)
      .expect(200);

    expect(Array.isArray(payloadOf(response.body))).toBe(true);
  });

  it('un administrateur publie le bareme lu ensuite par le catalogue marchand', async () => {
    const adminUser = await authenticate(context);
    await context.prisma.platformStaff.create({
      data: { userId: adminUser.userId, role: 'ADMIN' },
    });

    await context
      .http()
      .put('/api/v1/admin/module-prices')
      .set('Authorization', `Bearer ${adminUser.accessToken}`)
      .send({
        notice: 'Barème officiel publié depuis le back-office.',
        modules: [
          { code: 'storefront.basic', monthlyPriceAmount: 0 },
          { code: 'orders.marketplace', monthlyPriceAmount: 8000 },
        ],
      })
      .expect(200);

    const catalog = await context.http().get('/api/v1/merchant/module-catalog').expect(200);
    const payload = payloadOf<{
      published: boolean;
      notice: string;
      modules: Array<{ code: string; monthlyPrice: { amount: string } }>;
    }>(catalog.body);

    expect(payload.published).toBe(true);
    expect(payload.notice).toBe('Barème officiel publié depuis le back-office.');
    expect(payload.modules.find((item) => item.code === 'orders.marketplace')?.monthlyPrice.amount).toBe(
      '8000',
    );
    expect(payload).not.toHaveProperty('sandbox');
  });
});
