import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class DecideVerificationDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @ApiProperty({
    maxLength: 1000,
    description: "Motif conserve dans le journal d'audit et le dossier.",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}

export class AdminListQuery {
  @ApiPropertyOptional({ enum: ['OPEN', 'IN_REVIEW', 'APPROVED', 'REJECTED'] })
  @IsOptional()
  @IsIn(['OPEN', 'IN_REVIEW', 'APPROVED', 'REJECTED'])
  status?: 'OPEN' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ enum: ['DRAFT', 'PENDING_VERIFICATION', 'PUBLISHED', 'SUSPENDED', 'CLOSED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'PENDING_VERIFICATION', 'PUBLISHED', 'SUSPENDED', 'CLOSED'])
  establishmentStatus?: 'DRAFT' | 'PENDING_VERIFICATION' | 'PUBLISHED' | 'SUSPENDED' | 'CLOSED';

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}

export class AdminModulePriceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  code!: string;

  @ApiProperty({ description: 'Prix mensuel en FCFA entier.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  monthlyPriceAmount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  included?: boolean;
}

export class UpdateModulePricesDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notice?: string;

  @ApiProperty({ type: [AdminModulePriceDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => AdminModulePriceDto)
  modules!: AdminModulePriceDto[];
}
