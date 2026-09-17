// utils/maps/poolScope.ts
//
// PORTÉE d'un pool de cartes de tournoi : pool par défaut, pool d'une JOURNÉE
// (`round_number`) ou pool d'une DATE DE JEU (`play_date`).
//
// POURQUOI : l'organisation publie ses pools PAR DATE (« Map Pool 30/09 ») et
// une même date réunit plusieurs journées (le 30/09 porte des matchs J2 et J3).
// La migration `tournament_maps_date_scoped_pool.sql` ajoute donc `play_date`,
// prioritaire sur la journée. Une ligne ne porte jamais les deux clés (CHECK
// `tournament_maps_one_scope`).
//
// LE PIÈGE que ce module ferme : le pool par défaut est `round_number IS NULL
// AND play_date IS NULL`. Un lecteur qui ne filtre que `round_number IS NULL`
// ferait apparaître les cartes de chaque pool daté dans le pool par défaut.
// Toute lecture scopée passe donc par `applyPoolScope`.
//
// Tout est PUR ici, sauf `applyPoolScope` qui ne fait que composer des filtres.

import { parisDayKey } from './roundPools';

export type PoolScope =
  | { kind: 'default' }
  | { kind: 'round'; round: number }
  | { kind: 'date'; date: string };

export const DEFAULT_POOL_SCOPE: PoolScope = { kind: 'default' };

/**
 * `YYYY-MM-DD` calendaire réel. Refuse le 2026-02-31, que `Date.UTC`
 * normaliserait silencieusement en mars. PURE.
 */
export function isValidPlayDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export type ParsedDate =
  | { ok: true; date: string | null }
  | { ok: false; error: string };

/**
 * Date demandée par l'appelant (`?date=`). Absent ou vide → `null` ; sinon
 * `YYYY-MM-DD` valide obligatoire. On REFUSE plutôt que de retomber sur le pool
 * par défaut : un `?date=30/09` traité comme « défaut » écrirait dans le
 * mauvais pool sans que personne le voie. PURE.
 */
export function parseDateParam(value: unknown): ParsedDate {
  if (Array.isArray(value)) return { ok: false, error: 'Invalid date' };
  if (value === undefined || value === null) return { ok: true, date: null };
  const raw = String(value).trim();
  if (raw === '') return { ok: true, date: null };
  if (!isValidPlayDate(raw)) return { ok: false, error: 'Invalid date' };
  return { ok: true, date: raw };
}

/**
 * Filtres PostgREST d'une portée, à composer sur une requête `tournament_maps`.
 *
 * Journée : `round_number = N` suffit, le CHECK interdit qu'une ligne de journée
 * porte une date. Défaut : les DEUX colonnes à NULL.
 */
export function applyPoolScope<T extends { is: Function; eq: Function }>(
  query: T,
  scope: PoolScope
): T {
  switch (scope.kind) {
    case 'round':
      return query.eq('round_number', scope.round) as T;
    case 'date':
      return query.eq('play_date', scope.date) as T;
    default:
      return query.is('round_number', null).is('play_date', null) as T;
  }
}

/** Colonnes à écrire sur une ligne insérée dans cette portée. PURE. */
export function poolScopeColumns(scope: PoolScope): {
  round_number: number | null;
  play_date: string | null;
} {
  return {
    round_number: scope.kind === 'round' ? scope.round : null,
    play_date: scope.kind === 'date' ? scope.date : null,
  };
}

/** Une date de jeu telle que l'écran d'administration la propose. */
export type DateOption = {
  /** `YYYY-MM-DD` (Europe/Paris) — la clé du pool de cette date. */
  date: string;
  /** Libellés des journées jouées ce jour-là (« J2 », « J3 »), triés. */
  rounds: string[];
  /** Nombre de cartes déjà déclarées pour cette date. */
  mapsCount: number;
};

type MatchRow = {
  round_number?: number | null;
  round_name?: string | null;
  scheduled_at?: string | null;
};

/**
 * Dates proposables, dérivées du PLANNING : les jours calendaires (Paris) qui
 * portent au moins un match programmé. Une date qui a déjà un pool reste
 * listée même si plus aucun match n'y est programmé (report) — sinon son pool
 * deviendrait inaccessible à l'écran tout en restant appliqué nulle part.
 *
 * Triées chronologiquement. PURE.
 */
export function buildDateOptions(
  matches: MatchRow[],
  mapCounts: Map<string, number> = new Map()
): DateOption[] {
  const byDate = new Map<string, Map<number, string>>();

  for (const row of matches) {
    const day = parisDayKey(row.scheduled_at ?? null);
    if (!day) continue;
    const rounds = byDate.get(day) ?? new Map<number, string>();
    const round = row.round_number;
    if (typeof round === 'number' && Number.isFinite(round)) {
      if (!rounds.has(round)) rounds.set(round, row.round_name || `J${round}`);
    }
    byDate.set(day, rounds);
  }

  for (const date of mapCounts.keys()) {
    if (!byDate.has(date)) byDate.set(date, new Map());
  }

  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, rounds]) => ({
      date,
      rounds: [...rounds.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, label]) => label),
      mapsCount: mapCounts.get(date) ?? 0,
    }));
}

/** `YYYY-MM-DD` → `JJ/MM`, sans repasser par un Date (fuseau du lecteur). PURE. */
export function formatPlayDateShort(date: string): string {
  const [, month, day] = date.split('-');
  return month && day ? `${day}/${month}` : date;
}
