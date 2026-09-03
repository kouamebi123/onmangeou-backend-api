import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { PushService } from '../../src/infrastructure/notifications/push.service';

// PostgreSQL in WASM: exercise the actual migration/triggers without Docker.
// This is an isolated, in-memory database, never the application database.
describe('push queue PostgreSQL triggers', () => {
  const db = new PGlite();
  const statement = (parts: TemplateStringsArray) =>
    parts.reduce((sql, part, index) => sql + (index ? `$${index}` : '') + part, '');
  const prisma = {
    $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (await db.query(statement(parts), values)).rows,
    $executeRaw: async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (await db.query(statement(parts), values)).affectedRows,
  } as unknown as PrismaService;
  const sender = new PushService(prisma, new ConfigService());
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const count = async (table: string) =>
    (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]?.n;
  beforeAll(async () => {
    await db.exec(`
      CREATE TABLE users(id uuid PRIMARY KEY);
      CREATE TABLE devices(id uuid PRIMARY KEY, user_id uuid);
      CREATE TABLE sessions(device_id uuid,user_id uuid,revoked_at timestamptz,expires_at timestamptz);
      CREATE TABLE organizations(id uuid PRIMARY KEY);
      CREATE TABLE reviews(id uuid PRIMARY KEY);
      CREATE TABLE notifications(id uuid PRIMARY KEY,user_id uuid,title varchar(160),body varchar(500),kind varchar(40),created_at timestamptz DEFAULT now());
      CREATE TABLE consents(id uuid PRIMARY KEY,user_id uuid,type text,granted boolean,revoked_at timestamptz,granted_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now());
      CREATE TABLE orders(id uuid PRIMARY KEY,customer_user_id uuid,organization_id uuid,establishment_id uuid,status text);
      CREATE TABLE reservations(id uuid PRIMARY KEY,user_id uuid,organization_id uuid,establishment_id uuid,status text);
      CREATE TABLE organization_members(id uuid PRIMARY KEY,user_id uuid,organization_id uuid,role_id uuid,status text,revoked_at timestamptz);
      CREATE TABLE member_establishments(member_id uuid,establishment_id uuid);
      CREATE TABLE permissions(id uuid PRIMARY KEY,code text);
      CREATE TABLE role_permissions(role_id uuid,permission_id uuid);
    `);
    await db.exec(readFileSync('prisma/migrations/20260903010000_review_media_push/migration.sql', 'utf8'));
  }, 30000);
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.exec('BEGIN');
    await db.exec(`
      INSERT INTO users VALUES('${id(1)}'),('${id(2)}'),('${id(3)}');
      INSERT INTO devices VALUES('${id(11)}','${id(1)}'),('${id(12)}','${id(2)}');
      INSERT INTO sessions VALUES('${id(11)}','${id(1)}',NULL,now()+interval '1 day'),('${id(12)}','${id(2)}',NULL,now()+interval '1 day');
      INSERT INTO organizations VALUES('${id(20)}');
      INSERT INTO permissions VALUES('${id(21)}','orders.read');
      INSERT INTO role_permissions VALUES('${id(22)}','${id(21)}');
      INSERT INTO organization_members VALUES('${id(23)}','${id(2)}','${id(20)}','${id(22)}','ACTIVE',NULL),('${id(24)}','${id(3)}','${id(20)}','${id(22)}','ACTIVE',NULL);
      INSERT INTO member_establishments VALUES('${id(23)}','${id(30)}');
      INSERT INTO push_subscriptions(id,device_id,user_id,application,organization_id,token) VALUES
        ('${id(41)}','${id(11)}','${id(1)}','CLIENT',NULL,'ExpoPushToken[client]'),
        ('${id(42)}','${id(12)}','${id(2)}','MERCHANT','${id(20)}','ExpoPushToken[merchant]');
    `);
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.exec('ROLLBACK');
  });
  it('runs the actual claim/send/receipt SQL with typed UUID parameters', async () => {
    await db.exec(
      `INSERT INTO orders VALUES('${id(50)}','${id(1)}','${id(20)}','${id(30)}','PENDING_RESTAURANT')`,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ data: { status: 'ok', id: 'ticket' } })))),
    );
    await sender.tick();
    expect((await db.query('SELECT DISTINCT status FROM push_deliveries')).rows).toEqual([
      { status: 'CHECKING' },
    ]);
    await db.exec("UPDATE push_deliveries SET next_attempt_at=now()-interval '1 second'");
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ data: { ticket: { status: 'ok' } } })))),
    );
    await sender.tick();
    expect((await db.query('SELECT DISTINCT status FROM push_deliveries')).rows).toEqual([
      { status: 'DELIVERED' },
    ]);
  });
  it('cancels queued messages if the session or restaurant access was revoked', async () => {
    await db.exec(`INSERT INTO orders VALUES('${id(50)}','${id(1)}','${id(20)}','${id(30)}','PENDING_RESTAURANT');
      UPDATE sessions SET revoked_at=now() WHERE user_id='${id(1)}';
      DELETE FROM role_permissions;`);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await sender.tick();
    expect(fetch).not.toHaveBeenCalled();
    expect((await db.query('SELECT DISTINCT status FROM push_deliveries')).rows).toEqual([
      { status: 'CANCELLED' },
    ]);
  });
  it('queues a new order for its customer and assigned merchant only', async () => {
    await db.exec(
      `INSERT INTO orders VALUES('${id(50)}','${id(1)}','${id(20)}','${id(30)}','PENDING_RESTAURANT')`,
    );
    expect(await count('notifications')).toBe(2);
    expect(await count('push_deliveries')).toBe(2);
    expect((await db.query('SELECT DISTINCT user_id FROM notifications ORDER BY user_id')).rows).toEqual([
      { user_id: id(1) },
      { user_id: id(2) },
    ]);
    await db.exec(`UPDATE orders SET status='PENDING_RESTAURANT' WHERE id='${id(50)}'`);
    expect(await count('push_deliveries')).toBe(2);
    await db.exec(`UPDATE orders SET status='ACCEPTED' WHERE id='${id(50)}'`);
    expect(await count('push_deliveries')).toBe(4);
  });
  it('notifies the customer but not the merchant for an unpaid order', async () => {
    await db.exec(
      `INSERT INTO orders VALUES('${id(50)}','${id(1)}','${id(20)}','${id(30)}','PENDING_PAYMENT')`,
    );
    expect((await db.query('SELECT audience FROM notifications')).rows).toEqual([{ audience: 'CLIENT' }]);
  });
  it('uses reservation user_id and rechecks merchant permissions', async () => {
    await db.exec('DELETE FROM role_permissions');
    await db.exec(
      `INSERT INTO reservations VALUES('${id(50)}','${id(1)}','${id(20)}','${id(30)}','PENDING')`,
    );
    expect((await db.query('SELECT kind,user_id FROM notifications')).rows).toEqual([
      { kind: 'RESERVATION', user_id: id(1) },
    ]);
  });
  it('honours opt-out and latest marketing consent, not an old acceptance', async () => {
    await db.exec(`UPDATE push_subscriptions SET enabled=false WHERE user_id='${id(2)}';
      INSERT INTO orders VALUES('${id(50)}','${id(1)}','${id(20)}','${id(30)}','PENDING_RESTAURANT');
      INSERT INTO consents(id,user_id,type,granted,granted_at) VALUES
        ('${id(61)}','${id(1)}','MARKETING',true,now()-interval '1 day'),
        ('${id(62)}','${id(1)}','MARKETING',false,now());
      INSERT INTO notifications(id,user_id,title,body,kind) VALUES('${id(70)}','${id(1)}','Promo','Promo','PROMOTION');`);
    expect(await count('push_deliveries')).toBe(1);
    await db.exec(`INSERT INTO consents(id,user_id,type,granted,granted_at) VALUES('${id(63)}','${id(1)}','MARKETING',true,now()+interval '1 second');
      INSERT INTO notifications(id,user_id,title,body,kind) VALUES('${id(71)}','${id(1)}','Promo','Promo','PROMOTION');`);
    expect(await count('push_deliveries')).toBe(2);
  });
  it('rolls notifications back if the commerce transaction is rolled back', async () => {
    await db.exec(
      `SAVEPOINT order_write; INSERT INTO orders VALUES('${id(50)}','${id(1)}','${id(20)}','${id(30)}','PENDING_RESTAURANT'); ROLLBACK TO SAVEPOINT order_write;`,
    );
    expect(await count('push_deliveries')).toBe(0);
    expect(await count('notifications')).toBe(0);
  });
  it('prevents duplicate reports and cascades removed review photos', async () => {
    await db.exec(`INSERT INTO reviews VALUES('${id(80)}');
      INSERT INTO review_reports(id,review_id,reporter_user_id,reason) VALUES('${id(81)}','${id(80)}','${id(1)}','SPAM');
      INSERT INTO review_reports(id,review_id,reporter_user_id,reason) VALUES('${id(82)}','${id(80)}','${id(1)}','OTHER') ON CONFLICT(review_id,reporter_user_id) DO NOTHING;
      INSERT INTO review_photos(id,review_id,storage_key) VALUES('${id(83)}','${id(80)}','test.webp');`);
    expect(await count('review_reports')).toBe(1);
    await db.exec(`DELETE FROM reviews WHERE id='${id(80)}'`);
    expect(await count('review_photos')).toBe(0);
  });
});
