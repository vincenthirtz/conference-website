// utils/teams/scrimCalendar.ts
// Helpers PURS pour l'agenda admin de planification des scrims (vue semaine où
// l'on pose un scrim directement sur un créneau). Sans dépendance Supabase.

import { getTimeZoneOffsetMs } from '@/utils/timezone';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Ajoute `n` jours à une date calendaire 'YYYY-MM-DD' (arithmétique UTC). */
export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map((v) => parseInt(v, 10));
  const next = new Date(Date.UTC(y, m - 1, d) + n * 86_400_000);
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(
    next.getUTCDate()
  )}`;
}

/** Lundi de la semaine ISO contenant `ymd` (format 'YYYY-MM-DD'). */
export function mondayOf(ymd: string): string {
  const [y, m, d] = ymd.split('-').map((v) => parseInt(v, 10));
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=dim..6=sam
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDaysYmd(ymd, offset);
}

/** Les 7 jours de la semaine à partir d'un lundi. */
export function weekDaysFrom(mondayYmd: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysYmd(mondayYmd, i));
}

/** Date calendaire du jour ('YYYY-MM-DD') dans un fuseau. */
export function todayYmdInTz(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Jour ('YYYY-MM-DD') et minute-de-jour d'un instant ISO dans un fuseau. */
export function dateAndMinuteInTz(
  iso: string,
  tz: string
): { ymd: string; minute: number } | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0;
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    minute: hour * 60 + parseInt(get('minute'), 10),
  };
}

/**
 * Convertit une heure murale (jour + minute-de-jour) d'un fuseau en instant UTC
 * (ISO). Double passe pour les bascules DST. Miroir de la logique de slotKey.
 */
export function zonedTimeToUtcIso(
  ymd: string,
  minuteOfDay: number,
  tz: string
): string {
  const [y, mo, d] = ymd.split('-').map((v) => parseInt(v, 10));
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const guess = Date.UTC(y, mo - 1, d, hour, minute);
  const off1 = getTimeZoneOffsetMs(new Date(guess), tz);
  let utc = guess - off1;
  const off2 = getTimeZoneOffsetMs(new Date(utc), tz);
  if (off2 !== off1) utc = guess - off2;
  return new Date(utc).toISOString();
}

/** Format datetime-local 'YYYY-MM-DDTHH:MM' d'une heure murale. */
export function localInputValue(ymd: string, minuteOfDay: number): string {
  return `${ymd}T${pad2(Math.floor(minuteOfDay / 60))}:${pad2(
    minuteOfDay % 60
  )}`;
}
