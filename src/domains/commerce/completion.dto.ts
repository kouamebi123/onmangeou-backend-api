import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export class SettlementDto {
  @IsString() @Matches(/^[1-9][0-9]{0,14}$/) amount!: string;
  @IsString() @MinLength(2) @MaxLength(160) reference!: string;
}
export class EstablishmentPageDto {
  @IsUUID() establishmentId!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) offset = 0;
}
export class EventWriteDto {
  @IsUUID() establishmentId!: string;
  @IsString() @MinLength(3) @MaxLength(160) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) body?: string;
  @IsISO8601() startsAt!: string;
  @IsISO8601() endsAt!: string;
}
