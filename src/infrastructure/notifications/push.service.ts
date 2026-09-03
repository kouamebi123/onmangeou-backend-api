import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { notFound, validationFailed } from '../../common/errors/domain.error';
import { PrismaService } from '../prisma/prisma.service';
import { expoCall, PushProviderError, readTicket, retryDelay, validExpoToken } from './expo-push';

interface Delivery {
  id: string;
  attempts: number;
  ticket_id: string | null;
  sent_token: string | null;
}
@Injectable()
export class PushService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private readonly logger = new Logger(PushService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}
  onApplicationBootstrap() {
    if (String(this.config.get('PUSH_ENABLED')) !== 'true') return;
    this.timer = setInterval(() => {
      void this.tick().catch(() => this.logger.error('Échec du traitement push'));
    }, 5000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async subscribe(actor: AuthenticatedActor, application: 'CLIENT' | 'MERCHANT', token: string) {
    if (!validExpoToken(token))
      throw validationFailed([
        { field: 'token', code: 'INVALID', message: 'Jeton de notification invalide.' },
      ]);
    if (application === 'MERCHANT' && (!actor.organizationId || !actor.permissions.has('orders.read')))
      throw notFound('Accès restaurant', 'push');
    const session = await this.prisma.session.findFirst({
      where: { id: actor.sessionId, userId: actor.userId, revokedAt: null },
      select: { deviceId: true },
    });
    if (!session?.deviceId) throw notFound('Appareil', 'push');
    await this.prisma.$transaction(async (tx) => {
      // A token must never target two accounts/installations concurrently.
      await tx.$executeRaw`DELETE FROM push_subscriptions WHERE token=${token} AND (device_id<>${session.deviceId}::uuid OR application<>${application})`;
      await tx.$executeRaw`INSERT INTO push_subscriptions(id,device_id,user_id,application,organization_id,token)
        VALUES(${randomUUID()}::uuid,${session.deviceId}::uuid,${actor.userId}::uuid,${application},${application === 'MERCHANT' ? actor.organizationId : null}::uuid,${token})
        ON CONFLICT(device_id,application) DO UPDATE SET user_id=EXCLUDED.user_id,organization_id=EXCLUDED.organization_id,token=EXCLUDED.token,enabled=true,updated_at=now()`;
    });
    return { registered: true };
  }
  async unsubscribe(actor: AuthenticatedActor) {
    await this.prisma
      .$executeRaw`UPDATE push_subscriptions p SET enabled=false,updated_at=now() FROM sessions s WHERE s.id=${actor.sessionId}::uuid AND p.device_id=s.device_id AND p.user_id=${actor.userId}::uuid`;
    return { registered: false };
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const jobs = await this.prisma.$queryRaw<Delivery[]>`
        WITH due AS (SELECT id FROM push_deliveries WHERE status IN ('PENDING','CHECKING','PROCESSING') AND next_attempt_at<=now() ORDER BY next_attempt_at LIMIT 20 FOR UPDATE SKIP LOCKED)
        UPDATE push_deliveries d SET status='PROCESSING',next_attempt_at=now()+interval '10 minutes',attempts=attempts+1,updated_at=now()
        FROM due WHERE d.id=due.id RETURNING d.id,d.attempts,d.ticket_id,d.sent_token`;
      for (const job of jobs) await this.deliver(job);
    } finally {
      this.busy = false;
    }
  }
  async deliver(job: Delivery) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        token: string;
        subscription_id: string;
        kind: string;
        audience: string;
        target_id: string | null;
      }>
    >`
      SELECT s.token,s.id AS subscription_id,n.kind,n.audience,n.target_id FROM push_deliveries d
      JOIN push_subscriptions s ON s.id=d.subscription_id JOIN notifications n ON n.id=d.notification_id
      JOIN devices device ON device.id=s.device_id AND device.user_id=s.user_id
      WHERE d.id=${job.id}::uuid AND s.enabled AND s.user_id=n.user_id AND s.application=n.audience
      AND n.created_at>now()-interval '24 hours'
      AND EXISTS(SELECT 1 FROM sessions sess WHERE sess.device_id=s.device_id AND sess.user_id=s.user_id AND sess.revoked_at IS NULL AND sess.expires_at>now())
      AND (n.audience='CLIENT' OR (s.organization_id=n.organization_id AND EXISTS(SELECT 1 FROM organization_members m JOIN member_establishments me ON me.member_id=m.id
        WHERE m.user_id=s.user_id AND m.organization_id=s.organization_id AND m.status='ACTIVE' AND m.revoked_at IS NULL AND me.establishment_id=n.establishment_id
        AND EXISTS(SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=m.role_id AND p.code='orders.read'))))
      AND (n.kind NOT IN ('EVENT','PROMOTION','MARKETING') OR COALESCE((SELECT c.granted AND c.revoked_at IS NULL FROM consents c WHERE c.user_id=s.user_id AND c.type='MARKETING' ORDER BY c.granted_at DESC,c.created_at DESC,c.id DESC LIMIT 1),false))`;
    const item = rows[0];
    if (!item) {
      await this.finish(job.id, 'CANCELLED');
      return;
    }
    try {
      if (job.ticket_id) {
        const result = await expoCall(
          'getReceipts',
          { ids: [job.ticket_id] },
          this.config.get<string>('EXPO_PUSH_ACCESS_TOKEN'),
        );
        const receipt =
          result && typeof result === 'object'
            ? (result as Record<string, unknown>)[job.ticket_id]
            : undefined;
        if (!receipt) {
          await this.finish(job.id, job.attempts >= 12 ? 'FAILED' : 'CHECKING', 'RECEIPT_PENDING', 300);
          return;
        }
        const parsed = readTicket(receipt);
        if (parsed.status === 'ok') {
          await this.finish(job.id, 'DELIVERED');
          return;
        }
        throw new PushProviderError(parsed.details?.error ?? 'PROVIDER_ERROR', false);
      }
      const payload = {
        to: item.token,
        title: item.audience === 'MERCHANT' ? 'OnMangeOù Restaurant' : 'OnMangeOù',
        body: 'Une mise à jour vous attend dans l’application.',
        sound: 'default',
        channelId: 'commerce',
        data: { kind: item.kind, targetId: item.target_id },
        ttl: 3600,
      };
      const raw = await expoCall('send', payload, this.config.get<string>('EXPO_PUSH_ACCESS_TOKEN'));
      const ticket = readTicket(Array.isArray(raw) ? raw[0] : raw);
      if (ticket.status === 'error')
        throw new PushProviderError(
          ticket.details?.error ?? 'PROVIDER_ERROR',
          ticket.details?.error === 'MessageRateExceeded',
        );
      if (!ticket.id) throw new PushProviderError('INVALID_TICKET', true);
      await this.prisma
        .$executeRaw`UPDATE push_deliveries SET status='CHECKING',ticket_id=${ticket.id},sent_token=${item.token},next_attempt_at=now()+interval '15 minutes',updated_at=now() WHERE id=${job.id}::uuid`;
    } catch (error) {
      const known = error instanceof PushProviderError ? error : new PushProviderError('INTERNAL', true);
      if (known.code === 'DeviceNotRegistered')
        await this.prisma
          .$executeRaw`UPDATE push_subscriptions SET enabled=false WHERE id=${item.subscription_id}::uuid AND token=${job.sent_token ?? item.token}`;
      await this.finish(
        job.id,
        known.retryable && job.attempts < 8 ? (job.ticket_id ? 'CHECKING' : 'PENDING') : 'FAILED',
        known.code,
        retryDelay(job.attempts),
      );
    }
  }
  private async finish(id: string, status: string, error: string | null = null, delay = 0) {
    await this.prisma
      .$executeRaw`UPDATE push_deliveries SET status=${status},error_code=${error},next_attempt_at=now()+(${delay}::int*interval '1 second'),updated_at=now() WHERE id=${id}::uuid`;
  }
}
