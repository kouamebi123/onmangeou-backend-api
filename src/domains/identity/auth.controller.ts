import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentActor, PublicRoute } from '../../common/auth/auth.decorators';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { truncateIp, type AppRequest } from '../../common/http/request-context';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { OutboxService, OUTBOX_EVENTS } from '../../infrastructure/outbox/outbox.service';
import {
  DeleteMeDto,
  LogoutDto,
  RefreshTokenDto,
  RequestOtpDto,
  UpdateMeDto,
  VerifyOtpDto,
} from './dto/auth.dto';
import {
  MeResponse,
  OtpRequestedResponse,
  SessionResponse,
  TokenPairResponse,
} from './dto/auth-response.dto';
import { IdentityService } from './identity.service';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';

/**
 * Authentification par telephone et code a usage unique.
 *
 * Reference : specification sections 10.3 et 21.
 *
 * La limitation de debit cumule trois dimensions : par IP contre un balayage
 * automatise, par destination contre le harcelement d'un numero precis, et par
 * appareil contre une application defectueuse en boucle.
 */
@ApiTags('Authentification')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly identity: IdentityService,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  @Post('otp/request')
  @PublicRoute()
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({
    name: 'auth.otp.request',
    rules: [
      { dimension: 'destination', limit: 3, windowSeconds: 600 },
      { dimension: 'ip', limit: 20, windowSeconds: 3600 },
      { dimension: 'device', limit: 10, windowSeconds: 3600 },
    ],
  })
  @ApiOperation({ summary: 'Demander un code de connexion par SMS' })
  async requestOtp(@Body() dto: RequestOtpDto, @Req() request: AppRequest): Promise<OtpRequestedResponse> {
    const phoneE164 = this.identity.normalizePhone(dto.phone);
    const ipTruncated = truncateIp(request.ip);

    const result = await this.otp.request({
      destination: phoneE164,
      purpose: dto.purpose ?? 'LOGIN',
      ...(ipTruncated === undefined ? {} : { ipTruncated }),
      ...(request.deviceInstallId === undefined ? {} : { deviceInstallId: request.deviceInstallId }),
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.AUTH_OTP_REQUESTED,
      resourceType: 'otp_challenge',
      resourceId: result.challengeId,
      requestId: request.requestId,
      ...(ipTruncated === undefined ? {} : { ipTruncated }),
      ...(request.deviceInstallId === undefined ? {} : { deviceInstallId: request.deviceInstallId }),
    });

    return {
      challengeId: result.challengeId,
      expiresAt: result.expiresAt.toISOString(),
      expiresInSeconds: Math.max(0, Math.round((result.expiresAt.getTime() - Date.now()) / 1000)),
      ...(result.devCode === undefined ? {} : { devCode: result.devCode }),
    };
  }

  @Post('otp/verify')
  @PublicRoute()
  @RateLimit({
    name: 'auth.otp.verify',
    rules: [
      { dimension: 'destination', limit: 10, windowSeconds: 600 },
      { dimension: 'ip', limit: 40, windowSeconds: 3600 },
    ],
  })
  @ApiOperation({ summary: 'Verifier le code et ouvrir une session' })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() request: AppRequest): Promise<TokenPairResponse> {
    const phoneE164 = this.identity.normalizePhone(dto.phone);
    const ipTruncated = truncateIp(request.ip);

    try {
      await this.otp.verify({
        destination: phoneE164,
        purpose: dto.purpose ?? 'LOGIN',
        code: dto.code,
      });
    } catch (error) {
      await this.audit.record({
        action: AUDIT_ACTIONS.AUTH_OTP_FAILED,
        resourceType: 'otp_challenge',
        requestId: request.requestId,
        reason: 'Code refuse',
        ...(ipTruncated === undefined ? {} : { ipTruncated }),
      });
      throw error;
    }

    const { userId, created } = await this.identity.findOrCreateByVerifiedPhone({
      phoneE164,
      requestId: request.requestId,
      ...(ipTruncated === undefined ? {} : { ipTruncated }),
    });

    let deviceId: string | undefined;

    if (dto.device) {
      ({ deviceId } = await this.identity.upsertDevice({ ...dto.device, userId }));
    }

    const userAgent = request.header('user-agent');

    const tokens = await this.sessions.create({
      userId,
      strongAuthentication: true,
      ...(dto.organizationId === undefined ? {} : { organizationId: dto.organizationId }),
      ...(deviceId === undefined ? {} : { deviceId }),
      ...(userAgent === undefined ? {} : { userAgent }),
      ...(ipTruncated === undefined ? {} : { ipTruncated }),
      requestId: request.requestId,
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.AUTH_OTP_VERIFIED,
      resourceType: 'session',
      resourceId: tokens.sessionId,
      actorUserId: userId,
      requestId: request.requestId,
      ...(ipTruncated === undefined ? {} : { ipTruncated }),
    });

    await this.outbox.enqueue({
      aggregateType: 'user',
      aggregateId: userId,
      eventType: OUTBOX_EVENTS.USER_LOGGED_IN,
      payload: { userId, sessionId: tokens.sessionId, accountCreated: created },
    });

    return toTokenPairResponse(tokens, created);
  }

  @Post('refresh')
  @PublicRoute()
  @RateLimit({
    name: 'auth.refresh',
    rules: [{ dimension: 'ip', limit: 60, windowSeconds: 3600 }],
  })
  @ApiOperation({ summary: 'Renouveler les jetons par rotation du refresh token' })
  async refresh(@Body() dto: RefreshTokenDto, @Req() request: AppRequest): Promise<TokenPairResponse> {
    const ipTruncated = truncateIp(request.ip);

    const tokens = await this.sessions.refresh({
      refreshToken: dto.refreshToken,
      requestId: request.requestId,
      ...(dto.organizationId === undefined ? {} : { organizationId: dto.organizationId }),
      ...(ipTruncated === undefined ? {} : { ipTruncated }),
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.AUTH_SESSION_REFRESHED,
      resourceType: 'session',
      resourceId: tokens.sessionId,
      requestId: request.requestId,
      ...(ipTruncated === undefined ? {} : { ipTruncated }),
    });

    return toTokenPairResponse(tokens, false);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Fermer la session courante' })
  async logout(
    @Body() dto: LogoutDto,
    @CurrentActor() actor: AuthenticatedActor,
    @Req() request: AppRequest,
  ): Promise<void> {
    await this.sessions.revoke(actor.sessionId, dto.allDevices === true ? 'logout_all' : 'logout');

    await this.audit.recordForActor(actor, {
      action: AUDIT_ACTIONS.AUTH_SESSION_REVOKED,
      resourceType: 'session',
      resourceId: actor.sessionId,
      requestId: request.requestId,
      reason: dto.allDevices === true ? 'Deconnexion de tous les appareils' : 'Deconnexion',
    });
  }

  @Get('sessions')
  @ApiOperation({ summary: "Lister les sessions actives, revocables par l'utilisateur" })
  async listSessions(@CurrentActor() actor: AuthenticatedActor): Promise<SessionResponse[]> {
    const sessions = await this.sessions.listActiveSessions(actor.userId);

    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
      userAgent: session.userAgent,
      platform: session.platform,
      current: session.id === actor.sessionId,
    }));
  }
}

