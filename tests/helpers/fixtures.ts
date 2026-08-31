import { randomUUID } from 'node:crypto';
import { payloadOf, type TestContext } from './test-app';

/**
 * Fabriques de donnees pour les tests d'integration.
 *
 * Tout passe par l'API publique et jamais par des ecritures directes en base :
 * un test qui insere une session a la main ne verifierait pas la chaine reelle
 * (limitation de debit, audit, rotation des jetons) et pourrait rester vert
 * alors que l'endpoint est casse.
 */

export interface AuthenticatedUser {
  userId: string;
  phone: string;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export interface MerchantTenant extends AuthenticatedUser {
  organizationId: string;
  organizationSlug: string;
}

let phoneCounter = 0;

/**
 * Numero ivoirien valide et unique par appel.
 *
 * L'unicite est necessaire car la limitation de debit et les defis OTP sont
 * indexes par destination : reutiliser un numero ferait echouer le troisieme
 * test de la suite pour une raison sans rapport avec son objet.
 */
export function nextPhone(): string {
  phoneCounter += 1;
  return `07${String(10_000_000 + phoneCounter).padStart(8, '0')}`;
}

/**
 * Cle unique pour un appel idempotent.
 *
 * Les endpoints d'ecriture sensibles exigent l'en-tete `Idempotency-Key`
 * (specification section 10.1) : un test qui l'oublie recoit un 400 sans lien
 * avec son objet.
 */
export function idempotencyKey(): string {
  return randomUUID();
}

/** Parcours complet de connexion : demande de code puis verification. */
export async function authenticate(
  context: TestContext,
  options: { phone?: string; organizationId?: string; installId?: string } = {},
): Promise<AuthenticatedUser> {
  const phone = options.phone ?? nextPhone();

  const requested = await context
    .http()
    .post('/api/v1/auth/otp/request')
    .send({ phone })
    .expect(202);

  const challenge = payloadOf<{ devCode?: string }>(requested.body);

  if (challenge.devCode === undefined) {
    throw new Error(
      "Le code de developpement est absent : OTP_DEV_ECHO_CODE doit valoir true dans .env.test.",
    );
  }

  const verified = await context
    .http()
    .post('/api/v1/auth/otp/verify')
    .send({
      phone,
      code: challenge.devCode,
      ...(options.organizationId === undefined ? {} : { organizationId: options.organizationId }),
      ...(options.installId === undefined
        ? {}
        : { device: { installId: options.installId, platform: 'ANDROID' } }),
    })
    .expect(201);

  const tokens = payloadOf<{
    accessToken: string;
    refreshToken: string;
    sessionId: string;
  }>(verified.body);

  const user = await context.prisma.user.findUniqueOrThrow({
    where: { phoneE164: toE164(phone) },
    select: { id: true },
  });

  return {
    userId: user.id,
    phone,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    sessionId: tokens.sessionId,
  };
}

/**
 * Cree un utilisateur, son organisation, puis rouvre une session portant cette
 * organisation.
 *
 * La seconde connexion est indispensable : le jeton emis avant la creation de
 * l'organisation ne porte aucune appartenance, donc aucune permission.
 */
export async function createMerchant(
  context: TestContext,
  options: { name: string; phone?: string } = { name: 'Chez Test' },
): Promise<MerchantTenant> {
  const user = await authenticate(context, options.phone === undefined ? {} : { phone: options.phone });

  const created = await context
    .http()
    .post('/api/v1/merchant/organizations')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .set('Idempotency-Key', idempotencyKey())
    .send({ name: options.name, contactPhone: user.phone })
    .expect(201);

  const organization = payloadOf<{ organizationId: string; slug: string }>(created.body);

  const scoped = await context
    .http()
    .post('/api/v1/auth/refresh')
    .send({ refreshToken: user.refreshToken, organizationId: organization.organizationId })
    .expect(201);

  const tokens = payloadOf<{
    accessToken: string;
    refreshToken: string;
    sessionId: string;
  }>(scoped.body);

  return {
    ...user,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    sessionId: tokens.sessionId,
    organizationId: organization.organizationId,
    organizationSlug: organization.slug,
  };
}

export interface EstablishmentFixture {
  establishmentId: string;
  slug: string;
}

export async function createEstablishment(
  context: TestContext,
  merchant: MerchantTenant,
  overrides: Partial<{
    name: string;
    city: string;
    district: string;
    latitude: number;
    longitude: number;
    description: string;
  }> = {},
): Promise<EstablishmentFixture> {
  const response = await context
    .http()
    .post('/api/v1/merchant/establishments')
    .set('Authorization', `Bearer ${merchant.accessToken}`)
    .set('Idempotency-Key', idempotencyKey())
    .send({
      name: overrides.name ?? `${merchant.organizationSlug} - Cocody`,
      city: overrides.city ?? 'Abidjan',
      district: overrides.district ?? 'Cocody',
      // Coordonnees par defaut : plateau d'Abidjan.
      latitude: overrides.latitude ?? 5.3599517,
      longitude: overrides.longitude ?? -4.0082563,
      ...(overrides.description === undefined ? {} : { description: overrides.description }),
    })
    .expect(201);

  return payloadOf<EstablishmentFixture>(response.body);
}

/**
 * Repasse la meme normalisation que l'API pour retrouver l'utilisateur en base.
 *
 * Les tests saisissent un numero au format local ; la base ne stocke que du
 * E.164 (specification section 7.2).
 */
function toE164(localPhone: string): string {
  const digits = localPhone.replace(/\D/g, '');
  return `+225${digits}`;
}
