import { describe, expect, it } from 'vitest';
import { reservationAllowedAt, reservationSchedule } from '../../src/domains/commerce/reservation-schedule';

describe('Reservation slots', () => {
  // Le 2 septembre 2026 est un mercredi.
  const hours = [{ weekDay: 'WEDNESDAY' as const, opensAtMinutes: 720, closesAtMinutes: 840 }];

  it('refuses a request outside the opening hours and accepts one during service', () => {
    expect(reservationAllowedAt(new Date('2026-09-02T13:00:00Z'), hours, [], 'Africa/Abidjan')).toBe(true);
    expect(reservationAllowedAt(new Date('2026-09-02T16:00:00Z'), hours, [], 'Africa/Abidjan')).toBe(false);
    expect(reservationAllowedAt(new Date('2026-09-03T13:00:00Z'), hours, [], 'Africa/Abidjan')).toBe(false);
  });

  it('honours an exceptional closure on a normally open day', () => {
    const closure = [{ dateKey: '2026-09-02', closed: true, opensAtMinutes: null, closesAtMinutes: null }];
    expect(reservationAllowedAt(new Date('2026-09-02T13:00:00Z'), hours, closure, 'Africa/Abidjan')).toBe(
      false,
    );
  });

  it('reads the hours in the restaurant timezone', () => {
    // 12:30 a Paris en ete vaut 10:30 UTC.
    expect(reservationAllowedAt(new Date('2026-09-02T10:30:00Z'), hours, [], 'Europe/Paris')).toBe(true);
    expect(reservationAllowedAt(new Date('2026-09-02T12:30:00Z'), hours, [], 'Europe/Paris')).toBe(false);
  });

  it('accepts a request after midnight during an overnight service', () => {
    const overnight = [{ weekDay: 'WEDNESDAY' as const, opensAtMinutes: 1080, closesAtMinutes: 1560 }];
    expect(reservationAllowedAt(new Date('2026-09-03T01:00:00Z'), overnight, [], 'Africa/Abidjan')).toBe(
      true,
    );
    expect(reservationAllowedAt(new Date('2026-09-03T02:00:00Z'), overnight, [], 'Africa/Abidjan')).toBe(
      false,
    );
  });

  it('does not judge a restaurant that has not entered its hours yet', () => {
    expect(reservationAllowedAt(new Date('2026-09-02T03:00:00Z'), [], [], 'Africa/Abidjan')).toBe(true);
    expect(reservationSchedule(new Date('2026-09-02T03:00:00Z'), [], [], 'Africa/Abidjan')).toEqual({
      timezone: 'Africa/Abidjan',
      hoursConfigured: false,
      slots: [],
    });
  });

  it('lists upcoming quarter hours during service over thirty days', () => {
    const result = reservationSchedule(new Date('2026-09-02T12:05:00Z'), hours, [], 'Africa/Abidjan');
    expect(result.hoursConfigured).toBe(true);
    expect(result.slots[0]).toBe('2026-09-02T12:15:00.000Z');
    expect(result.slots).toContain('2026-09-02T13:45:00.000Z');
    expect(result.slots).not.toContain('2026-09-02T14:00:00.000Z');
    expect(result.slots).toContain('2026-09-30T12:00:00.000Z');
    expect(result.slots).not.toContain('2026-10-07T12:00:00.000Z');
    expect(result.slots.every((slot) => new Date(slot).getUTCDay() === 3)).toBe(true);
  });

  it('never offers the current instant itself', () => {
    const result = reservationSchedule(new Date('2026-09-02T12:15:00Z'), hours, [], 'Africa/Abidjan');
    expect(result.slots[0]).toBe('2026-09-02T12:30:00.000Z');
  });
});
