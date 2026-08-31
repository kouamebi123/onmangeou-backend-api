import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentActor, RequirePermissions } from '../../common/auth/auth.decorators';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { PLATFORM_PERMISSIONS } from '../../common/auth/permissions';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import type { AppRequest } from '../../common/http/request-context';
import type { PageResult } from '../../common/pagination/cursor';
import { EntitlementsService } from '../entitlements/entitlements.service';
import {
  AdministrationService,
  type AdminAuditView,
  type AdminEstablishmentView,
  type AdminUserView,
  type VerificationCaseView,
} from './administration.service';
import { AdminListQuery, DecideVerificationDto, UpdateModulePricesDto } from './dto/admin.dto';

@ApiTags('Administration')
@Controller({ path: 'admin', version: '1' })
export class AdministrationController {
  constructor(
    private readonly administration: AdministrationService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get('verification-cases')
  @RequirePermissions(PLATFORM_PERMISSIONS.ADMIN_VERIFICATION_READ)
  @ApiOperation({ summary: 'Lister les dossiers de verification' })
  async listCases(@Query() query: AdminListQuery): Promise<PageResult<VerificationCaseView>> {
    return this.administration.listVerificationCases(query);
  }

  @Post('verification-cases/:id/decide')
  @RequirePermissions(PLATFORM_PERMISSIONS.ADMIN_VERIFICATION_DECIDE)
  @Idempotent({ scope: 'admin.verification.decide' })
  @ApiOperation({
    summary: 'Approuver ou refuser un dossier de verification',
    description: 'Decision humaine finale. Chaque decision est motivee et journalisee.',
  })
  async decide(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) caseId: string,
    @Body() dto: DecideVerificationDto,
    @Req() request: AppRequest,
  ): Promise<VerificationCaseView> {
    return this.administration.decideVerification(actor, caseId, dto.decision, dto.reason, {
      requestId: request.requestId,
    });
  }

  @Get('establishments')
  @RequirePermissions(PLATFORM_PERMISSIONS.ADMIN_ESTABLISHMENT_READ)
  @ApiOperation({ summary: 'Superviser les etablissements' })
  async listEstablishments(@Query() query: AdminListQuery): Promise<PageResult<AdminEstablishmentView>> {
    return this.administration.listEstablishments(query);
  }

  @Get('users')
  @RequirePermissions(PLATFORM_PERMISSIONS.ADMIN_USER_READ)
  @ApiOperation({ summary: 'Superviser les comptes utilisateurs' })
  async listUsers(@Query() query: AdminListQuery): Promise<PageResult<AdminUserView>> {
    return this.administration.listUsers(query);
  }

  @Get('audit-logs')
  @RequirePermissions(PLATFORM_PERMISSIONS.ADMIN_AUDIT_READ)
  @ApiOperation({
    summary: "Consulter le journal d'audit",
    description: "Lecture seule. Aucune alteration n'est possible, y compris pour un administrateur.",
  })
  async listAudit(@Query() query: AdminListQuery): Promise<PageResult<AdminAuditView>> {
    return this.administration.listAuditLogs(query);
  }

  @Get('module-prices')
  @RequirePermissions(PLATFORM_PERMISSIONS.ADMIN_BILLING_READ)
  @ApiOperation({
    summary: 'Lire le bareme d’abonnement',
    description:
      'Source unique : table module_prices / platform_billing. Aucun tarif n’est code cote serveur.',
  })
  async getModulePrices() {
    return this.entitlements.catalog();
  }

  @Put('module-prices')
  @RequirePermissions(PLATFORM_PERMISSIONS.ADMIN_BILLING_WRITE)
  @ApiOperation({
    summary: 'Publier le bareme d’abonnement',
    description: 'Les montants saisis ici sont ceux affiches a la creation d’un restaurant.',
  })
  async putModulePrices(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() dto: UpdateModulePricesDto,
    @Req() request: AppRequest,
  ) {
    return this.entitlements.setPlatformPrices(actor, dto, { requestId: request.requestId });
  }
}
