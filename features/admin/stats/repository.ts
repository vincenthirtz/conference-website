// features/admin/stats/repository.ts — vues de statistiques.
//
// `team_stats_view` ne porte pas de `tenant_id` : les équipes sont bornées aux
// tournois du tenant. `map_stats_view` en porte un depuis
// database/migrations/map_stats_view_tenant.sql (lot A10) — et TANT QUE cette
// migration n'est pas appliquée, la lecture retombe sur un calcul direct depuis
// `games`, filtré par tenant. Jamais d'agrégat plateforme pour un espace.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminDb } from '@/utils/admin/serviceContext';
import { MAP_STATS_VIEW_COLUMNS, TEAM_STATS_VIEW_COLUMNS } from './schemas';

/** `tenant_id` sur la vue n'existe pas encore dans le type généré. */
function untyped(db: AdminDb): SupabaseClient {
  return db as unknown as SupabaseClient;
}

export async function listTenantTournamentIds(db: AdminDb, tenantId: string) {
  const { data } = await db
    .from('tournaments')
    .select('id')
    .eq('tenant_id', tenantId);
  return (data ?? []).map((t) => t.id);
}

export async function listTeamStats(
  db: AdminDb,
  f: {
    minMatches: number;
    sortBy: string;
    ascending: boolean;
    offset: number;
    limit: number;
    tournamentIds: string[];
    tournamentId: string | null;
    searchSafe: string | null;
  }
) {
  let query = db
    .from('team_stats_view')
    .select(TEAM_STATS_VIEW_COLUMNS, { count: 'exact' })
    .gte('matches_played', f.minMatches)
    .order(f.sortBy as 'winrate', { ascending: f.ascending })
    .range(f.offset, f.offset + f.limit - 1);
  query = f.tournamentId
    ? query.eq('tournament_id', f.tournamentId)
    : query.in('tournament_id', f.tournamentIds);
  if (f.searchSafe) {
    query = query.or(
      `team_name.ilike.%${f.searchSafe}%,team_short_name.ilike.%${f.searchSafe}%`
    );
  }
  const { data, error, count } = await query;
  return { rows: data ?? [], count, error };
}

export type MapStatsViewRow = {
  map_name: string | null;
  games_played: number | null;
  wins_team1: number | null;
  wins_team2: number | null;
  total_rounds: number | null;
  diff_team1: number | null;
  diff_team2: number | null;
};

export type MapStatsFilters = {
  tenantId: string;
  minMatches: number;
  sortBy: string;
  ascending: boolean;
  offset: number;
  limit: number;
  search: string | null;
};

type DbError = { code?: string; message?: string } | null;

/**
 * La vue n'a pas encore sa colonne `tenant_id` (migration non appliquée) :
 * Postgres répond 42703, PostgREST peut aussi le dire en toutes lettres.
 */
export function isMissingTenantColumn(error: DbError): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;
  const msg = error.message ?? '';
  return /tenant_id/.test(msg) && /does not exist|could not find/i.test(msg);
}

/**
 * Stats de maps DE L'ESPACE `f.tenantId`. `source` dit d'où elles viennent :
 * `games` = repli, la vue n'est pas encore migrée.
 */
export async function listMapStats(db: AdminDb, f: MapStatsFilters) {
  let query = untyped(db)
    .from('map_stats_view')
    .select(MAP_STATS_VIEW_COLUMNS, { count: 'exact' })
    .eq('tenant_id', f.tenantId)
    .gte('games_played', f.minMatches)
    .order(f.sortBy, { ascending: f.ascending, nullsFirst: false })
    .range(f.offset, f.offset + f.limit - 1);
  if (f.search) query = query.ilike('map_name', `%${f.search}%`);
  const { data, error, count } = await query;
  if (isMissingTenantColumn(error)) {
    return {
      ...(await listMapStatsFromGames(db, f)),
      source: 'games' as const,
    };
  }
  return {
    rows: (data ?? []) as MapStatsViewRow[],
    count,
    error: error as DbError,
    source: 'view' as const,
  };
}

