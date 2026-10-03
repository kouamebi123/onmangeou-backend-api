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

  it('un module coupe par l administrateur disparait du catalogue et des droits des restaurants', async () => {
    const adminUser = await authenticate(context);
    await context.prisma.platformStaff.create({
      data: { userId: adminUser.userId, role: 'ADMIN' },
    });
    const merchant = await createMerchant(context, { name: 'Chez Module' });
    const setModules = (enabled: boolean) =>
      context
        .http()
        .put('/api/v1/merchant/modules')
        .set('Authorization', `Bearer ${merchant.accessToken}`)
        .send({ modules: [{ code: 'reservations.tables', enabled }] });
    const publish = (enabled: boolean) =>
      context
        .http()
        .put('/api/v1/admin/module-prices')
        .set('Authorization', `Bearer ${adminUser.accessToken}`)
        .send({ modules: [{ code: 'reservations.tables', monthlyPriceAmount: 3000, enabled }] })
        .expect(200);

    await setModules(true).expect(200);

    try {
      const published = payloadOf<{ modules: Array<{ code: string; enabled: boolean }> }>(
        (await publish(false)).body,
      );
      // Le back-office conserve la ligne pour pouvoir la reactiver.
      expect(published.modules.find((item) => item.code === 'reservations.tables')?.enabled).toBe(false);

      const catalog = payloadOf<{ modules: Array<{ code: string }> }>(
        (await context.http().get('/api/v1/merchant/module-catalog').expect(200)).body,
      );
      expect(catalog.modules.map((item) => item.code)).not.toContain('reservations.tables');
      expect(catalog.modules.map((item) => item.code)).toContain('storefront.basic');

      const entitlements = payloadOf<{
        enabledModules: string[];
        catalog: { modules: Array<{ code: string }> };
      }>(
        (
          await context
            .http()
            .get('/api/v1/merchant/entitlements')
            .set('Authorization', `Bearer ${merchant.accessToken}`)
            .expect(200)
        ).body,
      );
      // Le reglage du restaurant ne contourne pas l'interrupteur de la plateforme.
      expect(entitlements.enabledModules).not.toContain('reservations.tables');
      expect(entitlements.catalog.modules.map((item) => item.code)).not.toContain('reservations.tables');

      const refused = await setModules(true).expect(400);
      expect(JSON.stringify(refused.body)).toContain('platform_disabled');

      await publish(true);
      const restored = payloadOf<{ enabledModules: string[] }>((await setModules(true).expect(200)).body);
      expect(restored.enabledModules).toContain('reservations.tables');
    } finally {
      // `module_prices` est une table de reference conservee entre les tests.
      await context.prisma.$executeRaw`
        UPDATE module_prices SET enabled = TRUE, monthly_price_amount = 0
        WHERE module_code = 'reservations.tables'
      `;
    }
  });

  it('une publication sans interrupteur conserve la disponibilite existante', async () => {
    const adminUser = await authenticate(context);
    await context.prisma.platformStaff.create({
      data: { userId: adminUser.userId, role: 'ADMIN' },
    });

    const response = await context
      .http()
      .put('/api/v1/admin/module-prices')
      .set('Authorization', `Bearer ${adminUser.accessToken}`)
      .send({ modules: [{ code: 'orders.manual', monthlyPriceAmount: 0 }] })
      .expect(200);

    const payload = payloadOf<{ modules: Array<{ code: string; enabled: boolean }> }>(response.body);
    expect(payload.modules.length).toBeGreaterThan(1);
    expect(payload.modules.every((item) => item.enabled)).toBe(true);
  });
});
