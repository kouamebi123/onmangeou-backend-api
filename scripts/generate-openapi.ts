import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildOpenApiDocument } from '../src/api/openapi/openapi.setup';
import { createApp } from '../src/bootstrap';

/**
 * Genere le contrat OpenAPI dans `openapi/onmangeou-v1.json`.
 *
 * La CI execute ce script et echoue si le fichier committe differe : un
 * changement de contrat non intentionnel casserait les clients generes
 * (specification section 10.4).
 */
async function main(): Promise<void> {
  const { app } = await createApp();

  await app.init();

  const document = buildOpenApiDocument(app);
  const target = resolve(process.cwd(), 'openapi/onmangeou-v1.json');

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  await app.close();

  process.stdout.write(`Contrat OpenAPI ecrit : ${target}\n`);

  // Sortie explicite : le pool PostgreSQL et le client Redis conservent des
  // minuteurs de reconnexion qui maintiennent la boucle d'evenements active. Sans
  // cela, ce script bloquerait indefiniment un job d'integration continue.
  process.exit(0);
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `Echec de generation du contrat OpenAPI : ${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
