// pages/api/team/[id]/stats.ts
// API publique pour récupérer les stats d'une équipe :
// - stats globales (depuis team_stats_view si dispo)
// - stats par map (calculées à partir de games)
// - nombre de matchs joués (hors byes & annulés)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import type { MatchStatus } from '@/types/admin';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';

import { logger } from '../../../../utils/logger';
/* -----------------------------------------------------------
 * Types
 * ---------------------------------------------------------*/

type Team = {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
  country?: string | null;
};

/**
 * Aggregated global stats for a team, across all tournaments.
 *
 * The underlying `team_stats_view` exposes one row PER (team_id, tournament_id)
 * with the per-tournament columns `matches_played`, `wins`, `losses`, `draws`,
 * `maps_won`, `maps_lost`, `winrate`. We sum those across tournaments and
 * recompute the winrate so the shape below matches exactly what the front-end
 * (`pages/team/[slug]/stats.tsx`) reads.
 */
type TeamStatsView = {
  team_id: string;
  team_name: string;
  total_matches: number;
  wins: number;
  losses: number;
  draws: number;
  winrate: number | null; // 0–1, null if no match played
  total_maps_won: number;
  total_maps_lost: number;
};

/** Raw per-tournament row as exposed by `team_stats_view`. */
type TeamStatsViewRow = {
  matches_played: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  maps_won: number | null;
  maps_lost: number | null;
};

type MatchRow = {
  id: string;
  status: MatchStatus;
  is_bye: boolean | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
};

type GameRow = {
  match_id: string;
  map_name: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  duration_minutes: number | null;
  is_tiebreaker: boolean | null;
  went_overtime: boolean | null;
};

export type MapStat = {
  mapName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winrate: number; // 0–1
  roundsFor: number;
  roundsAgainst: number;
  diff: number;
  overtimes: number;
  tiebreakers: number;
  avgDuration: number | null; // average duration in minutes (null if no data)
};

