import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentActor, RequirePermissions } from '../../common/auth/auth.decorators';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { PERMISSIONS } from '../../common/auth/permissions';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import type { AppRequest } from '../../common/http/request-context';
import { CatalogService, type MerchantProductView } from './catalog.service';
import {
  ChangeProductPriceDto,
  CreateCategoryDto,
  CreateMenuDto,
  CreateProductDto,
  PublishDto,
  SetAvailabilityDto,
  UpdateProductDto,
} from './dto/catalog.dto';

@ApiTags('Restaurant - catalogue')
@Controller({ path: 'merchant', version: '1' })
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Post('menus')
  @RequirePermissions(PERMISSIONS.CATALOG_MENU_WRITE)
  @Idempotent({ scope: 'merchant.menus.create' })
  @ApiOperation({ summary: 'Creer un menu' })
  async createMenu(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() dto: CreateMenuDto,
    @Req() request: AppRequest,
  ): Promise<{ menuId: string }> {
    return this.catalog.createMenu(actor, dto, { requestId: request.requestId });
  }

  @Post('menu-categories')
  @RequirePermissions(PERMISSIONS.CATALOG_MENU_WRITE)
  @ApiOperation({ summary: 'Creer une categorie de menu' })
  async createCategory(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() dto: CreateCategoryDto,
  ): Promise<{ categoryId: string }> {
    return this.catalog.createCategory(actor, dto);
  }

  @Patch('menus/:id/status')
  @RequirePermissions(PERMISSIONS.CATALOG_PUBLISH)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Publier ou archiver un menu' })
  async publishMenu(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) menuId: string,
    @Body() dto: PublishDto,
    @Req() request: AppRequest,
  ): Promise<void> {
    await this.catalog.publishMenu(actor, menuId, dto.status, { requestId: request.requestId });
  }

  @Post('products')
  @RequirePermissions(PERMISSIONS.CATALOG_PRODUCT_WRITE)
  @Idempotent({ scope: 'merchant.products.create' })
  @ApiOperation({ summary: 'Creer un plat' })
  async createProduct(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() dto: CreateProductDto,
    @Req() request: AppRequest,
  ): Promise<{ productId: string }> {
    return this.catalog.createProduct(actor, dto, { requestId: request.requestId });
  }

  @Get('products')
  @RequirePermissions(PERMISSIONS.CATALOG_READ)
  @ApiOperation({ summary: 'Lister les plats d\'un etablissement' })
  async listProducts(
    @CurrentActor() actor: AuthenticatedActor,
    @Query('establishmentId', ParseUUIDPipe) establishmentId: string,
  ): Promise<MerchantProductView[]> {
    return this.catalog.listMerchantProducts(actor, establishmentId);
  }

  @Patch('products/:id')
  @RequirePermissions(PERMISSIONS.CATALOG_PRODUCT_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Modifier un plat' })
  async updateProduct(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateProductDto,
    @Req() request: AppRequest,
  ): Promise<void> {
    await this.catalog.updateProduct(actor, productId, dto, { requestId: request.requestId });
  }

  @Patch('products/:id/price')
  @RequirePermissions(PERMISSIONS.CATALOG_PRICE_WRITE)
  @ApiOperation({
    summary: 'Changer le prix d\'un plat',
    description:
      "L'ancien prix est conserve dans un historique append-only. Les commandes deja passees conservent le prix qui leur a ete applique.",
  })
  async changePrice(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) productId: string,
    @Body() dto: ChangeProductPriceDto,
    @Req() request: AppRequest,
  ): Promise<{ price: { amount: string; currency: string; formatted: string } }> {
    return this.catalog.changeProductPrice(actor, productId, dto, { requestId: request.requestId });
  }

  @Patch('products/:id/availability')
  @RequirePermissions(PERMISSIONS.CATALOG_AVAILABILITY_WRITE)
  @ApiOperation({
    summary: 'Declarer une disponibilite ou une rupture',
    description:
      "Supporte la synchronisation hors ligne : une ecriture plus ancienne que l'etat courant est ignoree et signalee par applied=false.",
  })
  async setAvailability(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) productId: string,
    @Body() dto: SetAvailabilityDto,
    @Req() request: AppRequest,
  ): Promise<{ applied: boolean; status: string }> {
    return this.catalog.setAvailability(actor, productId, dto, { requestId: request.requestId });
  }

  @Patch('products/:id/status')
  @RequirePermissions(PERMISSIONS.CATALOG_PUBLISH)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Publier ou archiver un plat' })
  async setProductStatus(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) productId: string,
    @Body() dto: PublishDto,
  ): Promise<void> {
    await this.catalog.setProductStatus(actor, productId, dto.status);
  }
}
