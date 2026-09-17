// utils/maps/publicPools.ts
//
// Pools de cartes PAR JOURNÉE et PAR DATE tels que la page publique
// /tournament/[id]/maps les présente.
//
// Le visiteur cherche « le pool du 30/09 » : c'est ainsi que l'organisation
// l'annonce. Un pool daté REMPLACE donc, pour son jour, le pool de la journée —
// c'est la priorité appliquée aux matchs (utils/maps/pool.ts). Pour que la page
// ne mente pas, une date couverte par son propre pool est retirée des dates
// affichées sous la journée : J2 « 23/09 · 25/09 · 16/10 » et, à part,
// « Pool du 30/09 ». Le tout est trié chronologiquement.
//
// PURE : testable sans base.

import { parisDayKey } from './roundPools';

export type PublicPoolMap = {
  name: string;
  type: string | null;
  image: string | null;
};

export type ScopedPool = {
  /** Clé stable pour React et la sélection : `round:2` ou `date:2026-09-30`. */
  key: string;
  kind: 'round' | 'date';
  /** Journée (kind `round`) ; null pour une date. */
  round: number | null;
  /** Date `YYYY-MM-DD` (kind `date`) ; null pour une journée. */
  date: string | null;
  /** Libellé de journée (« J2 ») ; null pour une date. */
  label: string | null;
  /**
   * Dates `YYYY-MM-DD` couvertes : pour une journée, ses jours programmés SANS
   * ceux qui ont leur propre pool ; pour une date, elle-même.
   */
  dates: string[];
  /** Pour une date : libellés des journées jouées ce jour-là. */
  rounds: string[];
  /**
   * Pour une journée : ses jours programmés qui suivent LEUR propre pool
   * (`YYYY-MM-DD`), à signaler au visiteur. Vide pour une date.
   */
  overriddenDates: string[];
  maps: PublicPoolMap[];
};

type MapRow = {
  map_name: string;
  map_type: string | null;
  image_url: string | null;
  order_index?: number | null;
  round_number?: number | null;
  play_date?: string | null;
};

type MatchRow = {
  round_number?: number | null;
  round_name?: string | null;
  scheduled_at?: string | null;
};

function byOrder(a: MapRow, b: MapRow): number {
  const ai = a.order_index;
  const bi = b.order_index;
  if (ai == null && bi != null) return 1;
  if (ai != null && bi == null) return -1;
  if (ai != null && bi != null && ai !== bi) return ai - bi;
  return a.map_name.localeCompare(b.map_name);
}

function toMap(row: MapRow): PublicPoolMap {
  return {
    name: row.map_name,
    type: row.map_type ?? null,
    image: row.image_url ?? null,
  };
}

/**
 * Construit les pools scopés à partir des lignes `tournament_maps` (activées,
 * hors pool par défaut) et du planning. Les lignes du pool par défaut
 * éventuellement présentes sont ignorées.
 */
export function buildScopedPools(
  mapRows: MapRow[],
  matches: MatchRow[]
): ScopedPool[] {
  const roundRows = new Map<number, MapRow[]>();
  const dateRows = new Map<string, MapRow[]>();
  for (const row of mapRows) {
    if (typeof row.round_number === 'number') {
      const bucket = roundRows.get(row.round_number) ?? [];
      bucket.push(row);
      roundRows.set(row.round_number, bucket);
    } else if (typeof row.play_date === 'string' && row.play_date) {
      const day = row.play_date.slice(0, 10);
      const bucket = dateRows.get(day) ?? [];
      bucket.push(row);
      dateRows.set(day, bucket);
    }
  }

  // Planning : libellé et jours de chaque journée, journées de chaque jour.
  const roundMeta = new Map<
    number,
    { label: string | null; days: Set<string> }
  >();
  const roundsByDay = new Map<string, Map<number, string>>();
  for (const m of matches) {
    const round = typeof m.round_number === 'number' ? m.round_number : null;
    const day = parisDayKey(m.scheduled_at ?? null);
    if (round !== null) {
      const meta = roundMeta.get(round) ?? { label: null, days: new Set() };
      if (!meta.label && m.round_name) meta.label = m.round_name;
      if (day) meta.days.add(day);
      roundMeta.set(round, meta);
    }
    if (day && round !== null) {
      const labels = roundsByDay.get(day) ?? new Map<number, string>();
      if (!labels.has(round)) labels.set(round, m.round_name || `J${round}`);
      roundsByDay.set(day, labels);
    }
  }

  const pools: ScopedPool[] = [];

  for (const [round, rows] of roundRows) {
    const meta = roundMeta.get(round);
    const remaining = [...(meta?.days ?? [])].filter((d) => !dateRows.has(d));
    // Journée dont CHAQUE jour a son propre pool : son pool ne s'applique à
    // aucun match. L'afficher laisserait croire qu'il compte.
    if (meta && meta.days.size > 0 && remaining.length === 0) continue;
    pools.push({
      key: `round:${round}`,
      kind: 'round',
      round,
      date: null,
      label: meta?.label || `J${round}`,
      dates: remaining.sort(),
      rounds: [],
      overriddenDates: [...(meta?.days ?? [])]
        .filter((d) => dateRows.has(d))
        .sort(),
      maps: [...rows].sort(byOrder).map(toMap),
    });
  }

  for (const [date, rows] of dateRows) {
    const labels = roundsByDay.get(date);
    pools.push({
      key: `date:${date}`,
      kind: 'date',
      round: null,
      date,
      label: null,
      dates: [date],
      rounds: labels
        ? [...labels.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l)
        : [],
      overriddenDates: [],
      maps: [...rows].sort(byOrder).map(toMap),
    });
  }

  // Chronologique sur le premier jour couvert. Une journée sans match daté
  // passe après, par numéro. À date égale, la journée précède le pool daté.
  return pools.sort((a, b) => {
    const da = a.dates[0];
    const db = b.dates[0];
    if (da && db && da !== db) return da.localeCompare(db);
    if (da && !db) return -1;
    if (!da && db) return 1;
    if (a.kind !== b.kind) return a.kind === 'round' ? -1 : 1;
    return (a.round ?? 0) - (b.round ?? 0);
  });
}

/**
 * Pool à ouvrir par défaut : celui de la PROCHAINE date de jeu (aujourd'hui
 * compris, jour calendaire à Paris).
 *
 * POURQUOI : la page s'ouvrait toujours sur « Tout le tournoi ». Le visiteur
 * qui vient voir le pool annoncé (« Map Pool 30/09 ») tombait sur les 30 cartes
 * du tournoi et devait deviner qu'une pastille en bout de ligne portait le bon.
 *
 * Règle : la plus proche date ≥ aujourd'hui couverte par au moins un pool. Si
 * UN seul pool la couvre (un pool daté, ou une seule journée ce jour-là), on
 * l'ouvre. Si plusieurs journées se partagent ce jour sans pool daté, aucune
 * n'est « le » pool du jour : on garde `null` (pool du tournoi) plutôt que de
 * choisir arbitrairement. Aucune date à venir → `null`. PURE.
 */
export function pickDefaultPoolKey(
  pools: ScopedPool[],
  today: string | null
): string | null {
  if (!today) return null;
  let nextDay: string | null = null;
  for (const pool of pools) {
    for (const day of pool.dates) {
      if (day >= today && (nextDay === null || day < nextDay)) nextDay = day;
    }
  }
  if (nextDay === null) return null;
  const covering = pools.filter((p) => p.dates.includes(nextDay as string));
  return covering.length === 1 ? covering[0]!.key : null;
}
