import { Body, Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentActor, RequirePermissions } from '../../common/auth/auth.decorators';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { PERMISSIONS } from '../../common/auth/permissions';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import { CompletionService, type LedgerKind } from './completion.service';
import { SettlementDto, EventWriteDto, EstablishmentPageDto } from './completion.dto';
enum Kind {
  credits = 'credits',
  debts = 'debts',
}
@Controller({ version: '1', path: 'merchant' })
export class CompletionController {
  constructor(private readonly service: CompletionService) {}
  @Get('ledgers/:kind')
  @RequirePermissions(PERMISSIONS.EXPENSES_CREATE)
  ledger(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('kind', new ParseEnumPipe(Kind)) kind: LedgerKind,
    @Query() query: EstablishmentPageDto,
  ) {
    return this.service.ledger(actor, kind, query.establishmentId, query.offset);
  }
  @Get('ledgers/:kind/:id/settlements')
  @RequirePermissions(PERMISSIONS.EXPENSES_CREATE)
  history(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('kind', new ParseEnumPipe(Kind)) kind: LedgerKind,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.history(actor, kind, id);
  }
  @Post('ledgers/:kind/:id/settlements')
  @RequirePermissions(PERMISSIONS.EXPENSES_CREATE)
  @Idempotent({ scope: 'ledger.settle' })
  settle(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('kind', new ParseEnumPipe(Kind)) kind: LedgerKind,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SettlementDto,
  ) {
    return this.service.settle(actor, kind, id, body);
  }
  @Get('event-management')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_WRITE)
  events(@CurrentActor() actor: AuthenticatedActor, @Query() query: EstablishmentPageDto) {
    return this.service.events(actor, query.establishmentId, query.offset);
  }
  @Post('event-management')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_WRITE)
  @Idempotent({ scope: 'event.create' })
  createEvent(@CurrentActor() actor: AuthenticatedActor, @Body() dto: EventWriteDto) {
    return this.service.saveEvent(actor, dto);
  }
  @Put('event-management/:id')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_WRITE)
  updateEvent(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EventWriteDto,
  ) {
    return this.service.saveEvent(actor, dto, id);
  }
  @Post('event-management/:id/cancel')
  @RequirePermissions(PERMISSIONS.ESTABLISHMENT_WRITE)
  cancelEvent(@CurrentActor() actor: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancelEvent(actor, id);
  }
}
