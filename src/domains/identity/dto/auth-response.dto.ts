import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Modeles de sortie du domaine Identity, distincts des DTO d'entree. */

export class OtpRequestedResponse {
  @ApiProperty() challengeId!: string;
  @ApiProperty({ description: 'Expiration du code, en UTC ISO 8601.' })
  expiresAt!: string;
  @ApiProperty({ description: 'Duree de validite en secondes.' })
  expiresInSeconds!: number;
  @ApiPropertyOptional({
    description:
      "Code renvoye uniquement en developpement local, lorsque OTP_DEV_ECHO_CODE est actif. Toujours absent en staging et en production.",
  })
  devCode?: string;
}

export class TokenPairResponse {
  @ApiProperty() accessToken!: string;
  @ApiProperty({ description: 'Expiration de l\'access token, en UTC ISO 8601.' })
  accessTokenExpiresAt!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty() refreshTokenExpiresAt!: string;
  @ApiProperty() sessionId!: string;
  @ApiProperty({ description: 'Vrai si le compte vient d\'etre cree.' })
  accountCreated!: boolean;
}

export class MembershipResponse {
  @ApiProperty() organizationId!: string;
  @ApiProperty() organizationName!: string;
  @ApiProperty() roleCode!: string;
  @ApiProperty({ type: [String] }) establishmentIds!: string[];
}

export class MeResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ example: '+2250701020304' }) phoneE164!: string;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty({ nullable: true }) fullName!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty() language!: string;
  @ApiProperty() phoneVerified!: boolean;
  @ApiProperty({ nullable: true }) avatarUrl!: string | null;
  @ApiProperty({ nullable: true }) defaultCity!: string | null;
  @ApiProperty({ nullable: true }) defaultDistrict!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: [MembershipResponse] }) memberships!: MembershipResponse[];
  @ApiProperty({ nullable: true, description: 'Role interne de la plateforme, sinon null.' })
  platformRole!: 'ADMIN' | 'SUPPORT' | null;
}

export class SessionResponse {
  @ApiProperty() id!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ nullable: true }) lastUsedAt!: string | null;
  @ApiProperty({ nullable: true }) userAgent!: string | null;
  @ApiProperty({ nullable: true }) platform!: string | null;
  @ApiProperty({ description: 'Vrai pour la session utilisee par la requete courante.' })
  current!: boolean;
}
