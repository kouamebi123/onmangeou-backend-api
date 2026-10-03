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
  idempotencyKey,
  type AuthenticatedUser,
} from '../helpers/fixtures';

/** Prochain mercredi a l'heure UTC demandee, au moins deux jours dans le futur. */
function nextWednesdayAt(hourUtc: number, extraDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 2);
  while (date.getUTCDay() !== 3) date.setUTCDate(date.getUTCDate() + 1);
  date.setUTCDate(date.getUTCDate() + extraDays);
  date.setUTCHours(hourUtc, 0, 0, 0);
  return date.toISOString();
}

describe('reservations et horaires d ouverture', () => {
  let context: TestContext;
  let establishmentId: string;
  let merchantToken: string;
  let customer: AuthenticatedUser;

  beforeAll(async () => {
    context = await createTestContext();
  });

  afterAll(async () => {
    await destroyTestContext(context);
  });

  beforeEach(async () => {
    await resetDatabase(context.prisma);
    await resetRedis(context);
    const merchant = await createMerchant(context, { name: 'Chez Horaires' });
    merchantToken = merchant.accessToken;
    ({ establishmentId } = await createEstablishment(context, merchant));
    await context
      .http()
      .put('/api/v1/merchant/modules')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ modules: [{ code: 'reservations.tables', enabled: true }] })
      .expect(200);
    // La publication a sa propre suite ; ici seul le parcours client est verifie.
    await context.prisma.establishment.update({
      where: { id: establishmentId },
      data: { status: 'PUBLISHED' },
    });
    customer = await authenticate(context);
  });

  const reserve = (startsAt: string) =>
    context
      .http()
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ establishmentId, startsAt, partySize: 2 });

  const setWednesdayLunch = () =>
    context
      .http()
      .put(`/api/v1/merchant/establishments/${establishmentId}/hours`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ slots: [{ weekDay: 'WEDNESDAY', opensAtMinutes: 720, closesAtMinutes: 840 }] })
      .expect(204);

  it('accepte une demande pendant le service et refuse un horaire de fermeture', async () => {
    await setWednesdayLunch();

    const accepted = await reserve(nextWednesdayAt(13)).expect(201);
    expect(payloadOf<{ status: string }>(accepted.body).status).toBe('REQUESTED');

    const afterService = await reserve(nextWednesdayAt(16)).expect(400);
    expect(afterService.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      // Les applications affichent `detail` : l'explication doit s'y trouver.
      detail: expect.stringContaining('fermé') as unknown,
      fields: [{ field: 'startsAt', code: 'closed' }],
    });

    // Le jeudi n'a aucun horaire : le restaurant est ferme ce jour-la.
    await reserve(nextWednesdayAt(13, 1)).expect(400);

    const mine = await context
      .http()
      .get('/api/v1/reservations')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .expect(200);
    expect(payloadOf<unknown[]>(mine.body)).toHaveLength(1);
  });

  it('expose publiquement les creneaux proposables', async () => {
    await setWednesdayLunch();

    const response = await context
      .http()
      .get(`/api/v1/restaurants/${establishmentId}/reservation-slots`)
      .expect(200);
    const schedule = payloadOf<{ timezone: string; hoursConfigured: boolean; slots: string[] }>(
      response.body,
    );

    expect(schedule.hoursConfigured).toBe(true);
    expect(schedule.slots).toContain(nextWednesdayAt(13));
    expect(schedule.slots).not.toContain(nextWednesdayAt(16));
    expect(schedule.slots.every((slot) => new Date(slot).getTime() > Date.now())).toBe(true);
  });

  it('publie la fermeture exacte et le fuseau du restaurant dans la decouverte', async () => {
    // Ouvert chaque jour de 00:00 a 02:00 le lendemain : toujours ouvert, ferme a 02:00.
    await context
      .http()
      .put(`/api/v1/merchant/establishments/${establishmentId}/hours`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({
        slots: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map(
          (weekDay) => ({
            weekDay,
            opensAtMinutes: 0,
            closesAtMinutes: 1560,
          }),
        ),
      })
      .expect(204);

    const listed = await context.http().get('/api/v1/discovery/restaurants').expect(200);
    const summary = payloadOf<
      Array<{
        id: string;
        slug: string;
        open: boolean;
        closesAt: string | null;
        opensAt: string | null;
        timezone: string;
      }>
    >(listed.body).find((item) => item.id === establishmentId);

    expect(summary).toMatchObject({ open: true, opensAt: null, timezone: 'Africa/Abidjan' });
    // Abidjan est a UTC+0 : 02:00 locale vaut 02:00 UTC, sans minute parasite.
    expect(summary?.closesAt).toMatch(/T02:00:00\.000Z$/);

    const detail = await context
      .http()
      .get(`/api/v1/restaurants/${summary?.slug ?? ''}`)
      .expect(200);
    expect(payloadOf<{ closesAt: string | null; timezone: string }>(detail.body)).toMatchObject({
      closesAt: summary?.closesAt,
      timezone: 'Africa/Abidjan',
    });
  });

  it('laisse passer la demande tant que le restaurant n a saisi aucun horaire', async () => {
    await reserve(nextWednesdayAt(3)).expect(201);

    const response = await context
      .http()
      .get(`/api/v1/restaurants/${establishmentId}/reservation-slots`)
      .expect(200);
    expect(payloadOf<{ hoursConfigured: boolean; slots: string[] }>(response.body)).toMatchObject({
      hoursConfigured: false,
      slots: [],
    });
  });
});
