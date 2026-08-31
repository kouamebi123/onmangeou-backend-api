import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { APP_LOGGER, type AppLogger } from './common/logging/app-logger';
import { OutboxService } from './infrastructure/outbox/outbox.service';

const POLL_INTERVAL_MS = 2_000;
const BATCH_SIZE = 50;

/**
 * Worker de publication de l'outbox (specification sections 4.1 et 25.2).
 *
 * Processus separe de l'API : un pic de traitement asynchrone ne doit pas
 * degrader le temps de reponse des requetes utilisateur.
 *
 * L'implementation actuelle journalise chaque evenement publie. Le branchement
 * des consommateurs reels (notifications push, SMS, projections de lecture) se
 * fera par abonnement a cette boucle, sans modifier les services de domaine.
 */
async function main(): Promise<void> {
  const context = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });

  const outbox = context.get(OutboxService);
  const logger = context.get<AppLogger>(APP_LOGGER);

  let running = true;

  const stop = (signal: string): void => {
    logger.info('Arret du worker demande', { signal });
    running = false;
  };

  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));

  logger.info('Worker outbox demarre', { batchSize: BATCH_SIZE, pollIntervalMs: POLL_INTERVAL_MS });

  while (running) {
    let processed = 0;

    try {
      const events = await outbox.claimBatch(BATCH_SIZE);

      for (const event of events) {
        try {
          logger.info('Evenement publie', {
            outboxEventId: event.id,
            eventType: event.eventType,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
          });

          await outbox.markProcessed(event.id);
          processed += 1;
        } catch (error) {
          // Un evenement en echec est replanifie avec recul exponentiel : il ne
          // doit ni bloquer le lot ni etre perdu.
          await outbox.markFailed(
            event.id,
            event.attempts,
            error instanceof Error ? error.message : 'erreur inconnue',
          );
        }
      }
    } catch (error) {
      logger.error("Echec de lecture de l'outbox", {
        detail: error instanceof Error ? error.message : undefined,
      });
    }

    // Aucune attente lorsque le lot etait plein : un retard accumule doit se
    // resorber le plus vite possible.
    if (processed < BATCH_SIZE) {
      await sleep(POLL_INTERVAL_MS);
    }
  }

  await context.close();
  logger.info('Worker outbox arrete proprement');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `Echec de demarrage du worker OnMangeOu : ${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