export type TeamStatsApiResponse = {
  team: Team;
  stats: TeamStatsView | null;
  mapStats: MapStat[];
  matchesPlayed: number;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'team-stats'))
    return;
  const { id } = req.query;

  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid team id' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const tenantId = await resolveTenantIdForPublicRequestAsync(req);

    // 1) Vérifier que l'équipe existe
    const { data: team, error: tErr } = await supabaseAdmin
      .from('teams')
      .select('id, name, short_name, logo_url, country')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (tErr || !team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // 2) Stats globales depuis la vue team_stats_view (si elle existe).
    //    La vue expose UNE ligne par tournoi pour une équipe : on récupère
    //    toutes les lignes et on agrège across tournois (somme des compteurs,
    //    winrate recalculé).
    let stats: TeamStatsView | null = null;
    try {
      const { data: statsRows, error: sErr } = await supabaseAdmin
        .from('team_stats_view')
        .select('matches_played, wins, losses, draws, maps_won, maps_lost')
        .eq('team_id', id);

      if (sErr) {
        logger.error('team_stats_view error:', sErr);
      } else if (statsRows && statsRows.length > 0) {
        const rows = statsRows as TeamStatsViewRow[];
        const totalMatches = sum(rows, (r) => r.matches_played);
        const wins = sum(rows, (r) => r.wins);
        const losses = sum(rows, (r) => r.losses);
        const draws = sum(rows, (r) => r.draws);
        const totalMapsWon = sum(rows, (r) => r.maps_won);
        const totalMapsLost = sum(rows, (r) => r.maps_lost);

        stats = {
          team_id: team.id,
          team_name: team.name,
          total_matches: totalMatches,
          wins,
          losses,
          draws,
          winrate: totalMatches > 0 ? wins / totalMatches : null,
          total_maps_won: totalMapsWon,
          total_maps_lost: totalMapsLost,
        };
      }
    } catch (e) {
      logger.error('team_stats_view not available:', e);
    }

    // 3) Matches de l'équipe (hors annulés)
    const { data: matchesData, error: mErr } = await supabaseAdmin
      .from('matches')
      .select('id, status, is_bye, team1_id, team2_id, winner_team_id')
      .or(`team1_id.eq.${id},team2_id.eq.${id}`)
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelled');

    if (mErr) {
      logger.error('team stats matches error:', mErr);
    }

    const allMatches = ((matchesData || []) as MatchRow[]).filter(
      (m) => !m.is_bye
    );

    const matchIds = allMatches.map((m) => m.id);

    // 4) Games de ces matches (pour stats maps)
    let games: GameRow[] = [];
    if (matchIds.length > 0) {
      const { data: gamesData, error: gErr } = await supabaseAdmin
        .from('games')
        .select(
          'match_id, map_name, team1_score, team2_score, winner_team_id, duration_minutes, is_tiebreaker, went_overtime'
        )
        .eq('tenant_id', tenantId)
        .in('match_id', matchIds);

      if (gErr) {
        logger.error('team stats games error:', gErr);
      } else {
        games = (gamesData || []) as GameRow[];
      }
    }

    const mapStats = computeMapStatsForTeam(id as string, allMatches, games);
    const matchesPlayed = allMatches.length;

    const response: TeamStatsApiResponse = {
      team: team as Team,
      stats,
      mapStats,
      matchesPlayed,
    };

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=120'
    );
    return res.status(200).json(response);
  } catch (err: unknown) {
    logger.error('[/api/team/[id]/stats] internal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* -----------------------------------------------------------
 * Helpers stats globales
 * ---------------------------------------------------------*/

/** Somme une colonne numérique nullable sur un ensemble de lignes. */
function sum<T>(
  rows: T[],
  pick: (row: T) => number | null | undefined
): number {
  return rows.reduce((acc, row) => acc + (pick(row) ?? 0), 0);
}

/* -----------------------------------------------------------
 * Calcul des stats par map pour une équipe
 * ---------------------------------------------------------*/

function computeMapStatsForTeam(
  teamId: string,
  matches: MatchRow[],
  games: GameRow[]
): MapStat[] {
  const matchById = new Map<string, MatchRow>();
  matches.forEach((m) => matchById.set(m.id, m));

  type Agg = {
    games: number;
    wins: number;
    losses: number;
    roundsFor: number;
    roundsAgainst: number;
    overtimes: number;
    tiebreakers: number;
    totalDuration: number;
    durationCount: number;
  };

  const agg = new Map<string, Agg>();

  for (const g of games) {
    if (!g.map_name) continue;
    const match = matchById.get(g.match_id);
    if (!match) continue;

    const isTeam1 = match.team1_id === teamId;
    const isTeam2 = match.team2_id === teamId;
    if (!isTeam1 && !isTeam2) continue;

    const key = g.map_name;
    const entry = agg.get(key) || {
      games: 0,
      wins: 0,
      losses: 0,
      roundsFor: 0,
      roundsAgainst: 0,
      overtimes: 0,
      tiebreakers: 0,
      totalDuration: 0,
      durationCount: 0,
    };

    entry.games += 1;

    const s1 = g.team1_score ?? 0;
    const s2 = g.team2_score ?? 0;

    // Use winner_team_id if available, else fall back to score comparison
    if (g.winner_team_id) {
      if (g.winner_team_id === teamId) entry.wins += 1;
      else entry.losses += 1;
    } else {
      if (isTeam1) {
        if (s1 > s2) entry.wins += 1;
        else if (s1 < s2) entry.losses += 1;
      } else if (isTeam2) {
        if (s2 > s1) entry.wins += 1;
        else if (s2 < s1) entry.losses += 1;
      }
    }

    if (isTeam1) {
      entry.roundsFor += s1;
      entry.roundsAgainst += s2;
    } else {
      entry.roundsFor += s2;
      entry.roundsAgainst += s1;
    }

    if (g.went_overtime) entry.overtimes += 1;
    if (g.is_tiebreaker) entry.tiebreakers += 1;
    if (g.duration_minutes != null) {
      entry.totalDuration += g.duration_minutes;
      entry.durationCount += 1;
    }

    agg.set(key, entry);
  }

  const list: MapStat[] = Array.from(agg.entries()).map(([mapName, entry]) => ({
    mapName,
    gamesPlayed: entry.games,
    wins: entry.wins,
    losses: entry.losses,
    winrate: entry.games > 0 ? entry.wins / entry.games : 0,
    roundsFor: entry.roundsFor,
    roundsAgainst: entry.roundsAgainst,
    diff: entry.roundsFor - entry.roundsAgainst,
    overtimes: entry.overtimes,
    tiebreakers: entry.tiebreakers,
    avgDuration:
      entry.durationCount > 0
        ? Math.round(entry.totalDuration / entry.durationCount)
        : null,
  }));

  // tri par nombre de games desc, puis winrate desc
  list.sort((a, b) => {
    if (b.gamesPlayed !== a.gamesPlayed) {
      return b.gamesPlayed - a.gamesPlayed;
    }
    return b.winrate - a.winrate;
  });

  return list;
}
