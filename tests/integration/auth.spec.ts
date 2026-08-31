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

/**
 * Parcours d'authentification par code a usage unique.
 *
 * Reference : specification sections 10.3, 21 et scenarios obligatoires 1 et 2
 * de la section 28.2.
 */
describe('authentification par OTP', () => {
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

  it('cree le compte a la premiere connexion verifiee', async () => {
    const phone = nextPhone();

    const requested = await context
      .http()
      .post('/api/v1/auth/otp/request')
      .send({ phone })
      .expect(202);

    const challenge = payloadOf<{ challengeId: string; devCode?: string; expiresAt: string }>(
      requested.body,
    );

    expect(challenge.challengeId).toBeTruthy();
    expect(challenge.devCode).toMatch(/^\d{6}$/);

    const verified = await context
      .http()
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: challenge.devCode })
      .expect(201);

    const tokens = payloadOf<{ accessToken: string; accountCreated: boolean }>(verified.body);

    expect(tokens.accountCreated).toBe(true);
    expect(tokens.accessToken.split('.')).toHaveLength(3);
  });

  it('reconnait un compte existant a la deuxieme connexion', async () => {
    const phone = nextPhone();

    await authenticate(context, { phone });
    const second = await authenticate(context, { phone });

    expect(second.userId).toBeTruthy();

    const users = await context.prisma.user.count();
    expect(users).toBe(1);
  });

  it('ne stocke jamais le code en clair', async () => {
    const phone = nextPhone();

    const requested = await context
      .http()
      .post('/api/v1/auth/otp/request')
      .send({ phone })
      .expect(202);

    const challenge = payloadOf<{ devCode: string }>(requested.body);

    const stored = await context.prisma.otpChallenge.findFirstOrThrow({
      select: { codeHash: true, destination: true },
    });

    expect(stored.codeHash).not.toContain(challenge.devCode);
    expect(stored.destination).toBe(`+225${phone}`);
  });

  it('refuse un code errone au format RFC 7807', async () => {
    const phone = nextPhone();

    await context.http().post('/api/v1/auth/otp/request').send({ phone }).expect(202);

    const response = await context
      .http()
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: '000000' })
      .expect(401);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({
      type: expect.stringContaining('http'),
      title: expect.any(String),
      status: 401,
    });
  });

  it('bloque le defi apres le nombre maximal de tentatives', async () => {
    const phone = nextPhone();

    const requested = await context
      .http()
      .post('/api/v1/auth/otp/request')
      .send({ phone })
      .expect(202);

    const challenge = payloadOf<{ devCode: string }>(requested.body);
    const maxAttempts = Number(process.env['OTP_MAX_ATTEMPTS'] ?? 5);

    for (let attempt = 1; attempt < maxAttempts; attempt += 1) {
      await context
        .http()
        .post('/api/v1/auth/otp/verify')
        .send({ phone, code: '000000' })
        .expect(401);
    }

    // La derniere tentative verrouille le defi et l'annonce explicitement.
    const locked = await context
      .http()
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: '000000' })
      .expect(429);

    expect(locked.body).toMatchObject({ code: 'OTP_TOO_MANY_ATTEMPTS' });

    // Le bon code ne sauve plus le defi : sinon un attaquant disposerait d'un
    // nombre illimite d'essais en alternant les codes.
    await context
      .http()
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: challenge.devCode })
      .expect(401);

    const stored = await context.prisma.otpChallenge.findFirstOrThrow({
      select: { status: true, attempts: true },
    });

    expect(stored.status).toBe('LOCKED');
    expect(stored.attempts).toBe(maxAttempts);
  });

  it('rejette un numero non ivoirien', async () => {
    const response = await context
      .http()
      .post('/api/v1/auth/otp/request')
      .send({ phone: '+33612345678' })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(response.body.fields).toContainEqual(
      expect.objectContaining({ field: 'phone', code: 'INVALID_PHONE' }),
    );
  });

  it('rejette un champ non declare plutot que de l ignorer', async () => {
    // Liste blanche stricte : sans elle, un client pourrait tenter d'injecter
    // `role` ou `status` sur un DTO d'ecriture (specification section 22).
    const response = await context
      .http()
      .post('/api/v1/auth/otp/request')
      .send({ phone: nextPhone(), isAdmin: true })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('exige un jeton pour les routes protegees', async () => {
    const response = await context.http().get('/api/v1/me').expect(401);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  it('refuse un jeton falsifie', async () => {
    const user = await authenticate(context);
    const tampered = `${user.accessToken.slice(0, -4)}AAAA`;

    await context
      .http()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${tampered}`)
      .expect(401);
  });

  it('renvoie le profil du porteur du jeton', async () => {
    const user = await authenticate(context);

    const response = await context
      .http()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    const profile = payloadOf<{ id: string; phoneE164: string; phoneVerified: boolean }>(
      response.body,
    );

    expect(profile.id).toBe(user.userId);
    expect(profile.phoneE164).toBe(`+225${user.phone}`);
    expect(profile.phoneVerified).toBe(true);
  });

  it('propage l identifiant de requete dans la reponse et l enveloppe', async () => {
    const requestId = '11111111-2222-3333-4444-555555555555';

    const response = await context
      .http()
      .get('/health/live')
      .set('x-request-id', requestId)
      .expect(200);

    expect(response.headers['x-request-id']).toBe(requestId);
  });
});

describe('rotation des refresh tokens', () => {
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

  it('emet un nouveau couple de jetons et invalide l ancien', async () => {
    const user = await authenticate(context);

    const refreshed = await context
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(201);

    const tokens = payloadOf<{ refreshToken: string }>(refreshed.body);
    expect(tokens.refreshToken).not.toBe(user.refreshToken);

    // Rejeu de l'ancien jeton : il doit etre refuse.
    await context
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(401);
  });

  it('revoque toute la famille de sessions apres un rejeu detecte', async () => {
    // Scenario obligatoire 2 de la section 28.2 : un rejeu signifie qu'un jeton
    // a fuite. Conserver la session issue de la rotation laisserait l'attaquant
    // ou la victime en place selon qui a joue en premier.
    const user = await authenticate(context);

    const refreshed = await context
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(201);

    const rotated = payloadOf<{ refreshToken: string; accessToken: string }>(refreshed.body);

    await context
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(401);

    await context
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.refreshToken })
      .expect(401);

    const active = await context.prisma.session.count({ where: { revokedAt: null } });
    expect(active).toBe(0);
  });

  it('ferme la session courante a la deconnexion', async () => {
    const user = await authenticate(context);

    await context
      .http()
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({})
      .expect(204);

    await context
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(401);
  });

  it('liste les sessions actives et marque la session courante', async () => {
    const phone = nextPhone();
    const first = await authenticate(context, { phone });
    await authenticate(context, { phone });

    const response = await context
      .http()
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(200);

    const sessions = payloadOf<Array<{ id: string; current: boolean }>>(response.body);

    expect(sessions).toHaveLength(2);
    expect(sessions.filter((session) => session.current)).toHaveLength(1);
  });
});
