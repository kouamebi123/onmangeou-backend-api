import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Injectable, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentActor, RequirePermissions } from '../../common/auth/auth.decorators';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { PLATFORM_PERMISSIONS } from '../../common/auth/permissions';
import { notFound, validationFailed } from '../../common/errors/domain.error';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export class ReportReviewDto {
  @IsIn(['SPAM', 'ABUSE', 'PRIVACY', 'MISLEADING', 'OTHER']) reason!: string;
  @IsOptional() @IsString() @MaxLength(1000) detail?: string;
}
export class ResolveReportDto {
  @IsIn(['DISMISSED', 'ACTIONED']) status!: 'DISMISSED' | 'ACTIONED';
  @IsString() @MinLength(3) @MaxLength(1000) resolution!: string;
}
@Injectable()
export class ReviewReportsService {
  constructor(private readonly prisma: PrismaService) {}
  async report(actor: AuthenticatedActor, reviewId: string, dto: ReportReviewDto) {
    const reviews = await this.prisma.$queryRaw<
      Array<{ user_id: string }>
    >`SELECT user_id FROM reviews WHERE id=${reviewId}::uuid AND status='PUBLISHED'`;
    if (!reviews[0]) throw notFound('Avis', reviewId);
    if (reviews[0].user_id === actor.userId)
      throw validationFailed([
        {
          field: 'review',
          code: 'OWN',
          message: 'Vous pouvez modifier votre propre avis depuis la commande.',
        },
      ]);
    const rows = await this.prisma.$queryRaw<Array<{ id: string; status: string }>>`
      INSERT INTO review_reports(id,review_id,reporter_user_id,reason,detail)
      VALUES(${randomUUID()}::uuid,${reviewId}::uuid,${actor.userId}::uuid,${dto.reason},${dto.detail?.trim() || null})
      ON CONFLICT(review_id,reporter_user_id) DO UPDATE SET review_id=EXCLUDED.review_id RETURNING id,status`;
    return rows[0];
  }
  list() {
    return this.prisma
      .$queryRaw`SELECT s.id,s.review_id,s.reason,s.detail,s.created_at,r.body,r.score,r.status AS review_status,e.name AS establishment_name,
      ARRAY(SELECT p.id::text FROM review_photos p WHERE p.review_id=r.id) AS photos
      FROM review_reports s JOIN reviews r ON r.id=s.review_id JOIN establishments e ON e.id=r.establishment_id
      WHERE s.status='OPEN' ORDER BY s.created_at,s.id LIMIT 100`;
  }
  async resolve(actor: AuthenticatedActor, id: string, dto: ResolveReportDto) {
    if (dto.resolution.trim().length < 3)
      throw validationFailed([
        { field: 'resolution', code: 'SHORT', message: 'Indiquez le motif de la décision.' },
      ]);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ review_id: string; status: string }>
      >`SELECT review_id,status FROM review_reports WHERE id=${id}::uuid FOR UPDATE`;
      if (!rows[0]) throw notFound('Signalement', id);
      if (rows[0].status !== 'OPEN') return { id, status: rows[0].status };
      if (dto.status === 'ACTIONED')
        await tx.$executeRaw`UPDATE reviews SET status='HIDDEN' WHERE id=${rows[0].review_id}::uuid`;
      await tx.$executeRaw`UPDATE review_reports SET status=${dto.status},resolution=${dto.resolution.trim()},resolved_by=${actor.userId}::uuid,resolved_at=now() WHERE id=${id}::uuid`;
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: 'admin.review.moderate',
          resourceType: 'review_report',
          resourceId: id,
          afterState: { status: dto.status, resolution: dto.resolution.trim(), reviewId: rows[0].review_id },
        },
      });
      return { id, status: dto.status };
    });
  }
}
@Controller({ version: '1' })
export class ReviewReportsController {
  constructor(private readonly reports: ReviewReportsService) {}
  @Post('reviews/:id/report')
  @RateLimit({ name: 'review-report', rules: [{ dimension: 'user', limit: 20, windowSeconds: 3600 }] })
  report(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportReviewDto,
  ) {
    return this.reports.report(actor, id, dto);
  }
  @Get('admin/review-reports')
  @RequirePermissions(PLATFORM_PERMISSIONS.ADMIN_ESTABLISHMENT_READ)
  list() {
    return this.reports.list();
  }
  @Post('admin/review-reports/:id/resolve')
  @RequirePermissions(PLATFORM_PERMISSIONS.ADMIN_REVIEW_MODERATE)
  resolve(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveReportDto,
  ) {
    return this.reports.resolve(actor, id, dto);
  }
}
