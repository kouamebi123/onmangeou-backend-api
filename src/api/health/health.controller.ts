import { Controller, Get, HttpCode, HttpStatus, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicRoute } from '../../common/auth/auth.decorators';
import { DomainError } from '../../common/errors/domain.error';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { AppConfigService } from '../../common/config/app-config.service';

/**
 * Sondes de sante pour l'orchestrateur (specification section 27.2).
 *
 * `liveness` ne teste que le processus : si elle interrogeait la base, une
 * coupure reseau ferait redemarrer en boucle des conteneurs pourtant sains.
 * `readiness` teste les dependances : un conteneur qui ne peut pas servir est
 * retire du equilibrage sans etre tue.
 */
/**
 * Les sondes sont hors prefixe et hors versionnement : la configuration de
 * l'orchestrateur ne doit pas etre modifiee lorsque l'API change de version.
 */
@ApiTags('Sante')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: AppConfigService,
  ) {}

  @Get('live')
  @PublicRoute()
  @ApiOperation({ summary: 'Sonde de vivacite du processus' })
  live(): { status: 'ok'; service: string; environment: string } {
    return {
      status: 'ok',
      service: this.config.otelServiceName,
      environment: this.config.appEnv,
    };
  }

  @Get('ready')
  @PublicRoute()
  @ApiOperation({ summary: 'Sonde de disponibilite : base de donnees et cache' })
  async ready(): Promise<{ status: 'ok'; checks: Record<string, 'ok'> }> {
    const failures: string[] = [];

    await Promise.all([
      this.prisma.ping().catch(() => {
        failures.push('database');
      }),
      this.redis.ping().catch(() => {
        failures.push('cache');
      }),
    ]);

    if (failures.length > 0) {
      throw new DomainError('SERVICE_UNAVAILABLE', `Dependances indisponibles : ${failures.join(', ')}`);
    }

    return { status: 'ok', checks: { database: 'ok', cache: 'ok' } };
  }

  @Get()
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  root(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
