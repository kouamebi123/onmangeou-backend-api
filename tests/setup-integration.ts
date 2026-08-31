import { resolve } from 'node:path';
import { config as loadEnvFile } from 'dotenv';
import 'reflect-metadata';

/**
 * Chargement de l'environnement de test dans chaque worker Vitest.
 *
 * `override: true` est indispensable : sans lui, un `.env` de developpement deja
 * charge dans le shell ferait pointer les tests sur la base de developpement.
 */
loadEnvFile({ path: resolve(process.cwd(), '.env.test'), override: true, quiet: true });

process.env['NODE_ENV'] = 'test';
process.env['APP_ENV'] = 'test';
