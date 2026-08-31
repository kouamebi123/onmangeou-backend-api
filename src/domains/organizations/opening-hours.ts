import {
  localDateKey,
  minutesSinceMidnight,
  MINUTES_PER_DAY,
  weekDayInDisplayZone,
  WEEK_DAYS,
  type WeekDayCode,
} from '../../common/time/clock';

/**
 * Calcul d'ouverture d'un etablissement.
 *
 * Reference : specification sections 3.1 et 20.1 (filtre « ouvert maintenant »).
 *
 * Deux subtilites traitees ici :
 *
 *  1. Service de nuit : un maquis ouvert de 18:00 a 02:00 est enregistre avec
 *     `closesAtMinutes = 1560` (26 h). A 00:30, l'instant courant vaut 30 minutes
 *     dans la journee du lendemain : il faut donc tester aussi le creneau de la
 *     veille decale de 1440 minutes.
 *
 *  2. Exception de date : une fermeture exceptionnelle ou un horaire special
 *     remplace entierement les horaires hebdomadaires de ce jour, sans les
 *     modifier.
 */

export interface HoursSlot {
  weekDay: WeekDayCode;
  opensAtMinutes: number;
  closesAtMinutes: number;
}

export interface HoursException {
  /** Date locale au format `YYYY-MM-DD`. */
  dateKey: string;
  closed: boolean;
  opensAtMinutes: number | null;
  closesAtMinutes: number | null;
}

export interface OpeningStatus {
  open: boolean;
  /** Minutes restantes avant fermeture lorsque l'etablissement est ouvert. */
  closesInMinutes: number | null;
  /** Minutes avant la prochaine ouverture lorsqu'il est ferme. */
  opensInMinutes: number | null;
  reason: 'regular' | 'exception' | 'no_hours';
}

export function computeOpeningStatus(
  instant: Date,
  slots: readonly HoursSlot[],
  exceptions: readonly HoursException[],
  timeZone?: string,
): OpeningStatus {
  const nowMinutes = minutesSinceMidnight(instant, timeZone);
  const today = weekDayInDisplayZone(instant, timeZone);
  const todayKey = localDateKey(instant, timeZone);

  const exception = exceptions.find((entry) => entry.dateKey === todayKey);

  if (exception) {
    if (exception.closed || exception.opensAtMinutes === null || exception.closesAtMinutes === null) {
      return { open: false, closesInMinutes: null, opensInMinutes: null, reason: 'exception' };
    }

    const openNow = nowMinutes >= exception.opensAtMinutes && nowMinutes < exception.closesAtMinutes;

    return {
      open: openNow,
      closesInMinutes: openNow ? exception.closesAtMinutes - nowMinutes : null,
      opensInMinutes: openNow ? null : Math.max(0, exception.opensAtMinutes - nowMinutes),
      reason: 'exception',
    };
  }

  if (slots.length === 0) {
    return { open: false, closesInMinutes: null, opensInMinutes: null, reason: 'no_hours' };
  }

  const todaySlots = slots.filter((slot) => slot.weekDay === today);
  const yesterdaySlots = slots.filter((slot) => slot.weekDay === previousWeekDay(today));

  for (const slot of todaySlots) {
    if (nowMinutes >= slot.opensAtMinutes && nowMinutes < slot.closesAtMinutes) {
      return {
        open: true,
        closesInMinutes: slot.closesAtMinutes - nowMinutes,
        opensInMinutes: null,
        reason: 'regular',
      };
    }
  }

  // Creneau de la veille qui franchit minuit.
  for (const slot of yesterdaySlots) {
    if (slot.closesAtMinutes > MINUTES_PER_DAY) {
      const closesToday = slot.closesAtMinutes - MINUTES_PER_DAY;
      if (nowMinutes < closesToday) {
        return {
          open: true,
          closesInMinutes: closesToday - nowMinutes,
          opensInMinutes: null,
          reason: 'regular',
        };
      }
    }
  }

  const upcoming = todaySlots
    .filter((slot) => slot.opensAtMinutes > nowMinutes)
    .sort((left, right) => left.opensAtMinutes - right.opensAtMinutes)[0];

  return {
    open: false,
    closesInMinutes: null,
    opensInMinutes: upcoming === undefined ? null : upcoming.opensAtMinutes - nowMinutes,
    reason: 'regular',
  };
}

function previousWeekDay(day: WeekDayCode): WeekDayCode {
  const index = WEEK_DAYS.indexOf(day);
  const previousIndex = (index + WEEK_DAYS.length - 1) % WEEK_DAYS.length;
  return WEEK_DAYS[previousIndex] as WeekDayCode;
}

/**
 * Verifie la coherence d'une grille d'horaires avant enregistrement.
 *
 * Deux creneaux du meme jour ne peuvent pas se chevaucher : sinon le calcul
 * d'ouverture et l'affichage public deviendraient ambigus.
 */
export function findOverlappingSlots(slots: readonly HoursSlot[]): HoursSlot[] {
  const conflicts: HoursSlot[] = [];

  for (const day of WEEK_DAYS) {
    const daySlots = slots
      .filter((slot) => slot.weekDay === day)
      .sort((left, right) => left.opensAtMinutes - right.opensAtMinutes);

    for (let index = 1; index < daySlots.length; index += 1) {
      const previous = daySlots[index - 1];
      const current = daySlots[index];

      if (previous && current && current.opensAtMinutes < previous.closesAtMinutes) {
        conflicts.push(current);
      }
    }
  }

  return conflicts;
}
