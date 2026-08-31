import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Les montants entrent en chaine de chiffres.
 *
 * Un `number` JSON perdrait la precision au-dela de 2^53 et autoriserait des
 * decimales, ce que le FCFA n'admet pas (specification section 13.3).
 */
const AMOUNT_PATTERN = /^\d{1,15}$/;

export class CreateMenuDto {
  @ApiProperty()
  @IsUUID()
  establishmentId!: string;

  @ApiProperty({ maxLength: 120, example: 'Carte du midi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 999, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  position?: number;
}

export class CreateCategoryDto {
  @ApiProperty()
  @IsUUID()
  menuId!: string;

  @ApiProperty({ maxLength: 120, example: 'Plats de riz' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 999, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  position?: number;
}

export class CreateProductDto {
  @ApiProperty()
  @IsUUID()
  establishmentId!: string;

  @ApiPropertyOptional({ description: 'Categorie de rattachement.' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ maxLength: 160, example: 'Poulet braise' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({
    description: 'Prix de base en FCFA entier, transmis en chaine de caracteres.',
    example: '3500',
  })
  @IsString()
  @Matches(AMOUNT_PATTERN, {
    message: 'basePriceAmount doit etre un entier de FCFA sans decimale ni espace',
  })
  basePriceAmount!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 240 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(240)
  preparationMinutes?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 3, description: '0 doux, 3 tres pimente.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3)
  spicyLevel?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  vegetarian?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  halal?: boolean;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 240 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(240)
  preparationMinutes?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3)
  spicyLevel?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  vegetarian?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  halal?: boolean;
}

export class ChangeProductPriceDto {
  @ApiProperty({ description: 'Nouveau prix en FCFA entier.', example: '4000' })
  @IsString()
  @Matches(AMOUNT_PATTERN, { message: 'newAmount doit etre un entier de FCFA' })
  newAmount!: string;

  @ApiPropertyOptional({ maxLength: 200, description: 'Motif conserve dans l\'historique.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class SetAvailabilityDto {
  @ApiProperty({ enum: ['AVAILABLE', 'OUT_OF_STOCK', 'HIDDEN'] })
  @IsEnum({ AVAILABLE: 'AVAILABLE', OUT_OF_STOCK: 'OUT_OF_STOCK', HIDDEN: 'HIDDEN' })
  status!: 'AVAILABLE' | 'OUT_OF_STOCK' | 'HIDDEN';

  @ApiPropertyOptional({
    description: 'Retour automatique en disponibilite apres cette date, en UTC ISO 8601.',
  })
  @IsOptional()
  @IsString()
  unavailableUntil?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  @ApiPropertyOptional({
    description:
      "Horodatage local de la modification, pour arbitrer une synchronisation hors ligne. La derniere ecriture gagne, avec audit.",
  })
  @IsOptional()
  @IsString()
  clientChangedAt?: string;
}

export class PublishDto {
  @ApiProperty({ enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] })
  @IsEnum({ DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED', ARCHIVED: 'ARCHIVED' })
  status!: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}
