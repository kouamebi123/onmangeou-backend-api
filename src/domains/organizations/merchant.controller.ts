import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentActor, PublicRoute, RequirePermissions } from '../../common/auth/auth.decorators';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { PERMISSIONS } from '../../common/auth/permissions';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import type { AppRequest } from '../../common/http/request-context';
import { EntitlementsService } from '../entitlements/entitlements.service';
import {
  CreateEstablishmentDto,
  CreateOrganizationDto,
  InviteMemberDto,
  ReplaceHoursDto,
  ReplaceServicesDto,
  SetMerchantModulesDto,
  UpdateEstablishmentDto,
} from './dto/merchant.dto';
import { OrganizationsService } from './organizations.service';

/**
 * Endpoints d'exploitation restaurant (specification section 10.3).
 *
 * La creation d'organisation et d'etablissement est idempotente : sur une
 * connexion faible, un renvoi automatique ne doit pas creer deux etablissements.
 */
@ApiTags('Restaurant - organisation')
@Controller({ path: 'merchant', version: '1' })
export class MerchantController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Post('organizations')
  @Idempotent({ scope: 'merchant.organizations.create' })
  @ApiOperation({ summary: 'Creer mon organisation et devenir proprietaire' })
  async createOrganization(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() dto: CreateOrganizationDto,
    @Req() request: AppRequest,
  ): Promise<{ organizationId: string; slug: string }> {
    return this.organizations.createOrganization(actor, dto, { requestId: request.requestId });
  }

  @Post('establishments')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_WRITE)
  @Idempotent({ scope: 'merchant.establishments.create' })
  @ApiOperation({ summary: 'Creer un etablissement' })
  async createEstablishment(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() dto: CreateEstablishmentDto,
    @Req() request: AppRequest,
  ): Promise<{ establishmentId: string; slug: string }> {
    return this.organizations.createEstablishment(actor, dto, { requestId: request.requestId });
  }

  @Get('establishments')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_READ)
  @ApiOperation({ summary: 'Lister mes etablissements' })
  async listEstablishments(@CurrentActor() actor: AuthenticatedActor): Promise<
    Array<{
      id: string;
      name: string;
      slug: string;
      status: string;
      description: string | null;
      phoneE164: string | null;
      city: string;
      district: string | null;
      addressLine: string | null;
      landmarkText: string | null;
      stockMode: string;
      averagePreparationMinutes: number | null;
      publishedAt: string | null;
      verifiedAt: string | null;
      hasTerrace: boolean;
      hasAirConditioning: boolean;
      accessible: boolean;
    }>
  > {
    const establishments = await this.organizations.listEstablishments(actor);

    return establishments.map((establishment) => ({
      ...establishment,
      publishedAt: establishment.publishedAt?.toISOString() ?? null,
      verifiedAt: establishment.verifiedAt?.toISOString() ?? null,
    }));
  }

  @Patch('establishments/:id')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Modifier un etablissement' })
  async updateEstablishment(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) establishmentId: string,
    @Body() dto: UpdateEstablishmentDto,
    @Req() request: AppRequest,
  ): Promise<void> {
    await this.organizations.updateEstablishment(actor, establishmentId, dto, {
      requestId: request.requestId,
    });
  }

  @Get('establishments/:id/hours')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_READ)
  @ApiOperation({ summary: 'Lire la grille d’horaires' })
  async getHours(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) establishmentId: string,
  ) {
    return this.organizations.listHours(actor, establishmentId);
  }

  @Put('establishments/:id/hours')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_HOURS_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Remplacer la grille d'horaires",
    description:
      'Les horaires sont exprimes en minutes depuis minuit, heure locale. Une fermeture apres minuit se note au-dela de 1440 : 02:00 vaut 1560.',
  })
  async replaceHours(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) establishmentId: string,
    @Body() dto: ReplaceHoursDto,
    @Req() request: AppRequest,
  ): Promise<void> {
    await this.organizations.replaceHours(actor, establishmentId, dto.slots, {
      requestId: request.requestId,
    });
  }

  @Put('establishments/:id/services')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Configurer les modes de service' })
  async replaceServices(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) establishmentId: string,
    @Body() dto: ReplaceServicesDto,
  ): Promise<void> {
    await this.organizations.replaceServices(actor, establishmentId, dto.services);
  }

  @Post('establishments/:id/publish')
  @RequirePermissions(PERMISSIONS.CATALOG_PUBLISH)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent({ scope: 'merchant.establishments.publish' })
  @ApiOperation({ summary: 'Publier un etablissement' })
  async publish(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) establishmentId: string,
    @Req() request: AppRequest,
  ): Promise<void> {
    await this.organizations.publishEstablishment(actor, establishmentId, {
      requestId: request.requestId,
    });
  }

  @Post('establishments/:id/verification')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_SUBMIT_VERIFICATION)
  @Idempotent({ scope: 'merchant.establishments.verification' })
  @ApiOperation({ summary: 'Soumettre un etablissement a la verification' })
  async submitVerification(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) establishmentId: string,
    @Req() request: AppRequest,
  ): Promise<{ caseId: string; status: string }> {
    return this.organizations.submitVerification(actor, establishmentId, {
      requestId: request.requestId,
    });
  }

  @Get('module-catalog')
  @PublicRoute()
  @ApiOperation({
    summary: 'Consulter le bareme des modules',
    description:
      'Prix publies depuis le back-office. Le client affiche ces montants tels quels, sans tarif code en dur.',
  })
  async moduleCatalog() {
    return this.entitlements.catalog();
  }

  @Get('entitlements')
  @ApiOperation({
    summary: 'Consulter les modules actifs',
    description:
      'Le client construit sa navigation depuis cette reponse et ne code aucune offre commerciale en dur.',
  })
  async getEntitlements(
    @CurrentActor() actor: AuthenticatedActor,
    @Query('establishmentId') establishmentId?: string,
  ): Promise<Awaited<ReturnType<EntitlementsService['resolve']>>> {
    const organizationId = actor.organizationId;

    if (organizationId === undefined) {
      return {
        organizationId: '',
        establishmentId: null,
        subscriptionStatus: null,
        planCode: null,
        trialEndsAt: null,
        currentPeriodEnd: null,
        enabledModules: [],
        modules: [],
        monthlyQuote: { amount: '0', currency: 'XOF', formatted: '0\u202fFCFA' },
        catalog: await this.entitlements.catalog(),
      };
    }

    return this.entitlements.resolve(organizationId, establishmentId);
  }

  @Put('modules')
  @RequirePermissions(PERMISSIONS.ORGANIZATION_WRITE)
  @ApiOperation({ summary: 'Activer ou desactiver les modules de mon etablissement' })
  async setModules(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() dto: SetMerchantModulesDto,
    @Req() request: AppRequest,
  ) {
    return this.entitlements.setOwnerModules(actor, dto.modules, { requestId: request.requestId });
  }

  @Get('members')
  @RequirePermissions(PERMISSIONS.MEMBER_READ)
  @ApiOperation({ summary: 'Lister les employes de l’organisation' })
  async listMembers(@CurrentActor() actor: AuthenticatedActor) {
    return this.organizations.listMembers(actor);
  }

  @Post('members')
  @RequirePermissions(PERMISSIONS.MEMBER_WRITE)
  @Idempotent({ scope: 'merchant.members.invite' })
  @ApiOperation({ summary: 'Inviter un employe par telephone' })
  async inviteMember(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() dto: InviteMemberDto,
    @Req() request: AppRequest,
  ) {
    return this.organizations.inviteMember(actor, dto, { requestId: request.requestId });
  }
}
