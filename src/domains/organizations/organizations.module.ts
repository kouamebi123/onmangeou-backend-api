import { Module } from '@nestjs/common';
import { TenantScopeService } from '../../common/auth/tenant-scope.service';
import { MerchantController } from './merchant.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  controllers: [MerchantController],
  providers: [OrganizationsService, TenantScopeService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
