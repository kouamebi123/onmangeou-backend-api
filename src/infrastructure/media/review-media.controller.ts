import {
  Controller,
  Delete,
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
import { CurrentActor, PublicRoute } from '../../common/auth/auth.decorators';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import type { UploadedImage } from './media.service';
import { ReviewMediaService } from './review-media.service';

@Controller({ path: 'reviews/:reviewId/photos', version: '1' })
export class ReviewMediaController {
  constructor(private readonly photos: ReviewMediaService) {}
  @Post(':id')
  @RateLimit({ name: 'review-photo', rules: [{ dimension: 'user', limit: 20, windowSeconds: 3600 }] })
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } }))
  upload(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedImage,
  ) {
    return this.photos.add(actor, reviewId, id, file);
  }
  @Delete(':id')
  remove(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.photos.remove(actor, reviewId, id);
  }
  @Get(':id/file')
  @PublicRoute()
  @Header('Cache-Control', 'no-store')
  async read(
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const image = await this.photos.read(reviewId, id);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.type(image.contentType);
    return new StreamableFile(image.bytes);
  }
}
