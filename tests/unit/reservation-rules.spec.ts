import { describe, expect, it } from 'vitest';
import { canChangeReservationStatus } from '../../src/domains/commerce/reservation-rules';

describe('Reservation transitions', () => {
  it('allows confirmation, seating and completion in order', () => {
    expect(canChangeReservationStatus('REQUESTED', 'CONFIRMED')).toBe(true);
    expect(canChangeReservationStatus('CONFIRMED', 'SEATED')).toBe(true);
    expect(canChangeReservationStatus('SEATED', 'COMPLETED')).toBe(true);
  });
  it('rejects skipped steps, unknown states and reopening terminal states', () => {
    expect(canChangeReservationStatus('REQUESTED', 'COMPLETED')).toBe(false);
    expect(canChangeReservationStatus('CONFIRMED', 'UNKNOWN')).toBe(false);
    for (const state of ['CANCELLED', 'REJECTED', 'COMPLETED', 'NO_SHOW']) {
      expect(canChangeReservationStatus(state, 'CONFIRMED')).toBe(false);
    }
  });
});
