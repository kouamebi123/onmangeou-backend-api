import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * DTO d'entree du domaine Identity.
 *
 * Les DTO d'entree sont distincts des modeles de sortie (specification
 * section 6.7) et la validation est en liste blanche : tout champ non declare est
 * retire par la ValidationPipe, ce qui neutralise le mass assignment
 * (specification section 22).
 */

export class RequestOtpDto {
  @ApiProperty({
    description: 'Numero de telephone ivoirien. Les formats locaux courants sont acceptes.',
    example: '0701020304',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(24)
  phone!: string;

  @ApiPropertyOptional({
    description: "Finalite du code. LOGIN par defaut.",
    enum: ['LOGIN', 'PHONE_VERIFICATION'],
    default: 'LOGIN',
  })
  @IsOptional()
  @IsIn(['LOGIN', 'PHONE_VERIFICATION'])
  purpose?: 'LOGIN' | 'PHONE_VERIFICATION';
}

export class DeviceInfoDto {
  @ApiProperty({ description: "Identifiant d'installation stable genere par l'application." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  installId!: string;

  @ApiProperty({ enum: ['ANDROID', 'IOS', 'WEB'] })
  @IsEnum({ ANDROID: 'ANDROID', IOS: 'IOS', WEB: 'WEB' })
  platform!: 'ANDROID' | 'IOS' | 'WEB';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  osVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  @ApiPropertyOptional({ description: 'Jeton push. Transmis uniquement avec consentement.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  pushToken?: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '0701020304' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(24)
  phone!: string;

  @ApiProperty({ description: 'Code recu par SMS.', example: '482913' })
  @IsString()
  @Matches(/^\d+$/, { message: 'code doit contenir uniquement des chiffres' })
  @Length(4, 8)
  code!: string;

  @ApiPropertyOptional({ enum: ['LOGIN', 'PHONE_VERIFICATION'], default: 'LOGIN' })
  @IsOptional()
  @IsIn(['LOGIN', 'PHONE_VERIFICATION'])
  purpose?: 'LOGIN' | 'PHONE_VERIFICATION';

  @ApiPropertyOptional({
    description: "Organisation a activer sur la session, pour l'application restaurant.",
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({ type: DeviceInfoDto })
  @IsOptional()
  device?: DeviceInfoDto;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token opaque obtenu lors de la connexion.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  refreshToken!: string;

  @ApiPropertyOptional({ description: "Organisation a activer sur la nouvelle session." })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

export class LogoutDto {
  @ApiPropertyOptional({
    description: 'Revoque toutes les sessions de la famille courante, pas seulement celle-ci.',
    default: false,
  })
  @IsOptional()
  allDevices?: boolean;
}

export class UpdateMeDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'email doit etre une adresse valide' })
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({ enum: ['fr-CI', 'fr'] })
  @IsOptional()
  @IsIn(['fr-CI', 'fr'])
  language?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  defaultCity?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  defaultDistrict?: string;
}

export class DeleteMeDto {
  @ApiProperty({ description: 'Motif conserve dans le journal d\'audit.', maxLength: 300 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;
}
