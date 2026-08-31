import { Injectable } from '@nestjs/common';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../config/app-config.service';
import { DomainError } from '../errors/domain.error';
import { Clock } from '../time/clock';

/**
 * Emission et verification des access tokens.
 *
 * Reference : specification section 21.3.
 *
 * Choix ES256 (signature asymetrique) plutot que HS256 : la cle privee reste
 * cantonnee au service d'authentification, et un futur service de lecture peut
 * verifier un jeton avec la seule cle publique, sans pouvoir en forger.
 *
 * Le refresh token n'est pas un JWT : c'est un secret opaque de 256 bits stocke
 * hashe cote serveur, ce qui permet une revocation immediate et une detection de
 * rejeu par famille.
 */

export interface AccessTokenClaims {
  /** Identifiant utilisateur. */
  sub: string;
  /** Identifiant de session, pour revoquer un jeton encore valide. */
  sid: string;
  /** Organisation active, absente pour un client particulier. */
  org?: string;
  /** Instant de derniere authentification forte, en secondes epoch. */
  mfa?: number;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
  expiresInSeconds: number;
}

@Injectable()
export class TokenService {
  private readonly privateKey: string;
  private readonly publicKey: string;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly clock: Clock,
  ) {
    const { privateKey, publicKey } = this.config.jwt;

    // Les cles sont reserialisees en PEM apres un passage par `node:crypto` :
    // une cle malformee doit faire echouer le demarrage, pas la premiere
    // connexion d'un utilisateur.
    this.privateKey = createPrivateKey(privateKey).export({ type: 'pkcs8', format: 'pem' }).toString();
    this.publicKey = createPublicKey(publicKey).export({ type: 'spki', format: 'pem' }).toString();
  }

  async issueAccessToken(input: {
    userId: string;
    sessionId: string;
    organizationId?: string;
    mfaSatisfiedAt?: Date;
  }): Promise<IssuedAccessToken> {
    const { issuer, audience, accessTokenTtlSeconds } = this.config.jwt;
    const expiresAt = this.clock.plusSeconds(accessTokenTtlSeconds);

    const payload: Record<string, unknown> = {
      sub: input.userId,
      sid: input.sessionId,
    };

    if (input.organizationId !== undefined) {
      payload['org'] = input.organizationId;
    }

    if (input.mfaSatisfiedAt !== undefined) {
      payload['mfa'] = Math.floor(input.mfaSatisfiedAt.getTime() / 1000);
    }

    const token = await this.jwt.signAsync(payload, {
      algorithm: 'ES256',
      privateKey: this.privateKey,
      issuer,
      audience,
      expiresIn: accessTokenTtlSeconds,
    });

    return { token, expiresAt, expiresInSeconds: accessTokenTtlSeconds };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    const { issuer, audience } = this.config.jwt;

    try {
      return await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        algorithms: ['ES256'],
        publicKey: this.publicKey,
        issuer,
        audience,
      });
    } catch (error) {
      const expired = error instanceof Error && error.name === 'TokenExpiredError';

      throw new DomainError(
        expired ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED',
        `Access token refuse : ${error instanceof Error ? error.message : 'cause inconnue'}`,
      );
    }
  }
}
