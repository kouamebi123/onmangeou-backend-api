import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Injectable, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { IsIn, IsISO8601, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CurrentActor, PublicRoute, RequirePermissions } from '../../common/auth/auth.decorators';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { PERMISSIONS, PLATFORM_PERMISSIONS } from '../../common/auth/permissions';
import { TenantScopeService } from '../../common/auth/tenant-scope.service';
import { DomainError, notFound, validationFailed } from '../../common/errors/domain.error';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { Clock } from '../../common/time/clock';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { MODULE_CODES } from '../entitlements/module-codes';

export class CampaignDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  establishmentId!: string;
  @ApiProperty({ minLength: 3, maxLength: 120 })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;
  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  startsAt!: string;
  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  endsAt!: string;
}
export class CampaignDecisionDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED', 'PAUSED'] })
  @IsIn(['APPROVED', 'REJECTED', 'PAUSED'])
  status!: string;
  @ApiProperty({ minLength: 3, maxLength: 1000 })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}
export class CampaignEventDto {
  @ApiProperty({ enum: ['IMPRESSION', 'CLICK'] })
  @IsIn(['IMPRESSION', 'CLICK'])
  event!: 'IMPRESSION' | 'CLICK';
}
export function validCampaignDates(start: Date, end: Date, now: Date): boolean {
  return (
    Number.isFinite(start.getTime()) &&
    Number.isFinite(end.getTime()) &&
    end > start &&
    end > now &&
    end.getTime() - start.getTime() <= 90 * 86400_000
  );
}
@Injectable()
export class AdvertisingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantScopeService,
    private readonly entitlements: EntitlementsService,
    private readonly clock: Clock,
  ) {}

  async create(actor: AuthenticatedActor, dto: CampaignDto) {
    await this.tenant.assertEstablishmentInScope(actor, dto.establishmentId);
    await this.entitlements.assertModuleEnabled(
      this.tenant.requireOrganization(actor),
      MODULE_CODES.MARKETING_PROMOTIONS,
      dto.establishmentId,
    );
    const start = new Date(dto.startsAt),
      end = new Date(dto.endsAt);
    if (dto.title.trim().length < 3 || !validCampaignDates(start, end, this.clock.now()))
      throw validationFailed([
        {
          field: 'endsAt',
          code: 'INVALID',
          message: 'Choisissez un titre et une période de 90 jours maximum se terminant dans le futur.',
        },
      ]);
    const id = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO ad_campaigns(id,establishment_id,title,starts_at,ends_at) VALUES (${id}::uuid,${dto.establishmentId}::uuid,${dto.title.trim()},${start},${end})`;
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          organizationId: actor.organizationId ?? null,
          action: 'ad.create',
          resourceType: 'ad_campaign',
          resourceId: id,
          afterState: { title: dto.title.trim(), status: 'PENDING' },
        },
      });
    });
    return { id, status: 'PENDING' };
  }
  async list(actor: AuthenticatedActor, establishmentId?: string) {
    if (!establishmentId && !actor.permissions.has(PLATFORM_PERMISSIONS.ADMIN_ESTABLISHMENT_READ))
      throw new DomainError('FORBIDDEN', 'Lecture globale interdite');
    if (establishmentId) {
      await this.tenant.assertEstablishmentInScope(actor, establishmentId);
      await this.entitlements.assertModuleEnabled(
        this.tenant.requireOrganization(actor),
        MODULE_CODES.MARKETING_PROMOTIONS,
        establishmentId,
      );
    }
    return this.prisma
      .$queryRaw`SELECT c.id,c.title,c.status,c.starts_at,c.ends_at,c.impressions::text,c.clicks::text,e.name AS establishment_name
      FROM ad_campaigns c JOIN establishments e ON e.id=c.establishment_id
      WHERE (${establishmentId ?? null}::uuid IS NULL OR c.establishment_id=${establishmentId ?? null}::uuid)
      ORDER BY c.created_at DESC,c.id LIMIT 100`;
  }
  async pause(actor: AuthenticatedActor, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ establishment_id: string }>
      >`SELECT establishment_id FROM ad_campaigns WHERE id=${id}::uuid FOR UPDATE`;
      if (!rows[0]) throw notFound('Campagne', id);
      await this.tenant.assertEstablishmentInScope(actor, rows[0].establishment_id);
      await tx.$executeRaw`UPDATE ad_campaigns SET status='PAUSED' WHERE id=${id}::uuid`;
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: 'ad.pause',
          resourceType: 'ad_campaign',
          resourceId: id,
          afterState: { status: 'PAUSED' },
        },
      });
      return { id, status: 'PAUSED' };
    });
  }
  async decide(actor: AuthenticatedActor, id: string, dto: CampaignDecisionDto) {
    if (dto.reason.trim().length < 3)
      throw validationFailed([
        { field: 'reason', code: 'SHORT', message: 'Indiquez le motif de cette décision.' },
      ]);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM ad_campaigns WHERE id=${id}::uuid FOR UPDATE`;
      if (!rows[0]) throw notFound('Campagne', id);
      await tx.$executeRaw`UPDATE ad_campaigns SET status=${dto.status} WHERE id=${id}::uuid`;
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: 'admin.ad.moderate',
          resourceType: 'ad_campaign',
          resourceId: id,
          afterState: { status: dto.status, reason: dto.reason.trim() },
        },
      });
      return { id, status: dto.status };
    });
  }
  async serve() {
    const now = this.clock.now();
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        establishment_id: string;
        organization_id: string;
        title: string;
        slug: string;
        name: string;
      }>
    >`
      SELECT c.id,c.establishment_id,e.organization_id,c.title,e.slug,e.name FROM ad_campaigns c
      JOIN establishments e ON e.id=c.establishment_id WHERE c.status='APPROVED'
      AND c.starts_at<=${now} AND c.ends_at>${now} AND e.status='PUBLISHED' AND e.deleted_at IS NULL
      ORDER BY c.impressions,c.created_at LIMIT 20`;
    for (const campaign of rows) {
      if (
        !(await this.entitlements.isModuleEnabled(
          campaign.organization_id,
          MODULE_CODES.MARKETING_PROMOTIONS,
          campaign.establishment_id,
        ))
      )
        continue;
      const viewId = randomUUID();
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`DELETE FROM ad_views WHERE expires_at<${now}`;
        await tx.$executeRaw`INSERT INTO ad_views(id,campaign_id,expires_at) VALUES (${viewId}::uuid,${campaign.id}::uuid,${new Date(now.getTime() + 3600_000)})`;
      });
      return { viewId, title: campaign.title, slug: campaign.slug, name: campaign.name };
    }
    return null;
  }
  async track(id: string, event: 'IMPRESSION' | 'CLICK') {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ campaign_id: string; seen: boolean; clicked: boolean }>>`
        SELECT v.campaign_id,v.seen,v.clicked FROM ad_views v JOIN ad_campaigns c ON c.id=v.campaign_id JOIN establishments e ON e.id=c.establishment_id
        WHERE e.status='PUBLISHED' AND e.deleted_at IS NULL AND v.id=${id}::uuid AND v.expires_at>${now} AND c.status='APPROVED' AND c.starts_at<=${now} AND c.ends_at>${now}
        FOR UPDATE OF v`;
      const view = rows[0];
      if (!view) throw notFound('Affichage', id);
      if (event === 'CLICK' && !view.seen)
        throw new DomainError('CONFLICT', 'Impression requise avant le clic');
      if (event === 'IMPRESSION' && !view.seen) {
        await tx.$executeRaw`UPDATE ad_views SET seen=true WHERE id=${id}::uuid`;
        await tx.$executeRaw`UPDATE ad_campaigns SET impressions=impressions+1 WHERE id=${view.campaign_id}::uuid`;
      }
      if (event === 'CLICK' && !view.clicked) {
        await tx.$executeRaw`UPDATE ad_views SET clicked=true WHERE id=${id}::uuid`;
        await tx.$executeRaw`UPDATE ad_campaigns SET clicks=clicks+1 WHERE id=${view.campaign_id}::uuid`;
      }
      return { recorded: true };
    });
  }
}
@Controller({ version: '1' })
export class AdvertisingController {
  constructor(private readonly ads: AdvertisingService) {}
  @Post('merchant/ad-campaigns')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_WRITE)
  @Idempotent({ scope: 'ad.create' })
  create(@CurrentActor() actor: AuthenticatedActor, @Body() dto: CampaignDto) {
    return this.ads.create(actor, dto);
  }
  @Get('merchant/ad-campaigns')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_WRITE)
  list(@CurrentActor() actor: AuthenticatedActor, @Query('establishmentId', ParseUUIDPipe) id: string) {
    return this.ads.list(actor, id);
  }
  @Post('merchant/ad-campaigns/:id/pause')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_WRITE)
  pause(@CurrentActor() actor: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.ads.pause(actor, id);
  }
  @Get('admin/ad-campaigns')
  @RequirePermissions(PLATFORM_PERMISSIONS.ADMIN_ESTABLISHMENT_READ)
  adminList(@CurrentActor() actor: AuthenticatedActor) {
    return this.ads.list(actor);
  }
  @Post('admin/ad-campaigns/:id/decision')
  @RequirePermissions(PLATFORM_PERMISSIONS.ADMIN_AD_MODERATE)
  decide(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CampaignDecisionDto,
  ) {
    return this.ads.decide(actor, id, dto);
  }
  @Get('sponsored')
  @PublicRoute()
  @RateLimit({ name: 'ad-serve', rules: [{ dimension: 'ip', limit: 60, windowSeconds: 60 }] })
  serve() {
    return this.ads.serve();
  }
  @Post('sponsored/:id/events')
  @PublicRoute()
  @RateLimit({ name: 'ad-events', rules: [{ dimension: 'ip', limit: 120, windowSeconds: 60 }] })
  track(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CampaignEventDto) {
    return this.ads.track(id, dto.event);
  }
}
