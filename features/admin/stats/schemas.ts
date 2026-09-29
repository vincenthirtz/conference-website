// features/admin/stats/schemas.ts — statistiques staff par équipe et par map
// (`/api/admin/stats/teams`, `/api/admin/stats/maps`), JSON ou CSV.

import { looseQuery } from '../../../utils/admin/pathParams';

// Filtres nommés pour la spec, normalisés par le service. zod seul, imports
// relatifs : schémas référencés par la spec OpenAPI.
const COMMON = [
  'limit',
  'offset',
  'minMatches',
  'sortBy',
  'sortDir',
  'search',
  'export',
] as const;

export const TeamStatsQuery = looseQuery([...COMMON, 'tournamentId']);
export const MapStatsQuery = looseQuery(COMMON);

export const TEAM_STATS_VIEW_COLUMNS = `
      team_id,
      team_name,
      team_short_name,
      team_logo_url,
      tournament_id,
      tournament_name,
      tournament_slug,
      matches_played,
      wins,
      losses,
      draws,
      maps_won,
      maps_lost,
      map_ties,
      winrate,
      map_winrate,
      points,
      last_match_at
    ` as const;

export const MAP_STATS_VIEW_COLUMNS = `
      map_name,
      games_played,
      wins_team1,
      wins_team2,
      total_rounds,
      diff_team1,
      diff_team2
    ` as const;

export type TeamStatsRow = {
  team_id: string;
  team_name: string | null;
  team_short_name: string | null;
  team_logo_url: string | null;
  team?: {
    id: string | null;
    name: string | null;
    short_name: string | null;
    logo_url: string | null;
  };
  tournament_id: string | null;
  tournament_name: string | null;
  tournament_slug: string | null;
  tournament?: {
    id: string | null;
    name: string | null;
    slug: string | null;
  } | null;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  maps_won: number;
  maps_lost: number;
  map_ties: number | null;
  winrate: number | null;
  map_winrate: number | null;
  points: number | null;
  last_match_at: string | null;
};

export type MapStatsRow = {
  map_name: string;
  tournament_id: string | null;
  tournament: {
    id: string | null;
    name: string | null;
    slug: string | null;
  } | null;
  matches_played: number;
  matches_won_attack: number | null;
  matches_won_defense: number | null;
  rounds_played: number | null;
  rounds_won_attack: number | null;
  rounds_won_defense: number | null;
  match_winrate_attack: number | null;
  match_winrate_defense: number | null;
  round_winrate_attack: number | null;
  round_winrate_defense: number | null;
  avg_total_rounds: number | null;
  pick_rate: number | null;
  ban_rate: number | null;
};

export type StatsPage<R> = { stats: R[]; total: number | null };
