// features/admin/stats/service.ts — statistiques staff par équipe et par map,
// et leur export CSV (en-têtes et colonnes inchangés).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { AdminError } from '@/utils/admin/errors';
import { escapePostgrestValue, sanitizeSearch } from '@/utils/apiHelpers';
import * as repo from './repository';
import type { MapStatsRow, StatsPage, TeamStatsRow } from './schemas';

function pageOf(query: Record<string, unknown>) {
  const { limit = '100', offset = '0', minMatches = '0' } = query;
  return {
    limit: Math.max(1, Math.min(1000, Number(limit) || 100)),
    offset: Math.max(0, Number(offset) || 0),
    minMatches: Math.max(0, Number(minMatches) || 0),
  };
}

function sortDirOf(value: unknown): 'asc' | 'desc' {
  return value === 'asc' ? 'asc' : 'desc';
}

/* ---------------------------------------------------------------------------
 * Équipes
 * ------------------------------------------------------------------------ */

const TEAM_SORTABLE_COLUMNS = new Set([
  'winrate',
  'map_winrate',
  'matches_played',
  'wins',
  'losses',
  'maps_won',
  'maps_lost',
  'points',
  'last_match_at',
  'team_name',
]);

function teamSortBy(value: unknown): string {
  if (typeof value !== 'string' || !value) return 'winrate';
  const key = value.toLowerCase();
  return TEAM_SORTABLE_COLUMNS.has(key) ? key : 'winrate';
}

/**
 * `csv: false` quand la réponse est une page vide de garde (tournoi d'un
 * autre tenant, tenant sans tournoi) : elle part en JSON même si `export=csv`
 * était demandé, comme avant.
 */
export async function getTeamStats(
  ctx: ServiceContext,
  query: Record<string, unknown>
): Promise<{ page: StatsPage<TeamStatsRow>; csv: boolean }> {
  // La vue n'a pas de tenant_id : on borne les tournament_id éligibles aux
  // tournois du tenant courant pour éviter la fuite cross-tenant.
  const tenantTournamentIds = await repo.listTenantTournamentIds(
    ctx.db,
    ctx.tenantId
  );
  const { limit, offset, minMatches } = pageOf(query);
  const search = sanitizeSearch(query.search as string | string[] | undefined);

  const { tournamentId } = query;
  let explicitTournament: string | null = null;
  if (tournamentId && typeof tournamentId === 'string') {
    // Un tournamentId d'un autre tenant est refusé en silence.
    if (!tenantTournamentIds.includes(tournamentId)) {
      return { page: { stats: [], total: 0 }, csv: false };
    }
    explicitTournament = tournamentId;
  } else if (tenantTournamentIds.length === 0) {
    return { page: { stats: [], total: 0 }, csv: false };
  }

  const { rows, count, error } = await repo.listTeamStats(ctx.db, {
    minMatches,
    sortBy: teamSortBy(query.sortBy),
    ascending: sortDirOf(query.sortDir) === 'asc',
    offset,
    limit,
    tournamentIds: tenantTournamentIds,
    tournamentId: explicitTournament,
    searchSafe: search ? escapePostgrestValue(search) : null,
  });
  if (error) {
    ctx.logger.error('[/api/admin/stats/teams] fetch error', error);
    throw new AdminError(500, 'internal', 'Failed to load team stats.');
  }

  const stats: TeamStatsRow[] = rows.map((row) => ({
    team_id: row.team_id as string,
    team_name: row.team_name,
    team_short_name: row.team_short_name,
    team_logo_url: row.team_logo_url,
    team: {
      id: row.team_id,
      name: row.team_name,
      short_name: row.team_short_name,
      logo_url: row.team_logo_url,
    },
    tournament_id: row.tournament_id,
    tournament_name: row.tournament_name,
    tournament_slug: row.tournament_slug,
    tournament: row.tournament_id
      ? {
          id: row.tournament_id,
          name: row.tournament_name,
          slug: row.tournament_slug,
        }
      : null,
    matches_played: row.matches_played ?? 0,
    wins: row.wins ?? 0,
    losses: row.losses ?? 0,
    draws: row.draws ?? 0,
    maps_won: row.maps_won ?? 0,
    maps_lost: row.maps_lost ?? 0,
    map_ties: row.map_ties ?? 0,
    winrate: row.winrate,
    map_winrate: row.map_winrate,
    points: row.points ?? null,
    last_match_at: row.last_match_at ?? null,
  }));

  return { page: { stats, total: count ?? null }, csv: true };
}

