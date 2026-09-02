import { CompletionController } from './completion.controller';
import { CompletionService } from './completion.service';
import { Module } from '@nestjs/common';
import { TenantScopeService } from '../../common/auth/tenant-scope.service';
import { CommerceController } from './commerce.controller';
import { CommerceService } from './commerce.service';
import { MerchantOpsController } from './merchant-ops.controller';

@Module({
  controllers: [CommerceController, MerchantOpsController, CompletionController],
  providers: [CommerceService, TenantScopeService, CompletionService],
  exports: [CommerceService],
})
export class CommerceModule {}
