import type { NestExpressApplication } from '@nestjs/platform-express';
import Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createApp } from '../../src/bootstrap';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { seedReferenceData } from '../../prisma/seed-reference';

/**
 * Harnais des tests d'integration : une application Nest reelle, la vraie base
 * PostgreSQL de test et le vrai Redis.
 *
 * Rien n'est simule ici. Un test qui remplace la base par un double ne verifie
 * ni les contraintes SQL, ni les declencheurs PostGIS, ni l'isolation des
 * tenants : precisement ce que la specification demande de garantir
 * (sections 28.1 et 28.2).
 */
export interface TestContext {
  app: NestExpressApplication;
  prisma: PrismaService;
  /**
   * Client Redis d'administration, distinct de celui de l'application.
   *
   * Aucun code de production ne doit pouvoir vider une base Redis : la methode
   * d'effacement reste donc hors de `RedisService`.
   */
  redisAdmin: Redis;
  /** Client HTTP pointant sur l'application montee en memoire. */
  http: () => request.Agent;
}

/**
 * Tables de reference, jamais effacees entre deux tests : elles sont peuplees
 * une seule fois par le seed et decrivent la matrice de roles.
 */
const REFERENCE_TABLES: readonly string[] = [
  'permissions',
  'roles',
  'role_permissions',
  'allergens',
  'subscription_plans',
  'plan_modules',
  'module_prices',
  'platform_billing',
];

export async function createTestContext(): Promise<TestContext> {
  const { app } = await createApp();
  await app.init();

  const prisma = app.get(PrismaService);

  await seedReferenceData(prisma);

  const redisUrl = process.env['REDIS_URL'];

  if (redisUrl === undefined || redisUrl.length === 0) {
    throw new Error('REDIS_URL est absent de .env.test.');
  }

  const redisAdmin = new Redis(redisUrl);
  await redisAdmin.connect().catch(() => undefined);

  return {
    app,
    prisma,
    redisAdmin,
    http: () => request.agent(app.getHttpServer() as App),
  };
}

export async function destroyTestContext(context: TestContext): Promise<void> {
  await context.redisAdmin.quit();
  await context.app.close();
}

/**
 * Remise a zero des donnees transactionnelles entre deux tests.
 *
 * `TRUNCATE ... CASCADE` en une seule instruction est nettement plus rapide que
 * des suppressions table par table, et evite d'avoir a ordonner manuellement les
 * dependances de cles etrangeres.
 *
 * Les declencheurs sont desactives le temps du nettoyage : la table d'audit est
 * protegee en ecriture par un declencheur qui interdit toute suppression
 * (specification section 23.2), ce qui bloquerait le TRUNCATE.
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE '_prisma%'
      AND tablename NOT LIKE 'spatial_ref_sys'
  `;

  const truncatable = tables
    .map((row) => row.tablename)
    .filter((name) => !REFERENCE_TABLES.includes(name));

  if (truncatable.length === 0) {
    return;
  }

  const list = truncatable.map((name) => `"public"."${name}"`).join(', ');

  await prisma.$executeRawUnsafe('SET session_replication_role = replica');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe('SET session_replication_role = DEFAULT');
}

/**
 * Vide les compteurs de limitation de debit et les caches entre deux tests.
 *
 * L'URL de test cible la base Redis 15, jamais celle du developpement.
 */
export async function resetRedis(context: TestContext): Promise<void> {
  await context.redisAdmin.flushdb();
}

/**
 * Extraction du contenu utile d'une reponse enveloppee (section 10.2).
 *
 * Les tests manipulent la charge metier et non l'enveloppe : centraliser
 * l'extraction evite de repeter `body.data` partout et de casser tous les tests
 * si l'enveloppe evolue.
 */
export function payloadOf<T>(body: unknown): T {
  if (typeof body !== 'object' || body === null || !('data' in body)) {
    throw new Error(`Reponse hors enveloppe standard : ${JSON.stringify(body)}`);
  }

  return (body as { data: T }).data;
}
