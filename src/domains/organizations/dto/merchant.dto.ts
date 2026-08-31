import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ maxLength: 160, example: 'Groupe Chez Tante Marie' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @ApiPropertyOptional({ maxLength: 60, description: 'Numero de contribuable.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  taxId?: string;

  @ApiProperty({ example: '0701020304' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(24)
  contactPhone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  contactEmail?: string;
}

export class CreateEstablishmentDto {
  @ApiProperty({ maxLength: 160, example: 'Chez Tante Marie - Cocody' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '0701020304' })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  phone?: string;

  @ApiProperty({ maxLength: 120, example: 'Abidjan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  city!: string;

  @ApiPropertyOptional({ maxLength: 120, example: 'Cocody Angre' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  addressLine?: string;

  @ApiPropertyOptional({
    maxLength: 300,
    description: 'Repere textuel, essentiel pour se reperer localement.',
    example: 'En face de la pharmacie du Plateau, apres le carrefour',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  landmarkText?: string;

  @ApiProperty({ example: 5.3599517, description: 'Latitude WGS84.' })
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: -4.0082563, description: 'Longitude WGS84.' })
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 240 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(240)
  averagePreparationMinutes?: number;

  @ApiPropertyOptional({
    enum: ['NONE', 'SIMPLE', 'INGREDIENT'],
    default: 'NONE',
    description: 'Mode de stock exclusif. NONE masque entierement la fonction stock.',
  })
  @IsOptional()
  @IsEnum({ NONE: 'NONE', SIMPLE: 'SIMPLE', INGREDIENT: 'INGREDIENT' })
  stockMode?: 'NONE' | 'SIMPLE' | 'INGREDIENT';
}

export class UpdateEstablishmentDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(24)
  phone?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  addressLine?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  landmarkText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 240 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(240)
  averagePreparationMinutes?: number;

  @ApiPropertyOptional({ enum: ['NONE', 'SIMPLE', 'INGREDIENT'] })
  @IsOptional()
  @IsEnum({ NONE: 'NONE', SIMPLE: 'SIMPLE', INGREDIENT: 'INGREDIENT' })
  stockMode?: 'NONE' | 'SIMPLE' | 'INGREDIENT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasTerrace?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasAirConditioning?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  accessible?: boolean;
}

export class HoursSlotDto {
  @ApiProperty({
    enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
  })
  @IsEnum({
    MONDAY: 'MONDAY',
    TUESDAY: 'TUESDAY',
    WEDNESDAY: 'WEDNESDAY',
    THURSDAY: 'THURSDAY',
    FRIDAY: 'FRIDAY',
    SATURDAY: 'SATURDAY',
    SUNDAY: 'SUNDAY',
  })
  weekDay!: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

  @ApiProperty({
    minimum: 0,
    maximum: 1439,
    description: "Minutes depuis minuit, heure locale de l'etablissement. 11:30 vaut 690.",
    example: 690,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1439)
  opensAtMinutes!: number;

  @ApiProperty({
    minimum: 1,
    maximum: 2880,
    description: 'Peut depasser 1440 pour un service de nuit. 02:00 le lendemain vaut 1560.',
    example: 1380,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2880)
  closesAtMinutes!: number;
}

export class ReplaceHoursDto {
  @ApiProperty({ type: [HoursSlotDto], maxItems: 28 })
  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => HoursSlotDto)
  slots!: HoursSlotDto[];
}

export class ServiceConfigDto {
  @ApiProperty({ enum: ['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'RESERVATION'] })
  @IsEnum({
    DINE_IN: 'DINE_IN',
    TAKEAWAY: 'TAKEAWAY',
    DELIVERY: 'DELIVERY',
    RESERVATION: 'RESERVATION',
  })
  type!: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'RESERVATION';

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({
    description: 'Montant minimum de commande en FCFA entier, transmis en chaine de caracteres.',
    example: '2000',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  minimumOrderAmount?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 240 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  leadTimeMinutes?: number;
}

export class MerchantModuleDto {
  @ApiProperty()
  @IsString()
  @MaxLength(60)
  code!: string;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

export class SetMerchantModulesDto {
  @ApiProperty({ type: [MerchantModuleDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MerchantModuleDto)
  modules!: MerchantModuleDto[];
}

export class ReplaceServicesDto {
  @ApiProperty({ type: [ServiceConfigDto], maxItems: 4 })
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => ServiceConfigDto)
  services!: ServiceConfigDto[];
}

export class InviteMemberDto {
  @ApiProperty({ example: '0700000002' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(24)
  phone!: string;

  @ApiProperty({ enum: ['MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'COURIER', 'ACCOUNTANT'] })
  @IsEnum({
    MANAGER: 'MANAGER',
    CASHIER: 'CASHIER',
    WAITER: 'WAITER',
    KITCHEN: 'KITCHEN',
    COURIER: 'COURIER',
    ACCOUNTANT: 'ACCOUNTANT',
  })
  roleCode!: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  establishmentId?: string;
}