const GAMES_PAGE = 1000;
/** Garde-fou : au-delà, l'agrégat serait partiel — signalé par `error`. */
const GAMES_MAX_PAGES = 50;

/**
 * Repli : même agrégat que la vue (cf. map_stats_view_tenant.sql), calculé à
 * partir des `games` de l'espace. Filtre, tri et pagination en mémoire.
 */
export async function listMapStatsFromGames(db: AdminDb, f: MapStatsFilters) {
  type GameRow = {
    map_name: string | null;
    team1_score: number | null;
    team2_score: number | null;
  };
  const games: GameRow[] = [];
  for (let page = 0; ; page++) {
    if (page >= GAMES_MAX_PAGES) {
      return {
        rows: [] as MapStatsViewRow[],
        count: null,
        error: { message: 'map stats fallback: too many games' } as DbError,
      };
    }
    const from = page * GAMES_PAGE;
    const { data, error } = await untyped(db)
      .from('games')
      .select('map_name, team1_score, team2_score')
      .eq('tenant_id', f.tenantId)
      .order('id', { ascending: true })
      .range(from, from + GAMES_PAGE - 1);
    if (error) {
      return {
        rows: [] as MapStatsViewRow[],
        count: null,
        error: error as DbError,
      };
    }
    const batch = (data ?? []) as GameRow[];
    games.push(...batch);
    if (batch.length < GAMES_PAGE) break;
  }

  const rows = aggregateMapStats(games)
    .filter((r) => (r.games_played ?? 0) >= f.minMatches)
    .filter(
      (r) =>
        !f.search ||
        (r.map_name ?? '').toLowerCase().includes(f.search.toLowerCase())
    );
  sortMapStats(rows, f.sortBy, f.ascending);
  return {
    rows: rows.slice(f.offset, f.offset + f.limit),
    count: rows.length,
    error: null as DbError,
  };
}

/** Agrégat SQL de la vue, reproduit (sum() ignore les NULL, rend NULL si tout l'est). */
export function aggregateMapStats(
  games: {
    map_name: string | null;
    team1_score: number | null;
    team2_score: number | null;
  }[]
): MapStatsViewRow[] {
  const byMap = new Map<string | null, MapStatsViewRow>();
  const addNullable = (acc: number | null, v: number | null) =>
    v === null ? acc : (acc ?? 0) + v;
  for (const g of games) {
    const row = byMap.get(g.map_name) ?? {
      map_name: g.map_name,
      games_played: 0,
      wins_team1: 0,
      wins_team2: 0,
      total_rounds: null,
      diff_team1: null,
      diff_team2: null,
    };
    const t1 = g.team1_score;
    const t2 = g.team2_score;
    const both = t1 !== null && t2 !== null;
    row.games_played = (row.games_played ?? 0) + 1;
    if (both && t1 > t2) row.wins_team1 = (row.wins_team1 ?? 0) + 1;
    if (both && t2 > t1) row.wins_team2 = (row.wins_team2 ?? 0) + 1;
    row.total_rounds = addNullable(row.total_rounds, both ? t1 + t2 : null);
    row.diff_team1 = addNullable(row.diff_team1, both ? t1 - t2 : null);
    row.diff_team2 = addNullable(row.diff_team2, both ? t2 - t1 : null);
    byMap.set(g.map_name, row);
  }
  return [...byMap.values()];
}

function sortMapStats(
  rows: MapStatsViewRow[],
  sortBy: string,
  ascending: boolean
) {
  const key = sortBy as keyof MapStatsViewRow;
  rows.sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    // nullsFirst: false, comme la requête sur la vue.
    if (va === null || va === undefined) return vb === null ? 0 : 1;
    if (vb === null || vb === undefined) return -1;
    const cmp =
      typeof va === 'string'
        ? va.localeCompare(String(vb))
        : (va as number) - (vb as number);
    return ascending ? cmp : -cmp;
  });
}
