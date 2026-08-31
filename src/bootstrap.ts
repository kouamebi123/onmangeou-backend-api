import {
  ClassSerializerInterceptor,
  ValidationPipe,
  VersioningType,
  type INestApplication,
} from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from './common/config/app-config.service';
import { AppEnvironment } from './common/config/environment.schema';
import { APP_LOGGER, type AppLogger } from './common/logging/app-logger';

/**
 * Construction de l'application, partagee par le serveur HTTP, la generation du
 * contrat OpenAPI et les tests d'integration.
 *
 * Un point unique evite qu'un test passe avec une configuration differente de
 * celle qui tourne reellement en production.
 */
export async function createApp(): Promise<{
  app: NestExpressApplication;
  config: AppConfigService;
  logger: AppLogger;
}> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  const config = app.get(AppConfigService);
  const logger = app.get<AppLogger>(APP_LOGGER);

  applyGlobals(app, config);

  return { app, config, logger };
}

function applyGlobals(app: NestExpressApplication, config: AppConfigService): void {
  app.setGlobalPrefix('api', { exclude: ['health', 'health/live', 'health/ready'] });

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.use(
    helmet({
      // L'API ne sert pas de HTML : une politique de contenu stricte n'a pas
      // d'objet, et l'interface Swagger a besoin de ses propres ressources.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(compression());

  app.enableCors({
    origin: config.corsAllowedOrigins,
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id', 'X-Device-Install-Id'],
  });

  // Necessaire derriere un reverse proxy pour que `request.ip` reflete l'adresse
  // reelle du client, dont depend la limitation de debit.
  app.set('trust proxy', config.trustProxyHops);

  app.useGlobalPipes(
    new ValidationPipe({
      // Liste blanche stricte : un champ non declare est retire, et une tentative
      // d'injection de champ est refusee plutot que silencieusement ignoree
      // (specification section 22).
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  app.enableShutdownHooks();

  if (config.appEnv === AppEnvironment.Production) {
    // La documentation interactive n'est pas exposee en production : elle
    // enumere toute la surface d'attaque de l'API.
    return;
  }
}

export async function closeApp(app: INestApplication): Promise<void> {
  await app.close();
}
