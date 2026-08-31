import { Module } from '@nestjs/common';
import { TenantScopeService } from '../../common/auth/tenant-scope.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, TenantScopeService],
  exports: [CatalogService],
})
export class CatalogModule {}
