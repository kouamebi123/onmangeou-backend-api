import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfigService } from '../../common/config/app-config.service';
import { APP_LOGGER, type AppLogger } from '../../common/logging/app-logger';
import { PrismaClient } from './generated/client';

/**
 * Client Prisma applicatif.
 *
 * Prisma 7 supprime le moteur natif : la connexion passe par l'adaptateur `pg`,
 * dont le pool est configure explicitement (specification section 24).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(
    config: AppConfigService,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {
    super({
      adapter: new PrismaPg({
        connectionString: config.databaseUrl,
        max: config.databasePoolMax,
        connectionTimeoutMillis: config.databaseConnectionTimeoutMs,
      }),
      // Les journaux de l'ORM sont rediriges vers la sortie standard du
      // processus, deja captee par la collecte : dupliquer le message dans le
      // logger applicatif ajouterait du bruit sans contexte de requete.
      log: ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.info('Connexion base de donnees etablie');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Sonde de disponibilite utilisee par le health check readiness. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
