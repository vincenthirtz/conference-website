// utils/matches/adminMatchesTz.ts
// Dates de la liste admin des matchs d'un tournoi
// (pages/admin/tournament/[id]/matches.tsx), dans le fuseau DU TOURNOI.
//
// Les instants sont stockés en UTC. Tout ce que l'écran en montre — jour de
// regroupement, libellé du jour, heure — et tout ce qu'il y écrit — bornes de
// filtre, planification groupée, import CSV — se lit dans `tournaments.timezone`
// (repli Europe/Paris), comme le calendrier de référence
// (components/admin/tournament/ScheduleMonthCalendar.tsx). Jamais dans le
// fuseau du navigateur : un admin en déplacement, ou un poste mal réglé, voyait
// sinon des jours et des heures différents du reste du site.

import {
  formatTimeTz,
  getWallClockParts,
  localInputToUTC,
} from '@/utils/timezone';

export const DEFAULT_TOURNAMENT_TZ = 'Europe/Paris';

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Fuseau à utiliser pour un tournoi : le sien s'il est un identifiant IANA
 * valide, Europe/Paris sinon. Un fuseau invalide ferait lever `Intl` à chaque
 * formatage et viderait l'écran.
 */
export function resolveTournamentTz(tz?: string | null): string {
  if (!tz) return DEFAULT_TOURNAMENT_TZ;
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TOURNAMENT_TZ;
  }
}

function toValidDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Instant → « 18 sept., 21:00 » dans le fuseau du tournoi. */
export function formatMatchDateTime(
  iso: string | null | undefined,
  tz: string
): string {
  if (!iso) return '—';
  const d = toValidDate(iso);
  if (!d) return iso;
  return d.toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  });
}

/** Instant → « 21:00 » dans le fuseau du tournoi. */
export function formatMatchTime(
  iso: string | null | undefined,
  tz: string
): string {
  return formatTimeTz(iso, tz);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Instant → valeur d'un `<input type="datetime-local">` lue dans `tz`. */
export function isoToTzInput(
  iso: string | null | undefined,
  tz: string
): string {
  const d = toValidDate(iso);
  if (!d) return '';
  const { date, minuteOfDay } = getWallClockParts(d, tz);
  return `${date}T${pad2(Math.floor(minuteOfDay / 60))}:${pad2(minuteOfDay % 60)}`;
}

/** Valeur datetime-local saisie dans `tz` → ISO UTC (null si vide). */
export function tzInputToIso(
  value: string | null | undefined,
  tz: string
): string | null {
  if (!value) return null;
  return localInputToUTC(value, tz);
}

/** 'YYYY-MM-DD' + n jours, arithmétique purement calendaire (sans fuseau). */
function addDaysYmd(ymd: string, days: number): string {
  const [, y, m, d] = ymd.match(YMD_RE)!;
  const next = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + days));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

/**
 * Bornes ISO des filtres `<input type="date">` « du … au … », jours pris dans
 * le fuseau du tournoi : `dateFrom` = minuit du jour, `dateTo` = dernière
 * milliseconde du jour (veille du minuit suivant, donc juste aussi les jours de
 * 23 h ou 25 h aux changements d'heure). Une valeur vide ou mal formée est
 * omise plutôt que de filtrer sur n'importe quoi.
 */
export function dayRangeToIsoBounds(
  dateFrom: string,
  dateTo: string,
  tz: string
): { dateFrom?: string; dateTo?: string } {
  const bounds: { dateFrom?: string; dateTo?: string } = {};
  if (YMD_RE.test(dateFrom)) {
    bounds.dateFrom = localInputToUTC(`${dateFrom}T00:00`, tz) ?? undefined;
  }
  if (YMD_RE.test(dateTo)) {
    const nextMidnight = localInputToUTC(`${addDaysYmd(dateTo, 1)}T00:00`, tz);
    if (nextMidnight) {
      bounds.dateTo = new Date(
        new Date(nextMidnight).getTime() - 1
      ).toISOString();
    }
  }
  return bounds;
}

/**
 * Colonne `scheduled_at` d'un import CSV → ISO UTC. Une valeur qui porte son
 * décalage (`Z`, `+02:00`) est un instant et se lit telle quelle ; une heure
 * murale nue (`2026-09-18 21:00`, `2026-09-18T21:00`, `2026-09-18`) est prise
 * dans le fuseau du tournoi. Une valeur illisible lève comme avant
 * (`RangeError` de `toISOString`) : l'import échoue avec un message plutôt que
 * de créer un match sans horaire.
 */
export function csvDateToIso(value: string, tz: string): string {
  const v = value.trim();
  if (/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(v) && v.length > 10) {
    return new Date(v).toISOString();
  }
  const wall = YMD_RE.test(v) ? `${v}T00:00` : v.replace(' ', 'T');
  return localInputToUTC(wall, tz) ?? new Date(v).toISOString();
}

export type TzDay<T> = {
  /** 'YYYY-MM-DD' dans le fuseau du tournoi — clé stable et triable. */
  key: string;
  /** « vendredi 18 septembre 2026 ». */
  label: string;
  matches: T[];
};

/** 'YYYY-MM-DD' → « vendredi 18 septembre 2026 », sans dérive de fuseau. */
export function formatDayLabel(ymd: string): string {
  const [, y, m, d] = ymd.match(YMD_RE)!;
  // Midi UTC formaté en UTC : le jour civil ne peut pas glisser.
  return new Date(
    Date.UTC(Number(y), Number(m) - 1, Number(d), 12)
  ).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Regroupe les matchs par jour du tournoi : jours dans l'ordre chronologique,
 * matchs d'un jour par heure. Un `scheduled_at` absent ou illisible range le
 * match parmi les non planifiés plutôt que de faire lever l'écran.
 */
export function groupMatchesByTzDay<T extends { scheduled_at: string | null }>(
  matches: readonly T[],
  tz: string
): { days: TzDay<T>[]; unscheduled: T[] } {
  const byDay = new Map<string, { t: number; m: T }[]>();
  const unscheduled: T[] = [];
  for (const m of matches) {
    const d = toValidDate(m.scheduled_at);
    if (!d) {
      unscheduled.push(m);
      continue;
    }
    const key = getWallClockParts(d, tz).date;
    const arr = byDay.get(key) ?? [];
    arr.push({ t: d.getTime(), m });
    byDay.set(key, arr);
  }
  const days = Array.from(byDay.keys())
    .sort()
    .map((key) => ({
      key,
      label: formatDayLabel(key),
      matches: byDay
        .get(key)!
        .sort((a, b) => a.t - b.t)
        .map((x) => x.m),
    }));
  return { days, unscheduled };
}
