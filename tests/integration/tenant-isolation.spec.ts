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
  createEstablishment,
  createMerchant,
  type EstablishmentFixture,
  type MerchantTenant,
} from '../helpers/fixtures';

/**
 * Isolation entre organisations.
 *
 * Reference : specification sections 8.1 et 22, scenario obligatoire 5 de la
 * section 28.2.
 *
 * C'est le test le plus important de la suite : une fuite inter-tenant expose
 * les prix, les marges et les coordonnees d'un concurrent. Chaque endpoint qui
 * accepte un identifiant en parametre est donc verifie avec l'identifiant d'un
 * autre tenant.
 */
describe('isolation inter-organisations', () => {
  let context: TestContext;
  let alice: MerchantTenant;
  let bob: MerchantTenant;
  let aliceEstablishment: EstablishmentFixture;
  let bobEstablishment: EstablishmentFixture;

  beforeAll(async () => {
    context = await createTestContext();
  });

  afterAll(async () => {
    await destroyTestContext(context);
  });

  beforeEach(async () => {
    await resetDatabase(context.prisma);
    await resetRedis(context);

    alice = await createMerchant(context, { name: 'Chez Alice' });
    bob = await createMerchant(context, { name: 'Chez Bob' });
    aliceEstablishment = await createEstablishment(context, alice, { name: 'Alice Cocody' });
    bobEstablishment = await createEstablishment(context, bob, { name: 'Bob Plateau' });
  });

  it('ne liste que ses propres etablissements', async () => {
    const response = await context
      .http()
      .get('/api/v1/merchant/establishments')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);

    const establishments = payloadOf<Array<{ id: string; name: string }>>(response.body);

    expect(establishments).toHaveLength(1);
    expect(establishments[0]?.id).toBe(aliceEstablishment.establishmentId);
    expect(establishments.map((item) => item.id)).not.toContain(bobEstablishment.establishmentId);
  });

  it('refuse de modifier l etablissement d une autre organisation', async () => {
    const response = await context
      .http()
      .patch(`/api/v1/merchant/establishments/${bobEstablishment.establishmentId}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ name: 'Etablissement detourne' })
      .expect(404);

    // Un 403 confirmerait l'existence de la ressource : le 404 ne revele rien.
    expect(response.body).toMatchObject({ code: 'NOT_FOUND' });

    const untouched = await context.prisma.establishment.findUniqueOrThrow({
      where: { id: bobEstablishment.establishmentId },
      select: { name: true },
    });

    expect(untouched.name).toBe('Bob Plateau');
  });

  it('refuse de remplacer les horaires d un etablissement etranger', async () => {
    await context
      .http()
      .put(`/api/v1/merchant/establishments/${bobEstablishment.establishmentId}/hours`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ slots: [{ weekDay: 'MONDAY', opensAtMinutes: 600, closesAtMinutes: 1320 }] })
      .expect(404);

    const hours = await context.prisma.establishmentHours.count({
      where: { establishmentId: bobEstablishment.establishmentId },
    });

    expect(hours).toBe(0);
  });

  it('refuse de publier un etablissement etranger', async () => {
    await context
      .http()
      .post(`/api/v1/merchant/establishments/${bobEstablishment.establishmentId}/publish`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .set('Idempotency-Key', 'aa000000-0000-4000-8000-000000000001')
      .expect(404);

    const establishment = await context.prisma.establishment.findUniqueOrThrow({
      where: { id: bobEstablishment.establishmentId },
      select: { status: true, publishedAt: true },
    });

    expect(establishment.status).not.toBe('PUBLISHED');
    expect(establishment.publishedAt).toBeNull();
  });

  it('refuse de creer un menu dans un etablissement etranger', async () => {
    await context
      .http()
      .post('/api/v1/merchant/menus')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .set('Idempotency-Key', 'aa000000-0000-4000-8000-000000000002')
      .send({ establishmentId: bobEstablishment.establishmentId, name: 'Carte pirate' })
      .expect(404);

    const menus = await context.prisma.menu.count({
      where: { establishmentId: bobEstablishment.establishmentId },
    });

    expect(menus).toBe(0);
  });

  it('refuse de lister les plats d un etablissement etranger', async () => {
    await context
      .http()
      .get('/api/v1/merchant/products')
      .query({ establishmentId: bobEstablishment.establishmentId })
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(404);
  });

  it('refuse de lire ou modifier le prix d un plat etranger', async () => {
    const created = await context
      .http()
      .post('/api/v1/merchant/products')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .set('Idempotency-Key', 'bb000000-0000-4000-8000-000000000001')
      .send({
        establishmentId: bobEstablishment.establishmentId,
        name: 'Poisson braise',
        basePriceAmount: '4500',
      })
      .expect(201);

    const { productId } = payloadOf<{ productId: string }>(created.body);

    await context
      .http()
      .patch(`/api/v1/merchant/products/${productId}/price`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ newAmount: '1' })
      .expect(404);

    const product = await context.prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { basePriceAmount: true },
    });

    expect(product.basePriceAmount).toBe(4500n);

    // Aucun historique de prix parasite ne doit avoir ete cree par la tentative.
    const priceChanges = await context.prisma.priceHistory.count({
      where: { productId },
    });

    expect(priceChanges).toBe(1);
  });

  it('refuse de declarer une rupture sur un plat etranger', async () => {
    const created = await context
      .http()
      .post('/api/v1/merchant/products')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .set('Idempotency-Key', 'bb000000-0000-4000-8000-000000000002')
      .send({
        establishmentId: bobEstablishment.establishmentId,
        name: 'Alloco',
        basePriceAmount: '1000',
      })
      .expect(201);

    const { productId } = payloadOf<{ productId: string }>(created.body);

    await context
      .http()
      .patch(`/api/v1/merchant/products/${productId}/availability`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ status: 'OUT_OF_STOCK', reason: 'Sabotage' })
      .expect(404);

    const availability = await context.prisma.productAvailability.findFirstOrThrow({
      where: { productId },
      select: { status: true },
    });

    expect(availability.status).toBe('AVAILABLE');
  });

  it('ne renvoie aucun droit a un utilisateur sans organisation', async () => {
    const client = await authenticate(context);

    await context
      .http()
      .get('/api/v1/merchant/establishments')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(403);

    const entitlements = await context
      .http()
      .get('/api/v1/merchant/entitlements')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);

    const resolved = payloadOf<{ enabledModules: string[] }>(entitlements.body);
    expect(resolved.enabledModules).toEqual([]);
  });

  it('refuse une session qui reclame une organisation dont l utilisateur n est pas membre', async () => {
    const outsider = await authenticate(context);

    const response = await context
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: outsider.refreshToken, organizationId: alice.organizationId })
      .expect(403);

    expect(response.body).toMatchObject({ status: 403 });
  });

  it('cloisonne le journal d audit par organisation', async () => {
    await context
      .http()
      .patch(`/api/v1/merchant/establishments/${aliceEstablishment.establishmentId}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ district: 'Cocody Angre' })
      .expect(204);

    const bobEntries = await context.prisma.auditLog.count({
      where: { organizationId: bob.organizationId },
    });

    const aliceEntries = await context.prisma.auditLog.count({
      where: { organizationId: alice.organizationId },
    });

    expect(aliceEntries).toBeGreaterThan(0);
    // Bob a cree son organisation et son etablissement : ses propres entrees
    // existent, mais aucune de celles d'Alice ne doit lui etre rattachee.
    const aliceResources = await context.prisma.auditLog.count({
      where: {
        organizationId: bob.organizationId,
        resourceId: aliceEstablishment.establishmentId,
      },
    });

    expect(bobEntries).toBeGreaterThan(0);
    expect(aliceResources).toBe(0);
  });
});
