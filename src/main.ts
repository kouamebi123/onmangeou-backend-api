import { createApp } from './bootstrap';
import { AppEnvironment } from './common/config/environment.schema';
import { buildOpenApiDocument, mountSwaggerUi } from './api/openapi/openapi.setup';

/**
 * Point d'entree du serveur HTTP.
 */
async function main(): Promise<void> {
  const { app, config, logger } = await createApp();

  if (config.appEnv !== AppEnvironment.Production) {
    try {
      mountSwaggerUi(app, buildOpenApiDocument(app));
    } catch (error: unknown) {
      logger.warn('Interface Swagger indisponible', {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await app.listen(config.port, '0.0.0.0');

  logger.info('API OnMangeOu demarree', {
    port: config.port,
    environment: config.appEnv,
    docs: config.appEnv === AppEnvironment.Production ? 'desactivee' : `http://localhost:${config.port}/docs`,
  });
}

void main().catch((error: unknown) => {
  // Le logger applicatif depend du conteneur : s'il n'a pas pu demarrer, la
  // sortie d'erreur standard est le seul canal disponible.
  process.stderr.write(
    `Echec de demarrage de l'API OnMangeOu : ${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
