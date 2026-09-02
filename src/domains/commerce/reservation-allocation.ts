import { Prisma } from '../../infrastructure/prisma/generated/client';

/** Explicit timestamptz casts prevent PostgreSQL inferring an interval for a date parameter. */
export function availableTableQuery(
  establishmentId: string,
  reservationId: string,
  current: { starts_at: Date; party_size: number; table_id: string | null },
  status: string,
) {
  return Prisma.sql`
    SELECT t.id FROM dining_tables t
    WHERE t.establishment_id = ${establishmentId}::uuid AND t.seats >= ${current.party_size}
      AND NOT EXISTS (
        SELECT 1 FROM reservations r
        WHERE r.establishment_id = ${establishmentId}::uuid AND r.id <> ${reservationId}::uuid
          AND (r.table_id = t.id OR r.table_id IS NULL)
          AND (
            (r.status = 'SEATED' AND (${status}::text = 'SEATED' OR r.starts_at + INTERVAL '2 hours' > ${current.starts_at}::timestamptz))
            OR (r.status = 'CONFIRMED' AND r.starts_at < ${current.starts_at}::timestamptz + INTERVAL '2 hours'
              AND r.starts_at + INTERVAL '2 hours' > ${current.starts_at}::timestamptz)
          )
      )
    ORDER BY (t.id = ${current.table_id}::uuid) DESC NULLS LAST, t.seats ASC, t.name ASC
    LIMIT 1`;
}
