import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { HealthModule } from './api/health/health.module';
import { ActorResolverService } from './common/auth/actor-resolver.service';
import { AuthenticationGuard } from './common/auth/authentication.guard';
import { PermissionsGuard } from './common/auth/permissions.guard';
import { TenantScopeService } from './common/auth/tenant-scope.service';
import { TokenService } from './common/auth/token.service';
import { AppConfigModule } from './common/config/config.module';
import { AppExceptionFilter } from './common/errors/http-exception.filter';
import { RequestIdMiddleware } from './common/http/request-id.middleware';
import { ResponseEnvelopeInterceptor } from './common/http/response-envelope.interceptor';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor';
import { LoggingModule } from './common/logging/logging.module';
import { RateLimitGuard } from './common/rate-limit/rate-limit.guard';
import { TimeModule } from './common/time/time.module';
import { AdministrationModule } from './domains/administration/administration.module';
import { AuditModule } from './domains/audit/audit.module';
import { CatalogModule } from './domains/catalog/catalog.module';
import { DiscoveryModule } from './domains/discovery/discovery.module';
import { EntitlementsModule } from './domains/entitlements/entitlements.module';
import { IdentityModule } from './domains/identity/identity.module';
import { CommerceModule } from './domains/commerce/commerce.module';
import { OrdersModule } from './domains/orders/orders.module';
import { OrganizationsModule } from './domains/organizations/organizations.module';
import { OutboxModule } from './infrastructure/outbox/outbox.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { MediaModule } from './infrastructure/media/media.module';
import { JwtModule } from '@nestjs/jwt';
import { PushModule } from './infrastructure/notifications/push.module';

/**
 * Monolithe modulaire (specification section 4.1).
 *
 * Les domaines sont separes dans le code, les schemas et les evenements, mais
 * deployes dans une API principale. L'ordre des gardes et intercepteurs est
 * significatif : authentification, puis permissions, puis limitation de debit.
 */
@Module({
  imports: [
    PushModule,
    AppConfigModule,
    LoggingModule,
    TimeModule,
    PrismaModule,
    RedisModule,
    MediaModule,
    OutboxModule,
    AuditModule,
    EntitlementsModule,
    JwtModule.register({}),
    HealthModule,
    IdentityModule,
    OrganizationsModule,
    CatalogModule,
    DiscoveryModule,
    OrdersModule,
    CommerceModule,
    AdministrationModule,
  ],
  providers: [
    TokenService,
    ActorResolverService,
    TenantScopeService,

    { provide: APP_FILTER, useClass: AppExceptionFilter },

    // L'authentification precede la verification des permissions, qui precede la
    // limitation par utilisateur : sans acteur resolu, la dimension `user` du
    // limiteur serait toujours vide.
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },

    // L'idempotence est evaluee avant l'enveloppe : la reponse rejouee doit
    // traverser la meme mise en forme que la reponse d'origine.
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*path');
  }
}
