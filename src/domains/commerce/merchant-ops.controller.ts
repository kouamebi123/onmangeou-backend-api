import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentActor, RequirePermissions } from '../../common/auth/auth.decorators';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { PERMISSIONS, PLATFORM_PERMISSIONS } from '../../common/auth/permissions';
import { CommerceService } from './commerce.service';
import { ReservationHistoryDto } from './reservation-history.dto';
import { CouponWriteDto, CouponStatusDto, CouponListDto } from './coupon.dto';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import {
  CashMovementDto,
  CreateCreditDto,
  CreateDebtDto,
  CreateEventDto,
  CreateExpenseDto,
  CreatePromotionDto,
  DeliveryStatusDto,
  InventoryItemDto,
  OpenCashDto,
  ReviewResponseDto,
  ReservationStatusDto,
  CreateTableDto,
  StockMoveDto,
} from './commerce.dto';

@ApiTags('Exploitation restaurant')
@Controller({ version: '1' })
export class MerchantOpsController {
  constructor(private readonly commerce: CommerceService) {}

  @Get('admin/capabilities')
  @RequirePermissions(PLATFORM_PERMISSIONS.ADMIN_ESTABLISHMENT_READ)
  capabilities(@CurrentActor() actor: AuthenticatedActor) {
    return { permissions: [...actor.permissions].filter((code) => code.startsWith('admin.')) };
  }

  @Get('merchant/reservations')
  @RequirePermissions(PERMISSIONS.ORDERS_READ)
  async reservations(
    @CurrentActor() actor: AuthenticatedActor,
    @Query('establishmentId') establishmentId?: string,
  ) {
    return this.commerce.listMerchantReservations(actor, establishmentId);
  }

  @Get('merchant/reservations/history')
  @RequirePermissions(PERMISSIONS.ORDERS_READ)
  @ApiOperation({ summary: 'Historique des réservations, 20 résultats par page' })
  reservationHistory(@CurrentActor() actor: AuthenticatedActor, @Query() query: ReservationHistoryDto) {
    return this.commerce.listReservationHistory(actor, query.establishmentId, query.cursor);
  }

  @Post('merchant/reservations/:id/status')
  @RequirePermissions(PERMISSIONS.ORDERS_ACCEPT)
  async reservationStatus(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReservationStatusDto,
  ) {
    return this.commerce.changeReservationStatus(actor, id, body.status);
  }

