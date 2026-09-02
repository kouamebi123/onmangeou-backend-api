import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class QuoteOrderDto {
  @ApiProperty()
  @IsUUID()
  establishmentId!: string;

  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;
}

export class CreatePaymentIntentDto {
  @ApiProperty()
  @IsUUID()
  orderId!: string;

  @ApiProperty({ enum: ['WAVE', 'WERO', 'ORANGE_MONEY', 'MTN', 'MOOV', 'CARD'] })
  @IsEnum(['WAVE', 'WERO', 'ORANGE_MONEY', 'MTN', 'MOOV', 'CARD'])
  provider!: 'WAVE' | 'WERO' | 'ORANGE_MONEY' | 'MTN' | 'MOOV' | 'CARD';
}

export class SandboxWebhookDto {
  @ApiProperty()
  @IsUUID()
  intentId!: string;

  @ApiProperty()
  @IsString()
  secret!: string;
}

export class CreateReservationDto {
  @ApiProperty()
  @IsUUID()
  establishmentId!: string;

  @ApiProperty()
  @IsISO8601()
  startsAt!: string;

  @ApiProperty({ minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  partySize!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ReservationStatusDto {
  @ApiProperty({ enum: ['CONFIRMED', 'REJECTED', 'CANCELLED', 'SEATED', 'COMPLETED', 'NO_SHOW'] })
  @IsEnum(['CONFIRMED', 'REJECTED', 'CANCELLED', 'SEATED', 'COMPLETED', 'NO_SHOW'])
  status!: string;
}

export class CreateReviewDto {
  @ApiProperty()
  @IsUUID()
  orderId!: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;
}

export class ReviewResponseDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  body!: string;
}

export class CreateEventDto {
  @ApiProperty()
  @IsUUID()
  establishmentId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  body?: string;

  @ApiProperty()
  @IsISO8601()
  startsAt!: string;
}

export class CreatePromotionDto {
  @ApiProperty()
  @IsUUID()
  establishmentId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  body?: string;

  @ApiProperty({ minimum: 0, maximum: 10000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  discountBps!: number;
}

export class OpenCashDto {
  @ApiProperty()
  @IsUUID()
  establishmentId!: string;

  @ApiProperty()
  @IsString()
  openingAmount!: string;
}

export class CashMovementDto {
  @ApiProperty()
  @IsUUID()
  sessionId!: string;

  @ApiProperty({ enum: ['IN', 'OUT'] })
  @IsEnum(['IN', 'OUT'])
  kind!: 'IN' | 'OUT';

  @ApiProperty()
  @IsString()
  amount!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  label!: string;
}

export class CreateExpenseDto {
  @ApiProperty()
  @IsUUID()
  establishmentId!: string;

  @ApiProperty()
  @IsString()
  amount!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  label!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;
}

export class CreateCreditDto {
  @ApiProperty()
  @IsUUID()
  establishmentId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  customerName!: string;

  @ApiProperty()
  @IsString()
  amount!: string;
}

export class CreateDebtDto {
  @ApiProperty()
  @IsUUID()
  establishmentId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  supplierName!: string;

  @ApiProperty()
  @IsString()
  amount!: string;
}

export class InventoryItemDto {
  @ApiProperty()
  @IsUUID()
  establishmentId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(24)
  unit?: string;
}

export class StockMoveDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  delta!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  reason!: string;
}

export class SupportTicketDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  subject!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  body!: string;
}

export class DeliveryStatusDto {
  @ApiProperty({ enum: ['ASSIGNED', 'PICKED_UP', 'DELIVERING', 'DELIVERED', 'CANCELLED'] })
  @IsEnum(['ASSIGNED', 'PICKED_UP', 'DELIVERING', 'DELIVERED', 'CANCELLED'])
  status!: 'ASSIGNED' | 'PICKED_UP' | 'DELIVERING' | 'DELIVERED' | 'CANCELLED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  courierName?: string;
}
