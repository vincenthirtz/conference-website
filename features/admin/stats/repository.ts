// features/admin/stats/repository.ts — vues de statistiques.
//
// ⚠ Ni `team_stats_view` ni `map_stats_view` ne portent de `tenant_id`
// (TODO S5c+ hérité). Les équipes sont bornées aux tournois du tenant ; les
// maps restent un agrégat GLOBAL, comme avant la migration : il faudra
// augmenter la vue avant le multi-tenant réel.

import type { AdminDb } from '@/utils/admin/serviceContext';
import { MAP_STATS_VIEW_COLUMNS, TEAM_STATS_VIEW_COLUMNS } from './schemas';

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

export async function listMapStats(
  db: AdminDb,
  f: {
    minMatches: number;
    sortBy: string;
    ascending: boolean;
    offset: number;
    limit: number;
    search: string | null;
  }
) {
  let query = db
    .from('map_stats_view')
    .select(MAP_STATS_VIEW_COLUMNS, { count: 'exact' })
    .gte('games_played', f.minMatches)
    .order(f.sortBy as 'games_played', {
      ascending: f.ascending,
      nullsFirst: false,
    })
    .range(f.offset, f.offset + f.limit - 1);
  if (f.search) query = query.ilike('map_name', `%${f.search}%`);
  const { data, error, count } = await query;
  return { rows: data ?? [], count, error };
}
