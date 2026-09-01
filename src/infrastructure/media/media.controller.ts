import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentActor, PublicRoute, RequirePermissions } from '../../common/auth/auth.decorators';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { PERMISSIONS } from '../../common/auth/permissions';
import { MediaService, type UploadedImage } from './media.service';

const imageInterceptor = FileInterceptor('image', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

@Controller({ path: 'media', version: '1' })
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get(':key')
  @PublicRoute()
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async image(
    @Param('key') key: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.media.read(key);
    // Public images are embedded by web clients hosted on other origins.
    // Override Helmet only here; keep its default policy on all other routes.
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.type(file.contentType);
    return new StreamableFile(file.bytes);
  }

  @Post('avatar')
  @UseInterceptors(imageInterceptor)
  async avatar(@CurrentActor() actor: AuthenticatedActor, @UploadedFile() file: UploadedImage) {
    return this.media.setAvatar(actor, file);
  }

  @Post('establishments/:id/cover')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_WRITE)
  @UseInterceptors(imageInterceptor)
  async cover(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedImage,
  ) {
    return this.media.setEstablishmentCover(actor, id, file);
  }

  @Post('products/:id/image')
  @RequirePermissions(PERMISSIONS.CATALOG_PRODUCT_WRITE)
  @UseInterceptors(imageInterceptor)
  async product(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedImage,
  ) {
    return this.media.setProductImage(actor, id, file);
  }
}
