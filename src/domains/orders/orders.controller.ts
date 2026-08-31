import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentActor, RequirePermissions } from '../../common/auth/auth.decorators';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { PERMISSIONS } from '../../common/auth/permissions';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import type { AppRequest } from '../../common/http/request-context';
import { ChangeOrderStatusDto, CreateOrderDto } from './dto/orders.dto';
import { OrdersService, type OrderView } from './orders.service';

@ApiTags('Commandes')
@Controller({ version: '1' })
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('orders')
  @Idempotent({ scope: 'orders.create' })
  @ApiOperation({ summary: 'Passer une commande à emporter' })
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() dto: CreateOrderDto,
    @Req() _request: AppRequest,
  ): Promise<OrderView> {
    return this.orders.create(actor, dto);
  }

  @Get('orders')
  @ApiOperation({ summary: 'Lister mes commandes' })
  async listMine(@CurrentActor() actor: AuthenticatedActor): Promise<OrderView[]> {
    return this.orders.listMine(actor);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Détail d’une commande' })
  async getMine(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) orderId: string,
  ): Promise<OrderView> {
    return this.orders.getMine(actor, orderId);
  }

  @Post('orders/:id/cancel')
  @ApiOperation({ summary: 'Annuler une commande en attente' })
  async cancel(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) orderId: string,
  ): Promise<OrderView> {
    return this.orders.cancelMine(actor, orderId);
  }

  @Post('orders/:id/confirm-pickup')
  @ApiOperation({ summary: 'Confirmer le retrait' })
  async confirmPickup(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) orderId: string,
  ): Promise<OrderView> {
    return this.orders.confirmPickup(actor, orderId);
  }

  @Post('merchant/orders')
  @RequirePermissions(PERMISSIONS.ORDERS_ACCEPT)
  @Idempotent({ scope: 'orders.manual' })
  @ApiOperation({ summary: 'Créer un ticket comptoir / téléphone' })
  async createManual(@CurrentActor() actor: AuthenticatedActor, @Body() dto: CreateOrderDto): Promise<OrderView> {
    return this.orders.createManual(actor, dto);
  }

  @Get('merchant/orders')
  @RequirePermissions(PERMISSIONS.ORDERS_READ)
  @ApiOperation({ summary: 'File des commandes restaurant' })
  async listMerchant(
    @CurrentActor() actor: AuthenticatedActor,
    @Query('establishmentId') establishmentId?: string,
  ): Promise<OrderView[]> {
    return this.orders.listMerchant(actor, establishmentId);
  }

  @Post('merchant/orders/:id/status')
  @RequirePermissions(PERMISSIONS.ORDERS_READ)
  @ApiOperation({ summary: 'Avancer le statut d’une commande' })
  async changeStatus(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() dto: ChangeOrderStatusDto,
  ): Promise<OrderView> {
    return this.orders.changeMerchantStatus(actor, orderId, dto.status);
  }
}
