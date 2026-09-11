// utils/scheduleByDay.ts
//
// Ranger des matchs par JOUR CALENDAIRE DU TOURNOI, puis par semaine, et dire
// où en est le planning. Logique pure, partagée par /timeline-2026 et l'embed
// calendrier (/embed/tournament/[id]/schedule).
//
// Pourquoi un module : les deux écrans calculaient le jour d'un match sans
// fuseau. Soit en UTC (`toISOString().slice(0, 10)`), ce qui range un match de
// 00:30 à Paris la veille ; soit via `toLocale*` sans `timeZone`, ce qui rend
// l'heure du SERVEUR (UTC) dans le HTML ISR/SSR, puis celle du navigateur à
// l'hydratation. Ici, le fuseau est toujours explicite, et un jour calendaire
// est une chaîne `YYYY-MM-DD` — plus un instant qu'on pourrait reformater dans
// le mauvais fuseau.
//
// UN match doit tomber le MÊME soir partout. Le jour vient donc du même helper
// et du même fuseau que la référence admin — le diagnostic de planning
// (utils/matches/scheduleDiagnostics.ts), la liste admin des matchs
// (utils/matches/adminMatchesTz.ts) : `getWallClockParts(date, tz).date`, avec
// `tz` = `tournaments.timezone` résolu par `resolveTournamentTz` (repli
// Europe/Paris). Pas de conversion maison ici.

import { getWallClockParts } from '@/utils/timezone';
import {
  DEFAULT_TOURNAMENT_TZ,
  resolveTournamentTz,
} from '@/utils/matches/adminMatchesTz';
import { mondayOf } from '@/utils/teams/scrimCalendar';

/** Fuseau par défaut du calendrier (repli de `tournaments.timezone`). */
export const SCHEDULE_TZ = DEFAULT_TOURNAMENT_TZ;

/** Fuseau d'un tournoi : le sien s'il est valide, Europe/Paris sinon. */
export { resolveTournamentTz };

/** Clé du groupe des matchs sans date (ou à date illisible). Toujours en dernier. */
export const UNSCHEDULED_KEY = '__unscheduled__';

const FINISHED = new Set(['finished', 'completed', 'finalized']);
const LIVE = new Set(['ongoing', 'running', 'live']);

export function isFinishedStatus(status: string | null | undefined): boolean {
  return !!status && FINISHED.has(status);
}

export function isLiveStatus(status: string | null | undefined): boolean {
  return !!status && LIVE.has(status);
}

export type Scheduled = { scheduled_at: string | null };
export type ScheduledMatch = Scheduled & { status: string };

/** Un jour calendaire (dans le fuseau demandé) et ses matchs, dans l'ordre. */
export type ScheduleDay<T> = {
  /** `YYYY-MM-DD`, ou `UNSCHEDULED_KEY`. */
  key: string;
  /** `YYYY-MM-DD` dans le fuseau, `null` pour le groupe non daté. */
  ymd: string | null;
  items: T[];
  /** Premier / dernier horaire du jour (ISO tel que reçu). */
  firstAt: string | null;
  lastAt: string | null;
};

/** Une semaine ISO (lundi → dimanche) et ses jours. */
export type ScheduleWeek<D> = {
  /** Lundi `YYYY-MM-DD`, ou `UNSCHEDULED_KEY`. */
  key: string;
  monday: string | null;
  /** Rang 1-based depuis la semaine d'origine ; `null` pour le non daté. */
  index: number | null;
  days: D[];
  /** Premier / dernier jour AYANT des matchs (pas le lundi / dimanche). */
  firstYmd: string | null;
  lastYmd: string | null;
};

export type DayState = 'done' | 'live' | 'next' | 'upcoming';

/**
 * Jour calendaire `YYYY-MM-DD` d'un instant ISO dans `tz`, ou `null`.
 * `getWallClockParts(...).date` : la même clé que le diagnostic admin.
 */
export function dayKeyInTz(
  iso: string | null | undefined,
  tz: string = SCHEDULE_TZ
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return getWallClockParts(d, tz).date;
}

function instant(iso: string | null): number {
  return iso ? new Date(iso).getTime() : NaN;
}

/**
 * Tri chronologique STABLE, non datés à la fin. Compare des instants, pas des
 * chaînes : PostgREST rend `+00:00`, d'autres sources `Z`.
 */
