import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/time/clock';
import type { Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Outbox transactionnelle (specification sections 4.1 et 11.1).
 *
 * L'evenement est ecrit dans la meme transaction que le changement metier, puis
 * publie par un worker. Sans ce motif, une panne entre la validation en base et
 * la publication produirait soit un evenement sans fait, soit un fait sans
 * evenement : la notification client et l'etat de la commande divergeraient.
 */

export const OUTBOX_EVENTS = {
  USER_REGISTERED: 'identity.user.registered',
  USER_LOGGED_IN: 'identity.user.logged_in',
  ORGANIZATION_CREATED: 'organizations.organization.created',
  ESTABLISHMENT_CREATED: 'organizations.establishment.created',
  ESTABLISHMENT_PUBLISHED: 'organizations.establishment.published',
  VERIFICATION_SUBMITTED: 'organizations.verification.submitted',
  MENU_PUBLISHED: 'catalog.menu.published',
  PRODUCT_AVAILABILITY_CHANGED: 'catalog.product.availability_changed',
} as const;

export type OutboxEventType = (typeof OUTBOX_EVENTS)[keyof typeof OUTBOX_EVENTS];

export interface OutboxEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: OutboxEventType;
  eventVersion?: number;
  payload: Record<string, unknown>;
}

type PrismaLike = Pick<PrismaService, 'outboxEvent'>;

@Injectable()
export class OutboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async enqueue(input: OutboxEventInput, tx?: PrismaLike): Promise<void> {
    const client = tx ?? this.prisma;

    await client.outboxEvent.create({
      data: {
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        eventVersion: input.eventVersion ?? 1,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Reserve un lot d'evenements a publier.
   *
   * `FOR UPDATE SKIP LOCKED` permet a plusieurs workers de consommer la meme
   * table sans se bloquer ni traiter deux fois le meme evenement.
   */
  async claimBatch(batchSize: number): Promise<
    Array<{
      id: string;
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      eventVersion: number;
      payload: unknown;
      attempts: number;
    }>
  > {
    return this.prisma.$queryRaw`
      WITH claimed AS (
        SELECT id
        FROM outbox_events
        WHERE status = 'PENDING' AND available_at <= now()
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${batchSize}
      )
      UPDATE outbox_events AS o
      SET status = 'PROCESSING', updated_at = now()
      FROM claimed
      WHERE o.id = claimed.id
      RETURNING o.id, o.aggregate_type AS "aggregateType", o.aggregate_id AS "aggregateId",
                o.event_type AS "eventType", o.event_version AS "eventVersion",
                o.payload, o.attempts
    `;
  }

  async markProcessed(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { status: 'PROCESSED', publishedAt: this.clock.now() },
    });
  }

  /**
   * Replanifie un evenement avec un recul exponentiel plafonne.
   *
   * Au-dela de huit tentatives, l'evenement est marque en echec definitif :
   * il alimente alors la file manuelle plutot que de boucler indefiniment
   * (specification section 25.2).
   */
  async markFailed(id: string, attempts: number, error: string): Promise<void> {
    const nextAttempt = attempts + 1;
    const exhausted = nextAttempt >= 8;
    const backoffSeconds = Math.min(2 ** nextAttempt, 900);

    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: exhausted ? 'FAILED' : 'PENDING',
        attempts: nextAttempt,
        lastError: error.slice(0, 1000),
        availableAt: this.clock.plusSeconds(backoffSeconds),
      },
    });
  }

  /** Nombre d'evenements en attente, expose comme metrique de saturation. */
  async pendingCount(): Promise<number> {
    return this.prisma.outboxEvent.count({ where: { status: 'PENDING' } });
  }
}
