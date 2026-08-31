import { Module } from '@nestjs/common';
import { TenantScopeService } from '../../common/auth/tenant-scope.service';
import { LocalMediaStorage } from './local-media.storage';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MEDIA_STORAGE } from './media-storage.port';

@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    TenantScopeService,
    LocalMediaStorage,
    { provide: MEDIA_STORAGE, useExisting: LocalMediaStorage },
  ],
})
export class MediaModule {}