function byScheduledAt<T extends Scheduled>(a: T, b: T): number {
  const ta = instant(a.scheduled_at);
  const tb = instant(b.scheduled_at);
  const na = isNaN(ta);
  const nb = isNaN(tb);
  if (na && nb) return 0;
  if (na) return 1;
  if (nb) return -1;
  return ta - tb;
}

function byYmd(a: { ymd: string | null }, b: { ymd: string | null }): number {
  if (a.ymd === b.ymd) return 0;
  if (a.ymd === null) return 1;
  if (b.ymd === null) return -1;
  return a.ymd < b.ymd ? -1 : 1;
}

/**
 * Regroupe par jour calendaire dans `tz`. Jours triés, matchs triés par
 * horaire à l'intérieur, non datés dans un dernier groupe.
 */
export function groupByDayInTz<T extends Scheduled>(
  items: readonly T[],
  tz: string = SCHEDULE_TZ
): ScheduleDay<T>[] {
  const days = new Map<string, ScheduleDay<T>>();
  for (const item of [...items].sort(byScheduledAt)) {
    const ymd = dayKeyInTz(item.scheduled_at, tz);
    const key = ymd ?? UNSCHEDULED_KEY;
    let day = days.get(key);
    if (!day) {
      day = { key, ymd, items: [], firstAt: null, lastAt: null };
      days.set(key, day);
    }
    day.items.push(item);
    if (ymd) {
      // Les items arrivent triés : le premier daté ouvre, le dernier ferme.
      if (day.firstAt === null) day.firstAt = item.scheduled_at;
      day.lastAt = item.scheduled_at;
    }
  }
  return [...days.values()].sort(byYmd);
}

function ymdToUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map((v) => parseInt(v, 10));
  return Date.UTC(y, m - 1, d);
}

/**
 * Nombre de jours calendaires de `from` à `to` (`YYYY-MM-DD`), négatif si
 * `to` est avant. Arithmétique sur des dates, pas des instants : un passage à
 * l'heure d'hiver n'ampute pas une journée de 23 h.
 */
export function daysBetweenYmd(from: string, to: string): number {
  return Math.round((ymdToUtcMs(to) - ymdToUtcMs(from)) / 86_400_000);
}

/**
 * Regroupe des jours (déjà triés) par semaine ISO. `origin` fixe la semaine
 * n° 1 — passez la même à plusieurs appels pour une numérotation commune
 * (ex. saison régulière puis finales). Par défaut : la semaine du premier jour
 * daté de la liste.
 */
export function groupDaysByWeek<D extends { ymd: string | null }>(
  days: readonly D[],
  origin?: string | null
): ScheduleWeek<D>[] {
  const firstYmd = days.find((d) => d.ymd)?.ymd ?? null;
  const originMonday = origin
    ? mondayOf(origin)
    : firstYmd
      ? mondayOf(firstYmd)
      : null;

  const weeks = new Map<string, ScheduleWeek<D>>();
  for (const day of [...days].sort(byYmd)) {
    const monday = day.ymd ? mondayOf(day.ymd) : null;
    const key = monday ?? UNSCHEDULED_KEY;
    let week = weeks.get(key);
    if (!week) {
      week = {
        key,
        monday,
        index:
          monday && originMonday
            ? Math.floor(daysBetweenYmd(originMonday, monday) / 7) + 1
            : null,
        days: [],
        firstYmd: null,
        lastYmd: null,
      };
      weeks.set(key, week);
    }
    week.days.push(day);
    if (day.ymd) {
      if (week.firstYmd === null) week.firstYmd = day.ymd;
      week.lastYmd = day.ymd;
    }
  }
  return [...weeks.values()];
}

/**
 * État de chaque jour, d'après les STATUTS des matchs — jamais d'après
 * l'horloge (le rendu ISR et le client divergeraient).
 *
 * - `live` : au moins un match en cours ;
 * - `done` : tous les matchs terminés ;
 * - `next` : le premier jour (chronologique) ayant un match non terminé —
 *   sauf si un jour est live, auquel cas c'est lui le « prochain » et aucun
 *   jour n'est marqué `next` ;
 * - `upcoming` : le reste.
 */
export function deriveDayStates<
  D extends { ymd: string | null; items: readonly ScheduledMatch[] },