export function teamStatsCsv(stats: TeamStatsRow[]): string {
  const header = [
    'team_name',
    'team_short_name',
    'tournament',
    'matches_played',
    'wins',
    'losses',
    'draws',
    'maps_won',
    'maps_lost',
    'map_ties',
    'winrate',
    'map_winrate',
    'points',
    'last_match_at',
  ];
  const rows = stats.map((s) =>
    [
      s.team?.name ?? '',
      s.team?.short_name ?? '',
      s.tournament?.name ?? '',
      s.matches_played ?? 0,
      s.wins ?? 0,
      s.losses ?? 0,
      s.draws ?? 0,
      s.maps_won ?? 0,
      s.maps_lost ?? 0,
      s.map_ties ?? 0,
      s.winrate ?? '',
      s.map_winrate ?? '',
      s.points ?? '',
      s.last_match_at ?? '',
    ].join(',')
  );
  return [header.join(','), ...rows].join('\n');
}

/* ---------------------------------------------------------------------------
 * Maps (agrégat global de la vue, cf. repository)
 * ------------------------------------------------------------------------ */

// Colonnes de tri exposées → colonnes de la vue.
const MAP_SORT_COLUMN_MAP: Record<string, string> = {
  pick_rate: 'games_played',
  ban_rate: 'games_played',
  matches_played: 'games_played',
  rounds_played: 'total_rounds',
  match_winrate_attack: 'wins_team1',
  match_winrate_defense: 'wins_team2',
  avg_total_rounds: 'total_rounds',
  map_name: 'map_name',
};

function mapSortBy(value: unknown): string {
  if (typeof value !== 'string' || !value) return 'games_played';
  const key = value.toLowerCase();
  return MAP_SORT_COLUMN_MAP[key] ?? 'games_played';
}

export async function getMapStats(
  ctx: ServiceContext,
  query: Record<string, unknown>
): Promise<StatsPage<MapStatsRow>> {
  const { limit, offset, minMatches } = pageOf(query);
  const search = sanitizeSearch(query.search as string | string[] | undefined);

  const { rows, count, error } = await repo.listMapStats(ctx.db, {
    minMatches,
    sortBy: mapSortBy(query.sortBy),
    ascending: sortDirOf(query.sortDir) === 'asc',
    offset,
    limit,
    search: search || null,
  });
  if (error) {
    ctx.logger.error('[/api/admin/stats/maps] fetch error', error);
    throw new AdminError(500, 'internal', 'Failed to load map stats.');
  }

  // Vue → format attendu par l'écran ; winrates calculés sur ce qu'elle rend.
  const stats: MapStatsRow[] = rows.map((row) => {
    const gamesPlayed = row.games_played ?? 0;
    const winsTeam1 = row.wins_team1 ?? 0;
    const winsTeam2 = row.wins_team2 ?? 0;
    const totalGames = winsTeam1 + winsTeam2;
    return {
      map_name: row.map_name as string,
      tournament_id: null,
      tournament: null,
      matches_played: gamesPlayed,
      matches_won_attack: winsTeam1,
      matches_won_defense: winsTeam2,
      rounds_played: row.total_rounds ?? null,
      rounds_won_attack: null,
      rounds_won_defense: null,
      match_winrate_attack: totalGames > 0 ? winsTeam1 / totalGames : null,
      match_winrate_defense: totalGames > 0 ? winsTeam2 / totalGames : null,
      round_winrate_attack: null,
      round_winrate_defense: null,
      avg_total_rounds:
        gamesPlayed > 0 ? (row.total_rounds ?? 0) / gamesPlayed : null,
      pick_rate: null,
      ban_rate: null,
    };
  });

  return { stats, total: count ?? null };
}

export function mapStatsCsv(stats: MapStatsRow[]): string {
  const header = [
    'map_name',
    'tournament',
    'matches_played',
    'pick_rate',
    'ban_rate',
    'match_winrate_attack',
    'match_winrate_defense',
    'rounds_played',
    'round_winrate_attack',
    'round_winrate_defense',
    'avg_total_rounds',
  ];
  const rows = stats.map((s) =>
    [
      s.map_name ?? '',
      s.tournament?.name ?? '',
      s.matches_played ?? 0,
      s.pick_rate ?? '',
      s.ban_rate ?? '',
      s.match_winrate_attack ?? '',
      s.match_winrate_defense ?? '',
      s.rounds_played ?? '',
      s.round_winrate_attack ?? '',
      s.round_winrate_defense ?? '',
      s.avg_total_rounds ?? '',
    ].join(',')
  );
  return [header.join(','), ...rows].join('\n');
}
