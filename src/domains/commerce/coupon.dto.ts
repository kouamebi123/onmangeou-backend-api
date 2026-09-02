import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CouponWriteDto {
  @IsUUID()
  establishmentId!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,40}$/)
  code!: string;

  @IsInt()
  @Min(1)
  @Max(10000)
  discountBps!: number;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(0|[1-9]\d{0,14})$/)
  minimumAmount?: string;
}

export class CouponStatusDto {
  @IsBoolean()
  active!: boolean;
}

export class CouponListDto {
  @IsUUID()
  establishmentId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000)
  offset = 0;
}
