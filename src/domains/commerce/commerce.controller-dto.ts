import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsUUID,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateOrderItemDto } from '../orders/dto/orders.dto';

export {
  CreatePaymentIntentDto,
  CreateReservationDto,
  CreateReviewDto,
  SandboxWebhookDto,
  SupportTicketDto,
} from './commerce.dto';

export class QuoteBody {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  couponCode?: string;

  @ApiProperty()
  @IsUUID()
  establishmentId!: string;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}

export class CreateOrderItemsBody extends QuoteBody {}
