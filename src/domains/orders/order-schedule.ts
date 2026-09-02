import { computeOpeningStatus, type HoursSlot, type HoursException } from '../organizations/opening-hours';

import { localDateKey, localTimeToUtc, weekDayInDisplayZone } from '../../common/time/clock';

// An exceptional schedule also replaces the previous day's overnight service.
function openAt(instant: Date, hours: HoursSlot[], exceptions: HoursException[], timezone: string) {
  const previousDay = new Date(localTimeToUtc(localDateKey(instant, timezone), 0, timezone).getTime() - 1);
  const previousException = exceptions.find((e) => e.dateKey === localDateKey(previousDay, timezone));
  if (!previousException) return computeOpeningStatus(instant, hours, exceptions, timezone).open;
  const previousWeekDay = weekDayInDisplayZone(previousDay, timezone);
  const effectiveHours = hours.filter((h) => h.weekDay !== previousWeekDay);
  if (
    !previousException.closed &&
    previousException.opensAtMinutes !== null &&
    previousException.closesAtMinutes !== null
  ) {
    effectiveHours.push({
      weekDay: previousWeekDay,
      opensAtMinutes: previousException.opensAtMinutes,
      closesAtMinutes: previousException.closesAtMinutes,
    });
  }
  return computeOpeningStatus(instant, effectiveHours, exceptions, timezone).open;
}

export const SCHEDULE_MIN_LEAD_MS = 10 * 60_000;
export const SCHEDULE_HORIZON_MS = 7 * 24 * 60 * 60_000;
export function orderSchedule(now: Date, hours: HoursSlot[], exceptions: HoursException[], timezone: string) {
  const step = 15 * 60_000;
  const slots: string[] = [];
  for (
    let time = Math.ceil((now.getTime() + SCHEDULE_MIN_LEAD_MS) / step) * step;
    time <= now.getTime() + SCHEDULE_HORIZON_MS;
    time += step
  ) {
    if (openAt(new Date(time), hours, exceptions, timezone)) slots.push(new Date(time).toISOString());
  }
  return { timezone, asapAvailable: openAt(now, hours, exceptions, timezone), slots };
}
