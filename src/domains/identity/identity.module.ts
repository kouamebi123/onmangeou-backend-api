import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigService } from '../../common/config/app-config.service';
import { ActorResolverService } from '../../common/auth/actor-resolver.service';
import { TokenService } from '../../common/auth/token.service';
import { APP_LOGGER } from '../../common/logging/app-logger';
import type { AppLogger } from '../../common/logging/app-logger';
import { ConsoleSmsSender, SMS_SENDER } from '../../infrastructure/notifications/sms.port';
import { TwilioSmsSender } from '../../infrastructure/notifications/twilio-sms.sender';
import { AuthController, MeController } from './auth.controller';
import { IdentityService } from './identity.service';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, MeController],
  providers: [
    IdentityService,
    OtpService,
    SessionService,
    TokenService,
    ActorResolverService,
    {
      // Le fournisseur SMS reel n'est pas arrete (specification section 36) :
      // l'adaptateur est choisi par configuration, jamais code en dur.
      provide: SMS_SENDER,
      inject: [APP_LOGGER, AppConfigService],
      useFactory: (logger: AppLogger, config: AppConfigService) =>
        config.smsProvider === 'twilio'
          ? new TwilioSmsSender(config.twilio)
          : new ConsoleSmsSender(logger, config),
    },
  ],
  exports: [IdentityService, SessionService, TokenService, ActorResolverService],
})
export class IdentityModule {}
