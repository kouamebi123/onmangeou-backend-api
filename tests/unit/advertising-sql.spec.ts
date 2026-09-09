import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { AdvertisingService, validCampaignDates } from '../../src/domains/commerce/advertising';
import { Clock } from '../../src/common/time/clock';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import type { TenantScopeService } from '../../src/common/auth/tenant-scope.service';
import type { EntitlementsService } from '../../src/domains/entitlements/entitlements.service';

describe('publicité : comptage PostgreSQL', () => {
  const db = new PGlite();
  const statement = (parts: TemplateStringsArray) =>
    parts.reduce((sql, part, i) => sql + (i ? `$${i}` : '') + part, '');
  const adapter = {
    $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (await db.query(statement(parts), values)).rows,
    $executeRaw: async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (await db.query(statement(parts), values)).affectedRows,
  };
  const prisma = {
    ...adapter,
    $transaction: async (fn: (tx: typeof adapter) => Promise<unknown>) => {
      await db.exec('BEGIN');
      try {
        const result = await fn(adapter);
        await db.exec('COMMIT');
        return result;
      } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as PrismaService;
  const service = new AdvertisingService(
    prisma,
    {} as TenantScopeService,
    {} as EntitlementsService,
    new Clock(),
  );
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  beforeAll(async () => {
    await db.exec('CREATE TABLE establishments(id uuid PRIMARY KEY, status text, deleted_at timestamptz);');
    await db.exec(readFileSync('prisma/migrations/20260908030000_advertising/migration.sql', 'utf8'));
    await db.query('INSERT INTO establishments VALUES($1, $2, NULL)', [id(1), 'PUBLISHED']);
    await db.query(
      "INSERT INTO ad_campaigns(id,establishment_id,title,starts_at,ends_at,status) VALUES($1,$2,'Campagne',now()-interval '1 hour',now()+interval '1 day','APPROVED')",
      [id(2), id(1)],
    );
    await db.query("INSERT INTO ad_views(id,campaign_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [
      id(3),
      id(2),
    ]);
  }, 30000);
  afterAll(async () => {
    await db.close();
  });
  it('refuse un clic avant affichage puis ne compte chaque événement qu’une fois', async () => {
    await expect(service.track(id(3), 'CLICK')).rejects.toMatchObject({ code: 'CONFLICT' });
    await service.track(id(3), 'IMPRESSION');
    await service.track(id(3), 'IMPRESSION');
    await service.track(id(3), 'CLICK');
    await service.track(id(3), 'CLICK');
    const rows = await db.query<{ impressions: number; clicks: number }>(
      'SELECT impressions::int,clicks::int FROM ad_campaigns',
    );
    expect(rows.rows[0]).toEqual({ impressions: 1, clicks: 1 });
  });
  it('refuse le comptage après suspension', async () => {
    await db.exec("UPDATE ad_campaigns SET status='PAUSED'");
    await expect(service.track(id(3), 'IMPRESSION')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('refuse les périodes invalides, expirées ou excessives', () => {
    const now = new Date('2026-09-08T00:00:00Z');
    expect(validCampaignDates(now, new Date('2026-09-09'), now)).toBe(true);
    expect(validCampaignDates(now, now, now)).toBe(false);
    expect(validCampaignDates(now, new Date('2027-09-09'), now)).toBe(false);
  });
});
