import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../infrastructure/prisma/generated/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TenantScopeService } from '../../common/auth/tenant-scope.service';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { Clock } from '../../common/time/clock';
import { DomainError, notFound } from '../../common/errors/domain.error';
import { toMoneyView } from '../../common/money/money';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { MODULE_CODES, type ModuleCode } from '../entitlements/module-codes';
import type { SettlementDto, EventWriteDto } from './completion.dto';
import { remainingBalance, validateEventPeriod } from './completion-rules';

export type LedgerKind = 'credits' | 'debts';
const ledgerTable = (kind: LedgerKind) =>
  kind === 'credits' ? Prisma.sql`customer_credits` : Prisma.sql`supplier_debts`;
const ledgerForeignKey = (kind: LedgerKind) =>
  kind === 'credits' ? Prisma.sql`credit_id` : Prisma.sql`debt_id`;
interface LedgerRow {
  id: string;
  name: string;
  amount: bigint;
  paid: bigint;
  due_at: Date | null;
  created_at: Date;
}
@Injectable()
export class CompletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantScopeService,
    private readonly entitlements: EntitlementsService,
    private readonly clock: Clock,
  ) {}
  private async scope(actor: AuthenticatedActor, id: string, module: ModuleCode) {
    const scope = await this.tenant.assertEstablishmentInScope(actor, id);
    await this.entitlements.assertModuleEnabled(scope.organizationId, module, id);
  }
  async ledger(actor: AuthenticatedActor, kind: LedgerKind, establishmentId: string, offset: number) {
    await this.scope(actor, establishmentId, MODULE_CODES.FINANCE_CREDITS);
    const name = kind === 'credits' ? Prisma.sql`customer_name` : Prisma.sql`supplier_name`;
    const rows = await this.prisma.$queryRaw<LedgerRow[]>(Prisma.sql`
   SELECT l.id,l.${name} AS name,l.amount,l.due_at,l.created_at,
     COALESCE((SELECT SUM(s.amount) FROM ledger_settlements s WHERE s.${ledgerForeignKey(kind)}=l.id),0)::bigint AS paid
   FROM ${ledgerTable(kind)} l WHERE l.establishment_id=${establishmentId}::uuid
   ORDER BY l.created_at DESC,l.id DESC LIMIT 51 OFFSET ${offset}`);
    return {
      items: rows.slice(0, 50).map((r) => ({
        id: r.id,
        name: r.name,
        amount: toMoneyView(r.amount),
        paid: toMoneyView(r.paid),
        remaining: toMoneyView(r.amount - r.paid),
        dueAt: r.due_at,
        createdAt: r.created_at,
        settled: r.amount === r.paid,
      })),
      nextOffset: rows.length > 50 ? offset + 50 : null,
    };
  }
  private async ledgerScope(actor: AuthenticatedActor, kind: LedgerKind, id: string) {
    const rows = await this.prisma.$queryRaw<Array<{ establishment_id: string }>>(
      Prisma.sql`SELECT establishment_id FROM ${ledgerTable(kind)} WHERE id=${id}::uuid`,
    );
    if (!rows[0]) throw notFound('Écriture', id);
    await this.scope(actor, rows[0].establishment_id, MODULE_CODES.FINANCE_CREDITS);
  }
  async history(actor: AuthenticatedActor, kind: LedgerKind, id: string) {
    await this.ledgerScope(actor, kind, id);
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; amount: bigint; reference: string; created_at: Date }>
    >(Prisma.sql`
   SELECT id,amount,reference,created_at FROM ledger_settlements WHERE ${ledgerForeignKey(kind)}=${id}::uuid ORDER BY created_at DESC LIMIT 100`);
    return rows.map((r) => ({
      id: r.id,
      amount: toMoneyView(r.amount),
      reference: r.reference,
      createdAt: r.created_at,
    }));
  }
  async settle(actor: AuthenticatedActor, kind: LedgerKind, id: string, dto: SettlementDto) {
    await this.ledgerScope(actor, kind, id);
    if (dto.reference.trim().length < 2) throw new DomainError('VALIDATION_FAILED', 'Référence requise');
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ amount: bigint }>>(
        Prisma.sql`SELECT amount FROM ${ledgerTable(kind)} WHERE id=${id}::uuid FOR UPDATE`,
      );
      if (!rows[0]) throw notFound('Écriture', id);
      const sums = await tx.$queryRaw<Array<{ paid: bigint }>>(
        Prisma.sql`SELECT COALESCE(SUM(amount),0)::bigint AS paid FROM ledger_settlements WHERE ${ledgerForeignKey(kind)}=${id}::uuid`,
      );
      const payment = BigInt(dto.amount),
        paid = sums[0]?.paid ?? 0n;
      const remaining = remainingBalance(rows[0].amount, paid, payment),
        settlementId = randomUUID();
      await tx.$executeRaw(Prisma.sql`INSERT INTO ledger_settlements(id,${ledgerForeignKey(kind)},amount,reference,created_by)
    VALUES(${settlementId}::uuid,${id}::uuid,${payment},${dto.reference.trim()},${actor.userId}::uuid)`);
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: 'ledger.settle',
          resourceType: kind,
          resourceId: id,
          beforeState: { paid: paid.toString() },
          afterState: { paid: (paid + payment).toString(), settlementId },
        },
      });
      return { id: settlementId, remaining: toMoneyView(remaining) };
    });
  }
  async events(actor: AuthenticatedActor, establishmentId: string, offset: number) {
    await this.scope(actor, establishmentId, MODULE_CODES.MARKETING_PROMOTIONS);
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        body: string | null;
        starts_at: Date;
        ends_at: Date | null;
        cancelled_at: Date | null;
      }>
    >`
   SELECT id,title,body,starts_at,ends_at,cancelled_at FROM restaurant_events WHERE establishment_id=${establishmentId}::uuid
   ORDER BY starts_at DESC,id DESC LIMIT 51 OFFSET ${offset}`;
    const establishment = await this.prisma.establishment.findUniqueOrThrow({
      where: { id: establishmentId },
      select: { timezone: true },
    });
    return {
      items: rows.slice(0, 50),
      nextOffset: rows.length > 50 ? offset + 50 : null,
      timezone: establishment.timezone,
    };
  }
  async saveEvent(actor: AuthenticatedActor, dto: EventWriteDto, id?: string) {
    await this.scope(actor, dto.establishmentId, MODULE_CODES.MARKETING_PROMOTIONS);
    const start = new Date(dto.startsAt),
      end = new Date(dto.endsAt);
    validateEventPeriod(start, end, this.clock.now());
    if (dto.title.trim().length < 3) throw new DomainError('VALIDATION_FAILED', 'Titre trop court');
    const eventId = id ?? randomUUID();
    await this.prisma.$transaction(async (tx) => {
      if (id) {
        const updated =
          await tx.$executeRaw`UPDATE restaurant_events SET title=${dto.title.trim()},body=${dto.body?.trim() ?? null},
     starts_at=${start},ends_at=${end} WHERE id=${id}::uuid AND establishment_id=${dto.establishmentId}::uuid
     AND cancelled_at IS NULL AND starts_at>${this.clock.now()}`;
        if (!updated)
          throw new DomainError('CONFLICT', 'Événement non modifiable', {
            publicDetail: 'Cet événement est déjà commencé, annulé ou introuvable.',
          });
      } else {
        await tx.$executeRaw`INSERT INTO restaurant_events(id,establishment_id,title,body,starts_at,ends_at)
     VALUES(${eventId}::uuid,${dto.establishmentId}::uuid,${dto.title.trim()},${dto.body?.trim() ?? null},${start},${end})`;
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: id ? 'event.update' : 'event.create',
          resourceType: 'event',
          resourceId: eventId,
          afterState: { title: dto.title.trim(), startsAt: start.toISOString(), endsAt: end.toISOString() },
        },
      });
    });
    return { id: eventId };
  }
  async cancelEvent(actor: AuthenticatedActor, id: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{ establishment_id: string }>
    >`SELECT establishment_id FROM restaurant_events WHERE id=${id}::uuid`;
    if (!rows[0]) throw notFound('Événement', id);
    await this.scope(actor, rows[0].establishment_id, MODULE_CODES.MARKETING_PROMOTIONS);
    await this.prisma.$transaction(async (tx) => {
      const updated =
        await tx.$executeRaw`UPDATE restaurant_events SET cancelled_at=NOW() WHERE id=${id}::uuid AND cancelled_at IS NULL`;
      if (updated)
        await tx.auditLog.create({
          data: {
            actorUserId: actor.userId,
            action: 'event.cancel',
            resourceType: 'event',
            resourceId: id,
            afterState: { cancelled: true },
          },
        });
    });
    return { cancelled: true };
  }
}
