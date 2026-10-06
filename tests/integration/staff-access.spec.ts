import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestContext,
  destroyTestContext,
  payloadOf,
  resetDatabase,
  resetRedis,
  type TestContext,
} from '../helpers/test-app';
import { authenticate, nextPhone } from '../helpers/fixtures';

const ACCESS_CODE = 'code-acces-personnel-de-test';

/**
 * Connaitre le numero d'un administrateur ne doit pas suffire a ouvrir le
 * back-office, meme lorsque le code de connexion est renvoye en clair pour les
 * essais (OTP_DEV_ECHO_CODE).
 */
describe('acces du personnel de la plateforme', () => {
  let context: TestContext;
  let adminPhone: string;

  beforeAll(async () => {
    context = await createTestContext();
  });

  afterAll(async () => {
    await destroyTestContext(context);
  });

  beforeEach(async () => {
    await resetDatabase(context.prisma);
    await resetRedis(context);
    adminPhone = nextPhone();
    const admin = await authenticate(context, { phone: adminPhone });
    await context.prisma.platformStaff.create({ data: { userId: admin.userId, role: 'ADMIN' } });
  });

  const requestCode = (phone: string, staffAccessCode?: string) =>
    context
      .http()
      .post('/api/v1/auth/otp/request')
      .send({ phone, ...(staffAccessCode === undefined ? {} : { staffAccessCode }) })
      .expect(202);

  const verify = (phone: string, code: string, staffAccessCode?: string) =>
    context
      .http()
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code, ...(staffAccessCode === undefined ? {} : { staffAccessCode }) });

  it('ne renvoie jamais le code d un administrateur sans le code d acces', async () => {
    const anonymous = payloadOf<{ devCode?: string; challengeId: string }>(
      (await requestCode(adminPhone)).body,
    );
    expect(anonymous.devCode).toBeUndefined();
    expect(anonymous.challengeId).toEqual(expect.any(String));

    const wrong = payloadOf<{ devCode?: string }>(
      (await requestCode(adminPhone, 'mauvais-code-d-acces')).body,
    );
    expect(wrong.devCode).toBeUndefined();
  });

  it('ouvre la session avec le code SMS et le code d acces, et la refuse sans ce dernier', async () => {
    const first = payloadOf<{ devCode?: string }>((await requestCode(adminPhone, ACCESS_CODE)).body);
    expect(first.devCode).toMatch(/^\d{6}$/);

    // Le bon code SMS seul ne suffit pas.
    const refused = await verify(adminPhone, first.devCode ?? '').expect(403);
    expect(refused.body).toMatchObject({
      code: 'FORBIDDEN',
      detail: expect.stringContaining('code d’accès') as unknown,
    });

    const second = payloadOf<{ devCode?: string }>((await requestCode(adminPhone, ACCESS_CODE)).body);
    const opened = await verify(adminPhone, second.devCode ?? '', ACCESS_CODE).expect(201);
    const tokens = payloadOf<{ accessToken: string }>(opened.body);

    await context
      .http()
      .get('/api/v1/admin/capabilities')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
  });

  it('ne change rien pour un client ou un restaurateur', async () => {
    const phone = nextPhone();
    const requested = payloadOf<{ devCode?: string }>((await requestCode(phone)).body);
    expect(requested.devCode).toMatch(/^\d{6}$/);
    await verify(phone, requested.devCode ?? '').expect(201);
  });

  it('rend un compte de nouveau ordinaire une fois le role interne revoque', async () => {
    await context.prisma.platformStaff.updateMany({ data: { revokedAt: new Date() } });
    const requested = payloadOf<{ devCode?: string }>((await requestCode(adminPhone)).body);
    expect(requested.devCode).toMatch(/^\d{6}$/);
  });
});
