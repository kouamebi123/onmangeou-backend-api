import { Injectable } from '@nestjs/common';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { fr } from 'date-fns/locale';

/**
 * Gestion du temps OnMangeOu.
 *
 * Reference : specification principe non negociable 5.
 * Les donnees sont enregistrees en UTC, l'affichage se fait en `Africa/Abidjan`.
 * La Cote d'Ivoire est en UTC+0 sans heure d'ete, mais la conversion reste
 * explicite pour ne pas dependre de ce fait et pour supporter une extension
 * regionale sans reecriture.
 */
export const DISPLAY_TIME_ZONE = 'Africa/Abidjan' as const;

export const MINUTES_PER_DAY = 1440;

/**
 * Horloge injectable. Le code metier ne construit jamais `new Date()`
 * directement : les transitions d'etat, expirations d'OTP et calculs d'horaires
 * doivent etre testables de facon deterministe.
 */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }

  nowMs(): number {
    return this.now().getTime();
  }

  plusSeconds(seconds: number): Date {
    return new Date(this.nowMs() + seconds * 1000);
  }

  isExpired(deadline: Date): boolean {
    return this.nowMs() >= deadline.getTime();
  }
}

/** Horloge figee, reservee aux tests. */
export class FixedClock extends Clock {
  constructor(private current: Date) {
    super();
  }

  override now(): Date {
    return new Date(this.current.getTime());
  }

  set(date: Date): void {
    this.current = date;
  }

  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}

/** Jours de la semaine dans l'ordre de l'enum Prisma `WeekDay`. */
export const WEEK_DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export type WeekDayCode = (typeof WEEK_DAYS)[number];

/**
 * Jour de la semaine local a Abidjan pour un instant UTC donne.
 *
 * `getDay()` renvoie 0 pour dimanche : la conversion place lundi en premier pour
 * correspondre a l'usage local et a l'ordre de l'enum.
 */
export function weekDayInDisplayZone(instant: Date, timeZone: string = DISPLAY_TIME_ZONE): WeekDayCode {
  const zoned = toZonedTime(instant, timeZone);
  const index = (zoned.getDay() + 6) % 7;
  // WEEK_DAYS possede exactement sept entrees et l'index est borne par le modulo.
  return WEEK_DAYS[index] as WeekDayCode;
}

/** Minutes ecoulees depuis minuit local. */
export function minutesSinceMidnight(instant: Date, timeZone: string = DISPLAY_TIME_ZONE): number {
  const zoned = toZonedTime(instant, timeZone);
  return zoned.getHours() * 60 + zoned.getMinutes();
}

/** Date locale au format `YYYY-MM-DD`, utilisee pour les exceptions d'horaires. */
export function localDateKey(instant: Date, timeZone: string = DISPLAY_TIME_ZONE): string {
  return formatInTimeZone(instant, timeZone, 'yyyy-MM-dd');
}

/** Horodatage lisible en francais, pour les exports et notifications. */
export function formatForDisplay(instant: Date, timeZone: string = DISPLAY_TIME_ZONE): string {
  return formatInTimeZone(instant, timeZone, "d MMMM yyyy 'a' HH:mm", { locale: fr });
}

/** Converti une heure locale (`YYYY-MM-DD`, minutes) en instant UTC. */
export function localTimeToUtc(
  dateKey: string,
  minutes: number,
  timeZone: string = DISPLAY_TIME_ZONE,
): Date {
  const hours = Math.floor(minutes / 60) % 24;
  const dayOffset = Math.floor(minutes / MINUTES_PER_DAY);
  const remainder = minutes % 60;
  const padded = `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}:00`;
  const base = fromZonedTime(`${dateKey}T${padded}`, timeZone);

  return dayOffset > 0 ? new Date(base.getTime() + dayOffset * MINUTES_PER_DAY * 60_000) : base;
}

/** Formate des minutes depuis minuit en `HH:mm`, y compris au-dela de minuit. */
export function formatMinutes(minutes: number): string {
  const normalized = minutes % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const remainder = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}
