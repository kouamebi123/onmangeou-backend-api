import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentActor, PublicRoute } from '../../common/auth/auth.decorators';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import { CommerceService } from './commerce.service';
import {
  CreatePaymentIntentDto,
  CreateReservationDto,
  CreateReviewDto,
  CreateOrderItemsBody,
  QuoteBody,
  SandboxWebhookDto,
  SupportTicketDto,
} from './commerce.controller-dto';

@ApiTags('Commerce client')
@Controller({ version: '1' })
export class CommerceController {
  constructor(private readonly commerce: CommerceService) {}

  @Post('orders/quote')
  @PublicRoute()
  @ApiOperation({ summary: 'Devis d’une commande' })
  async quote(@Body() body: QuoteBody) {
    return this.commerce.quote(body.establishmentId, body.items);
  }

  @Get('cart')
  async getCart(@CurrentActor() actor: AuthenticatedActor) {
    return this.commerce.getCart(actor);
  }

  @Put('cart/items')
  async putCart(@CurrentActor() actor: AuthenticatedActor, @Body() body: CreateOrderItemsBody) {
    return this.commerce.putCart(actor, body.establishmentId, body.items);
  }

  @Post('payments/intents')
  @Idempotent({ scope: 'payments.intent' })
  async createIntent(@CurrentActor() actor: AuthenticatedActor, @Body() dto: CreatePaymentIntentDto) {
    return this.commerce.createPaymentIntent(actor, dto);
  }

  @Post('payments/intents/:id/confirm')
  async confirmIntent(@CurrentActor() actor: AuthenticatedActor, @Param('id', ParseUUIDPipe) intentId: string) {
    return this.commerce.confirmSandboxIntent(actor, intentId);
  }

  @Post('payments/webhooks/sandbox')
  @PublicRoute()
  async webhook(@Body() dto: SandboxWebhookDto) {
    return this.commerce.sandboxWebhook(dto.intentId, dto.secret);
  }

  @Get('notifications')
  async notifications(@CurrentActor() actor: AuthenticatedActor) {
    return this.commerce.listNotifications(actor);
  }

  @Post('notifications/read')
  async readNotifications(@CurrentActor() actor: AuthenticatedActor) {
    return this.commerce.markNotificationsRead(actor);
  }

  @Post('follows/:restaurantId')
  async follow(@CurrentActor() actor: AuthenticatedActor, @Param('restaurantId', ParseUUIDPipe) id: string) {
    return this.commerce.follow(actor, id, true);
  }

  @Post('follows/:restaurantId/unfollow')
  async unfollow(@CurrentActor() actor: AuthenticatedActor, @Param('restaurantId', ParseUUIDPipe) id: string) {
    return this.commerce.follow(actor, id, false);
  }

  @Post('reservations')
  @Idempotent({ scope: 'reservations.create' })
  async reserve(@CurrentActor() actor: AuthenticatedActor, @Body() dto: CreateReservationDto) {
    return this.commerce.createReservation(actor, dto);
  }

  @Get('reservations')
  async myReservations(@CurrentActor() actor: AuthenticatedActor) {
    return this.commerce.listMyReservations(actor);
  }

  @Post('reservations/:id/cancel')
  async cancelReservation(@CurrentActor() actor: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.cancelReservation(actor, id);
  }

  @Post('reviews')
  @Idempotent({ scope: 'reviews.create' })
  async review(@CurrentActor() actor: AuthenticatedActor, @Body() dto: CreateReviewDto) {
    return this.commerce.createReview(actor, dto);
  }

  @Get('restaurants/:id/reviews')
  @PublicRoute()
  async reviews(@Param('id', ParseUUIDPipe) establishmentId: string) {
    return this.commerce.listReviews(establishmentId);
  }

  @Get('restaurants/:id/events')
  @PublicRoute()
  async events(@Param('id', ParseUUIDPipe) establishmentId: string) {
    return this.commerce.listEvents(establishmentId);
  }

  @Get('restaurants/:id/promotions')
  @PublicRoute()
  async promotions(@Param('id', ParseUUIDPipe) establishmentId: string) {
    return this.commerce.listPromotions(establishmentId);
  }

  @Get('me/addresses')
  async addresses(@CurrentActor() actor: AuthenticatedActor) {
    return this.commerce.listAddresses(actor);
  }

  @Post('me/addresses')
  async createAddress(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() body: { label: string; line: string },
  ) {
    return this.commerce.createAddress(actor, body);
  }

  @Post('me/addresses/:id/delete')
  async deleteAddress(@CurrentActor() actor: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.deleteAddress(actor, id);
  }

  @Post('support/tickets')
  async support(@CurrentActor() actor: AuthenticatedActor, @Body() dto: SupportTicketDto) {
    return this.commerce.createSupportTicket(actor, dto);
  }

  @Get('support/tickets')
  async myTickets(@CurrentActor() actor: AuthenticatedActor) {
    return this.commerce.listSupportTickets(actor);
  }
}
