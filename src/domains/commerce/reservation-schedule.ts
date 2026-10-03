import { isOpenAt } from '../orders/order-schedule';
import type { HoursException, HoursSlot } from '../organizations/opening-hours';

export const RESERVATION_SLOT_STEP_MS = 15 * 60_000;
export const RESERVATION_HORIZON_MS = 30 * 24 * 60 * 60_000;

/**
 * Une demande de reservation doit tomber pendant le service du restaurant.
 *
 * Sans horaires hebdomadaires saisis, le serveur ne peut pas juger : la demande
 * reste acceptee et le restaurant tranche lors de la confirmation.
 */
export function reservationAllowedAt(
  startsAt: Date,
  hours: readonly HoursSlot[],
  exceptions: readonly HoursException[],
  timezone: string,
): boolean {
  return hours.length === 0 || isOpenAt(startsAt, hours, exceptions, timezone);
}

/** Creneaux proposables au client : quarts d'heure a venir, pendant le service. */
export function reservationSchedule(
  now: Date,
  hours: readonly HoursSlot[],
  exceptions: readonly HoursException[],
  timezone: string,
): { timezone: string; hoursConfigured: boolean; slots: string[] } {
  const slots: string[] = [];

  if (hours.length > 0) {
    const first = (Math.floor(now.getTime() / RESERVATION_SLOT_STEP_MS) + 1) * RESERVATION_SLOT_STEP_MS;

    for (let time = first; time <= now.getTime() + RESERVATION_HORIZON_MS; time += RESERVATION_SLOT_STEP_MS) {
      if (isOpenAt(new Date(time), hours, exceptions, timezone)) slots.push(new Date(time).toISOString());
    }
  }

  return { timezone, hoursConfigured: hours.length > 0, slots };
}
