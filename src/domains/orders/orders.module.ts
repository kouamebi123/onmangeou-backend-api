import { Module } from '@nestjs/common';
import { TenantScopeService } from '../../common/auth/tenant-scope.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, TenantScopeService],
  exports: [OrdersService],
})
export class OrdersModule {}
