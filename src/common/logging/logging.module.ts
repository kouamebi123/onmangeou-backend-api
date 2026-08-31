import { Global, Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { AppEnvironment } from '../config/environment.schema';
import { APP_LOGGER, createRootLogger } from './app-logger';

@Global()
@Module({
  providers: [
    {
      provide: APP_LOGGER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        createRootLogger({
          level: config.logLevel,
          serviceName: config.otelServiceName,
          // Le rendu lisible est reserve au poste de developpement : les
          // environnements deployes emettent du JSON exploitable par la collecte.
          pretty: config.appEnv === AppEnvironment.Local,
        }),
    },
  ],
  exports: [APP_LOGGER],
})
export class LoggingModule {}
