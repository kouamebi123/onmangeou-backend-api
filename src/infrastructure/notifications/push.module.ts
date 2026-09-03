import { Body, Controller, Delete, Module, Post } from '@nestjs/common';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { CurrentActor } from '../../common/auth/auth.decorators';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { PushService } from './push.service';
export class SubscribePushDto {
  @IsIn(['CLIENT', 'MERCHANT']) application!: 'CLIENT' | 'MERCHANT';
  @IsString() @MaxLength(512) token!: string;
}
@Controller({ path: 'me/push-subscription', version: '1' })
@RateLimit({ name: 'push-subscription', rules: [{ dimension: 'user', limit: 60, windowSeconds: 3600 }] })
export class PushController {
  constructor(private readonly push: PushService) {}
  @Post() subscribe(@CurrentActor() actor: AuthenticatedActor, @Body() dto: SubscribePushDto) {
    return this.push.subscribe(actor, dto.application, dto.token);
  }
  @Delete() unsubscribe(@CurrentActor() actor: AuthenticatedActor) {
    return this.push.unsubscribe(actor);
  }
}
@Module({ controllers: [PushController], providers: [PushService] })
export class PushModule {}