>(days: readonly D[]): { next: D | null; states: Map<D, DayState> } {
  const chrono = [...days].sort(byYmd);
  const isLive = (d: D) => d.items.some((m) => isLiveStatus(m.status));
  const isDone = (d: D) =>
    d.items.length > 0 && d.items.every((m) => isFinishedStatus(m.status));

  const next =
    chrono.find(isLive) ??
    chrono.find((d) => d.items.some((m) => !isFinishedStatus(m.status))) ??
    null;

  const states = new Map<D, DayState>();
  for (const d of chrono) {
    states.set(
      d,
      isLive(d) ? 'live' : isDone(d) ? 'done' : d === next ? 'next' : 'upcoming'
    );
  }
  return { next, states };
}

/** Une phase (étape de tournoi) découpée en semaines puis en jours. */
export type SchedulePhase<T> = {
  key: string;
  items: T[];
  days: ScheduleDay<T>[];
  weeks: ScheduleWeek<ScheduleDay<T>>[];
  firstAt: string | null;
  lastAt: string | null;
};

export type PhasedSchedule<T> = {
  phases: SchedulePhase<T>[];
  /** Tous les jours de toutes les phases, en ordre chronologique. */
  days: ScheduleDay<T>[];
  next: ScheduleDay<T> | null;
  states: Map<ScheduleDay<T>, DayState>;
  /** Jours calendaires distincts avec au moins un match daté. */
  dayCount: number;
  firstAt: string | null;
  lastAt: string | null;
};

/**
 * Le planning complet : phases (dans l'ordre où elles commencent) → semaines →
 * jours. `phaseOf` rend le nom d'étape d'un match ; vide ou `null` → phase
 * `fallbackPhase` (les finales n'ont pas d'étape en base).
 *
 * Les semaines sont numérotées depuis le PREMIER match du tournoi, toutes
 * phases confondues : la semaine des finales garde son rang dans la saison.
 * Si un même jour porte des matchs de deux phases, il apparaît dans chacune
 * (avec ses seuls matchs) mais ne compte qu'une fois dans `dayCount`.
 */
export function buildPhasedSchedule<T extends ScheduledMatch>(
  items: readonly T[],
  opts: {
    phaseOf: (item: T) => string | null | undefined;
    fallbackPhase: string;
    tz?: string;
  }
): PhasedSchedule<T> {
  const tz = opts.tz ?? SCHEDULE_TZ;
  const sorted = [...items].sort(byScheduledAt);
  const dated = sorted.filter((m) => dayKeyInTz(m.scheduled_at, tz));
  const firstAt = dated[0]?.scheduled_at ?? null;
  const lastAt = dated[dated.length - 1]?.scheduled_at ?? null;
  const origin = dayKeyInTz(firstAt, tz);

  // Items triés → l'ordre d'insertion est l'ordre de début des phases, et une
  // phase sans aucun match daté arrive en dernier.
  const byPhase = new Map<string, T[]>();
  for (const m of sorted) {
    const key = opts.phaseOf(m)?.trim() || opts.fallbackPhase;
    const list = byPhase.get(key);
    if (list) list.push(m);
    else byPhase.set(key, [m]);
  }

  const phases: SchedulePhase<T>[] = [...byPhase.entries()].map(
    ([key, phaseItems]) => {
      const days = groupByDayInTz(phaseItems, tz);
      const datedDays = days.filter((d) => d.ymd);
      return {
        key,
        items: phaseItems,
        days,
        weeks: groupDaysByWeek(days, origin),
        firstAt: datedDays[0]?.firstAt ?? null,
        lastAt: datedDays[datedDays.length - 1]?.lastAt ?? null,
      };
    }
  );

  const days = phases.flatMap((p) => p.days).sort(byYmd);
  const { next, states } = deriveDayStates(days);
  const dayCount = new Set(days.map((d) => d.ymd).filter(Boolean)).size;

  return { phases, days, next, states, dayCount, firstAt, lastAt };
}

/**
 * Formate un jour `YYYY-MM-DD` DÉJÀ exprimé dans le fuseau du calendrier.
 * On l'ancre à midi UTC et on le formate en UTC : le jour affiché est celui de
 * la chaîne, quel que soit le fuseau de la machine qui rend.
 */
export function formatYmd(
  ymd: string,
  locale: string,
  options: Intl.DateTimeFormatOptions
): string {
  return new Date(ymdToUtcMs(ymd) + 12 * 3_600_000).toLocaleDateString(locale, {
    ...options,
    timeZone: 'UTC',
  });
}

/** Heure `HH:MM` d'un instant ISO dans `tz`, ou `null` si absent/illisible. */
export function formatTimeInTz(
  iso: string | null | undefined,
  locale: string,
  tz: string = SCHEDULE_TZ
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  });
}
