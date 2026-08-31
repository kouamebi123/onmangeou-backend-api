import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../common/config/app-config.service';
import { DomainError } from '../../common/errors/domain.error';
import { Clock } from '../../common/time/clock';
import {
  generateNumericCode,
  hashLowEntropySecret,
  verifyLowEntropySecret,
} from '../../common/security/hashing';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { SMS_SENDER, type SmsSender } from '../../infrastructure/notifications/sms.port';
import { APP_LOGGER, type AppLogger } from '../../common/logging/app-logger';
import type { OtpPurpose } from '../../infrastructure/prisma/generated/enums';

export interface RequestOtpInput {
  destination: string;
  purpose: OtpPurpose;
  ipTruncated?: string;
  deviceInstallId?: string;
}

export interface RequestOtpResult {
  challengeId: string;
  expiresAt: Date;
  /** Renseigne uniquement en developpement local (OTP_DEV_ECHO_CODE). */
  devCode?: string;
}

export interface VerifyOtpResult {
  challengeId: string;
  destination: string;
  purpose: OtpPurpose;
}

/**
 * Codes a usage unique par telephone.
 *
 * Reference : specification sections 8.2, 21.1 et 22.
 *
 * Invariants :
 *  - le code en clair n'est ni stocke ni journalise ;
 *  - un seul defi actif par destination et finalite : une nouvelle demande
 *    invalide la precedente, ce qui empeche de cumuler des codes valides ;
 *  - le nombre de tentatives est plafonne et verrouille le defi, pas le compte,
 *    afin qu'un tiers ne puisse pas bloquer un utilisateur en saisissant de faux
 *    codes ;
 *  - un defi expire, verrouille ou deja consomme ne peut plus etre verifie ;
 *  - le message d'echec est identique pour un code faux, un defi inexistant et un
 *    defi expire : distinguer ces cas renseignerait un attaquant sur l'existence
 *    d'une demande en cours.
 */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly clock: Clock,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  async request(input: RequestOtpInput): Promise<RequestOtpResult> {
    const { codeLength, ttlSeconds, maxAttempts, pepper, devEchoCode } = this.config.otp;

    const code = generateNumericCode(codeLength);
    const codeHash = await hashLowEntropySecret(code, pepper);
    const expiresAt = this.clock.plusSeconds(ttlSeconds);

    const existingUser = await this.prisma.user.findUnique({
      where: { phoneE164: input.destination },
      select: { id: true },
    });

    const challenge = await this.prisma.$transaction(async (tx) => {
      // Les defis encore ouverts sont expires : un seul code doit etre valide a
      // un instant donne pour une destination et une finalite.
      await tx.otpChallenge.updateMany({
        where: { destination: input.destination, purpose: input.purpose, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });

      return tx.otpChallenge.create({
        data: {
          destination: input.destination,
          purpose: input.purpose,
          codeHash,
          expiresAt,
          maxAttempts,
          userId: existingUser?.id ?? null,
          requestIpTruncated: input.ipTruncated ?? null,
          deviceInstallId: input.deviceInstallId ?? null,
        },
        select: { id: true, expiresAt: true },
      });
    });

    await this.sms.send({
      to: input.destination,
      templateCode: `otp.${input.purpose.toLowerCase()}`,
      body: `Votre code OnMangeOu est ${code}. Il expire dans ${Math.round(ttlSeconds / 60)} minutes.`,
    });

    this.logger.info('Code a usage unique envoye', {
      challengeId: challenge.id,
      purpose: input.purpose,
      domain: 'identity',
    });

    return {
      challengeId: challenge.id,
      expiresAt: challenge.expiresAt,
      ...(devEchoCode ? { devCode: code } : {}),
    };
  }

  /**
   * Verifie un code et consomme le defi.
   *
   * Le compteur de tentatives est incremente avant la comparaison : une
   * interruption reseau au mauvais moment ne doit pas offrir une tentative
   * gratuite.
   */
  async verify(input: { destination: string; purpose: OtpPurpose; code: string }): Promise<VerifyOtpResult> {
    const { pepper } = this.config.otp;

    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { destination: input.destination, purpose: input.purpose, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        codeHash: true,
        attempts: true,
        maxAttempts: true,
        expiresAt: true,
        destination: true,
        purpose: true,
      },
    });

    if (!challenge) {
      throw new DomainError('INVALID_CREDENTIALS', 'Aucun defi OTP actif pour cette destination');
    }

    if (this.clock.isExpired(challenge.expiresAt)) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { status: 'EXPIRED' },
      });
      throw new DomainError('INVALID_CREDENTIALS', `Defi OTP ${challenge.id} expire`);
    }

    const attempts = challenge.attempts + 1;
    const reachedLimit = attempts >= challenge.maxAttempts;

    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts, ...(reachedLimit ? { status: 'LOCKED' as const } : {}) },
    });

    const matches = await verifyLowEntropySecret(input.code, challenge.codeHash, pepper);

    if (!matches) {
      if (reachedLimit) {
        throw new DomainError('OTP_TOO_MANY_ATTEMPTS', `Defi OTP ${challenge.id} verrouille`);
      }
      throw new DomainError('INVALID_CREDENTIALS', `Code errone sur le defi ${challenge.id}`);
    }

    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { status: 'VERIFIED', consumedAt: this.clock.now() },
    });

    return {
      challengeId: challenge.id,
      destination: challenge.destination,
      purpose: challenge.purpose,
    };
  }
}
