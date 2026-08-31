import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnvFile } from 'dotenv';

/**
 * Preparation unique de la base de test avant toute suite d'integration.
 *
 * Les migrations sont appliquees ici et non dans chaque fichier de test : les
 * appliquer par fichier multiplierait le temps de demarrage et pourrait faire
 * tourner deux migrations concurrentes sur la meme base.
 *
 * La base visee est celle du service Docker `postgres-test` (port 5434). Un
 * garde-fou refuse d'operer sur une URL qui ne mentionne pas une base de test,
 * pour qu'une erreur de configuration ne detruise jamais des donnees reelles.
 */
export default function setup(): void {
  const envPath = resolve(process.cwd(), '.env.test');

  if (existsSync(envPath)) {
    loadEnvFile({ path: envPath, override: true, quiet: true });
  }

  const databaseUrl = process.env['DATABASE_URL'];

  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error(
      "DATABASE_URL est absente. Fournir un fichier .env.test en local ou une variable d'environnement en CI.",
    );
  }

  assertDisposableDatabase(databaseUrl);

  // `migrate deploy` applique les migrations existantes sans jamais en generer :
  // le schema teste est exactement celui qui partira en production.
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

function assertDisposableDatabase(databaseUrl: string): void {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');

  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refus d'executer les tests sur la base "${databaseName}" : le nom doit se terminer par _test. Les tests effacent les donnees entre chaque cas.`,
    );
  }
}