@ApiTags('Mon compte')
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(
    private readonly identity: IdentityService,
    private readonly sessions: SessionService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Consulter mon profil et mes appartenances' })
  async me(@CurrentActor() actor: AuthenticatedActor): Promise<MeResponse> {
    return toMeResponse(await this.identity.getProfile(actor.userId));
  }

  @Patch()
  @ApiOperation({ summary: 'Mettre a jour mon profil' })
  async update(@CurrentActor() actor: AuthenticatedActor, @Body() dto: UpdateMeDto): Promise<MeResponse> {
    return toMeResponse(await this.identity.updateProfile(actor.userId, dto));
  }

  @Get('consents')
  @ApiOperation({ summary: 'Consulter mes consentements' })
  async consents(@CurrentActor() actor: AuthenticatedActor) {
    return this.identity.listConsents(actor.userId);
  }

  @Post('consents')
  @ApiOperation({ summary: 'Enregistrer un consentement' })
  async setConsent(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() body: { type: 'TERMS' | 'PRIVACY' | 'MARKETING' | 'LOCATION'; granted: boolean },
  ) {
    return this.identity.setConsent(actor.userId, body.type, body.granted);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Supprimer mon compte',
    description:
      "Le compte est anonymise et les sessions revoquees. L'historique financier est conserve sous forme anonymisee, conformement aux obligations de conservation.",
  })
  async remove(@CurrentActor() actor: AuthenticatedActor, @Body() dto: DeleteMeDto): Promise<void> {
    await this.identity.anonymizeAccount(actor, dto.reason);
    await this.sessions.revoke(actor.sessionId, 'account_anonymized');
  }
}

function toTokenPairResponse(
  tokens: {
    accessToken: string;
    accessTokenExpiresAt: Date;
    refreshToken: string;
    refreshTokenExpiresAt: Date;
    sessionId: string;
  },
  accountCreated: boolean,
): TokenPairResponse {
  return {
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
    refreshToken: tokens.refreshToken,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt.toISOString(),
    sessionId: tokens.sessionId,
    accountCreated,
  };
}

function toMeResponse(profile: Awaited<ReturnType<IdentityService['getProfile']>>): MeResponse {
  return {
    id: profile.id,
    phoneE164: profile.phoneE164,
    email: profile.email,
    fullName: profile.fullName,
    status: profile.status,
    language: profile.language,
    phoneVerified: profile.phoneVerified,
    avatarUrl: profile.avatarUrl,
    defaultCity: profile.defaultCity,
    defaultDistrict: profile.defaultDistrict,
    createdAt: profile.createdAt.toISOString(),
    memberships: profile.memberships,
    platformRole: profile.platformRole,
  };
}
