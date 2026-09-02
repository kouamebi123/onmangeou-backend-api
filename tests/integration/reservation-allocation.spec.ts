import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { availableTableQuery } from '../../src/domains/commerce/reservation-allocation';

// Temporary tables isolate these SQL regressions from application records.
describe('reservation allocation PostgreSQL parameters', () => {
  const client = new Client({ connectionString: process.env['DATABASE_URL'] });
  const establishment = '00000000-0000-4000-8000-000000000001';
  const table = '00000000-0000-4000-8000-000000000002';
  const reservation = '00000000-0000-4000-8000-000000000003';
  const current = { starts_at: new Date('2026-10-10T12:00:00Z'), party_size: 2, table_id: null };
  const query = availableTableQuery(establishment, reservation, current, 'CONFIRMED');

  beforeAll(async () => {
    await client.connect();
    await client.query(`CREATE TEMP TABLE dining_tables (id uuid, establishment_id uuid, seats int, name text);
      CREATE TEMP TABLE reservations (id uuid, establishment_id uuid, table_id uuid, starts_at timestamptz, status text);`);
  });
  afterAll(async () => {
    await client.end();
  });
  beforeEach(async () => {
    await client.query('TRUNCATE pg_temp.dining_tables, pg_temp.reservations');
    await client.query('INSERT INTO pg_temp.dining_tables VALUES ($1,$2,4,$3)', [
      table,
      establishment,
      'Table 1',
    ]);
  });
  it('accepts timestamp parameters without the interval inference error', async () => {
    expect((await client.query(query.text, query.values)).rows).toEqual([{ id: table }]);
  });
  it('rejects overlapping confirmed bookings', async () => {
    await client.query(
      `INSERT INTO pg_temp.reservations VALUES (gen_random_uuid(),$1,$2,'2026-10-10T13:00:00Z','CONFIRMED')`,
      [establishment, table],
    );
    expect((await client.query(query.text, query.values)).rows).toEqual([]);
  });
  it('allows adjacent bookings at the two-hour boundary', async () => {
    await client.query(
      `INSERT INTO pg_temp.reservations VALUES (gen_random_uuid(),$1,$2,'2026-10-10T14:00:00Z','CONFIRMED')`,
      [establishment, table],
    );
    expect((await client.query(query.text, query.values)).rows).toEqual([{ id: table }]);
  });
  it('does not seat a second party at an occupied table', async () => {
    await client.query(
      `INSERT INTO pg_temp.reservations VALUES (gen_random_uuid(),$1,$2,'2026-10-10T08:00:00Z','SEATED')`,
      [establishment, table],
    );
    const seated = availableTableQuery(establishment, reservation, current, 'SEATED');
    expect((await client.query(seated.text, seated.values)).rows).toEqual([]);
  });
});
