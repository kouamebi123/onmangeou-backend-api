import { Module } from '@nestjs/common';
import { TenantScopeService } from '../../common/auth/tenant-scope.service';
import { CommerceController } from './commerce.controller';
import { CommerceService } from './commerce.service';
import { MerchantOpsController } from './merchant-ops.controller';

@Module({
  controllers: [CommerceController, MerchantOpsController],
  providers: [CommerceService, TenantScopeService],
  exports: [CommerceService],
})
export class CommerceModule {}
