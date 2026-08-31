import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateOrderItemDto {
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

export class CreateOrderDto {
  @ApiProperty()
  @IsUUID()
  establishmentId!: string;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  customerName?: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  customerPhone?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ enum: ['CASH', 'WAVE', 'ORANGE_MONEY', 'MTN', 'MOOV', 'CARD'] })
  @IsOptional()
  @IsEnum(['CASH', 'WAVE', 'ORANGE_MONEY', 'MTN', 'MOOV', 'CARD'])
  paymentMethod?: 'CASH' | 'WAVE' | 'ORANGE_MONEY' | 'MTN' | 'MOOV' | 'CARD';

  @ApiPropertyOptional({ enum: ['TAKEAWAY', 'DINE_IN', 'DELIVERY'] })
  @IsOptional()
  @IsEnum(['TAKEAWAY', 'DINE_IN', 'DELIVERY'])
  service?: 'TAKEAWAY' | 'DINE_IN' | 'DELIVERY';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  deliveryAddress?: string;

  @ApiPropertyOptional({ description: 'Commande programmee, ISO 8601 UTC.' })
  @IsOptional()
  @IsISO8601()
  scheduledFor?: string;
}

export class ChangeOrderStatusDto {
  @ApiProperty({
    enum: ['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'REJECTED'],
  })
  @IsEnum(['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'REJECTED'])
  status!: 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'REJECTED';
}

export class ListMerchantOrdersDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  establishmentId?: string;
}