  @Post('merchant/reviews/:id/response')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_WRITE)
  async reviewResponse(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewResponseDto,
  ) {
    return this.commerce.respondReview(actor, id, dto);
  }

  @Post('merchant/events')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_WRITE)
  async event(@CurrentActor() actor: AuthenticatedActor, @Body() dto: CreateEventDto) {
    return this.commerce.createEvent(actor, dto);
  }

  @Post('merchant/promotions')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_WRITE)
  async promo(@CurrentActor() actor: AuthenticatedActor, @Body() dto: CreatePromotionDto) {
    return this.commerce.createPromotion(actor, dto);
  }

  @Post('merchant/cash-sessions')
  @RequirePermissions(PERMISSIONS.CASH_SESSION_WRITE)
  async openCash(@CurrentActor() actor: AuthenticatedActor, @Body() dto: OpenCashDto) {
    return this.commerce.openCash(actor, dto);
  }

  @Get('merchant/cash-sessions/current')
  @RequirePermissions(PERMISSIONS.CASH_SESSION_WRITE)
  async currentCash(
    @CurrentActor() actor: AuthenticatedActor,
    @Query('establishmentId') establishmentId: string,
  ) {
    return this.commerce.currentCash(actor, establishmentId);
  }

  @Post('merchant/cash-sessions/:id/close')
  @RequirePermissions(PERMISSIONS.CASH_SESSION_WRITE)
  async closeCash(@CurrentActor() actor: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.closeCash(actor, id);
  }

  @Post('merchant/cash-movements')
  @RequirePermissions(PERMISSIONS.CASH_MOVEMENT_WRITE)
  async movement(@CurrentActor() actor: AuthenticatedActor, @Body() dto: CashMovementDto) {
    return this.commerce.addCashMovement(actor, dto);
  }

  @Post('merchant/expenses')
  @RequirePermissions(PERMISSIONS.EXPENSES_CREATE)
  async expense(@CurrentActor() actor: AuthenticatedActor, @Body() dto: CreateExpenseDto) {
    return this.commerce.createExpense(actor, dto);
  }

  @Get('merchant/expenses')
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  async expenses(
    @CurrentActor() actor: AuthenticatedActor,
    @Query('establishmentId') establishmentId: string,
  ) {
    return this.commerce.listExpenses(actor, establishmentId);
  }

  @Post('merchant/credits')
  @RequirePermissions(PERMISSIONS.EXPENSES_CREATE)
  async credit(@CurrentActor() actor: AuthenticatedActor, @Body() dto: CreateCreditDto) {
    return this.commerce.createCredit(actor, dto);
  }

  @Post('merchant/debts')
  @RequirePermissions(PERMISSIONS.EXPENSES_CREATE)
  async debt(@CurrentActor() actor: AuthenticatedActor, @Body() dto: CreateDebtDto) {
    return this.commerce.createDebt(actor, dto);
  }

  @Get('merchant/credits')
  @RequirePermissions(PERMISSIONS.EXPENSES_CREATE)
  async credits(
    @CurrentActor() actor: AuthenticatedActor,
    @Query('establishmentId') establishmentId: string,
  ) {
    return this.commerce.listCredits(actor, establishmentId);
  }

  @Get('merchant/debts')
  @RequirePermissions(PERMISSIONS.EXPENSES_CREATE)
  async debts(@CurrentActor() actor: AuthenticatedActor, @Query('establishmentId') establishmentId: string) {
    return this.commerce.listDebts(actor, establishmentId);
  }

  @Get('merchant/reports/daily')
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  async report(@CurrentActor() actor: AuthenticatedActor, @Query('establishmentId') establishmentId: string) {
    return this.commerce.dailyReport(actor, establishmentId);
  }

  @Get('merchant/inventory')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  async inventory(
    @CurrentActor() actor: AuthenticatedActor,
    @Query('establishmentId') establishmentId: string,
  ) {
    return this.commerce.listInventory(actor, establishmentId);
  }

  @Post('merchant/inventory')
  @RequirePermissions(PERMISSIONS.INVENTORY_WRITE)
  async createItem(@CurrentActor() actor: AuthenticatedActor, @Body() dto: InventoryItemDto) {
    return this.commerce.createInventoryItem(actor, dto);
  }

  @Post('merchant/inventory/:id/move')
  @RequirePermissions(PERMISSIONS.INVENTORY_WRITE)
  async move(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StockMoveDto,
  ) {
    return this.commerce.moveStock(actor, id, dto);
  }

  @Get('merchant/deliveries')
  @RequirePermissions(PERMISSIONS.ORDERS_READ)
  async deliveries(
    @CurrentActor() actor: AuthenticatedActor,
    @Query('establishmentId') establishmentId?: string,
  ) {
    return this.commerce.listDelivery(actor, establishmentId);
  }

  @Post('merchant/deliveries/:id/status')
  @RequirePermissions(PERMISSIONS.ORDERS_DELIVER)
  async deliveryStatus(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeliveryStatusDto,
  ) {
    return this.commerce.changeDelivery(actor, id, dto);
  }

  @Get('merchant/tables')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_WRITE)
  async tables(@CurrentActor() actor: AuthenticatedActor, @Query('establishmentId') establishmentId: string) {
    return this.commerce.listTables(actor, establishmentId);
  }

  @Post('merchant/tables')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_WRITE)
  async createTable(@CurrentActor() actor: AuthenticatedActor, @Body() body: CreateTableDto) {
    return this.commerce.createTable(actor, body.establishmentId, body.name, body.seats);
  }

  @Get('merchant/coupons')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_WRITE)
  async coupons(@CurrentActor() actor: AuthenticatedActor, @Query() query: CouponListDto) {
    return this.commerce.listCoupons(actor, query.establishmentId, query.offset);
  }

  @Post('merchant/coupons')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_WRITE)
  @Idempotent({ scope: 'coupon.create' })
  async createCoupon(@CurrentActor() actor: AuthenticatedActor, @Body() body: CouponWriteDto) {
    return this.commerce.createCoupon(actor, body);
  }

  @Post('merchant/coupons/:id/status')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_WRITE)
  async couponStatus(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CouponStatusDto,
  ) {
    return this.commerce.setCouponActive(actor, id, body.active);
  }

  @Get('admin/orders')
  @RequirePermissions(PLATFORM_PERMISSIONS.ADMIN_ESTABLISHMENT_READ)
  @ApiOperation({ summary: 'Superviser les commandes' })
  async adminOrders() {
    return this.commerce.adminOrders();
  }

  @Post('admin/orders/:id/refund')
  @RequirePermissions(PLATFORM_PERMISSIONS.ADMIN_PAYMENT_REFUND)
  @ApiOperation({ summary: 'Rembourser un paiement sandbox' })
  async refundOrder(@CurrentActor() actor: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.refundOrder(actor, id);
  }

  @Get('admin/reviews')
  @RequirePermissions(PLATFORM_PERMISSIONS.ADMIN_ESTABLISHMENT_READ)
  async adminReviews() {
    return this.commerce.adminReviews();
  }

  @Post('admin/reviews/:id/hide')
  @RequirePermissions(PLATFORM_PERMISSIONS.ADMIN_REVIEW_MODERATE)
  async hideReview(@CurrentActor() actor: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.hideReview(actor, id);
  }

  @Get('admin/support-tickets')
  @RequirePermissions(PLATFORM_PERMISSIONS.ADMIN_ESTABLISHMENT_READ)
  async adminTickets() {
    return this.commerce.adminTickets();
  }

  @Post('admin/support-tickets/:id/close')
  @RequirePermissions(PLATFORM_PERMISSIONS.ADMIN_SUPPORT_WRITE)
  async closeTicket(@CurrentActor() actor: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.commerce.closeTicket(actor, id);
  }
}
