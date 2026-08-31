import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnvFile } from 'dotenv';
import 'reflect-metadata';

/**
 * Chargement de l'environnement de test dans chaque worker Vitest.
 *
 * `override: true` est indispensable : sans lui, un `.env` de developpement deja
 * charge dans le shell ferait pointer les tests sur la base de developpement.
 */
const envPath = resolve(process.cwd(), '.env.test');

if (existsSync(envPath)) {
  loadEnvFile({ path: envPath, override: true, quiet: true });
}

process.env['NODE_ENV'] = 'test';
process.env['APP_ENV'] = 'test';
process.env['API_BASE_URL'] ??= 'http://localhost:3000';
process.env['REDIS_URL'] ??= 'redis://localhost:6380/15';
process.env['JWT_ISSUER'] ??= 'https://api.test.onmangeou.ci';
process.env['JWT_AUDIENCE'] ??= 'onmangeou-tests';
process.env['OTP_PEPPER'] ??= randomBytes(32).toString('hex');
process.env['OTP_DEV_ECHO_CODE'] ??= 'true';

if (process.env['JWT_PRIVATE_KEY'] === undefined || process.env['JWT_PUBLIC_KEY'] === undefined) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  process.env['JWT_PRIVATE_KEY'] = Buffer.from(privatePem).toString('base64');
  process.env['JWT_PUBLIC_KEY'] = Buffer.from(publicPem).toString('base64');
}
