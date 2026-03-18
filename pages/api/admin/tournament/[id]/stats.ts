// pages/api/admin/tournament/[id]/stats.ts
// Admin: statistiques d'un tournoi
// - GET : stats globales, classement équipes, stats maps, matchs serrés

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import type { MatchStatus } from '@/types/admin';

type MatchRow = {
  id: string;
  tournament_id: string;
  stage_id: string | null;
  status: MatchStatus;
  is_bye: boolean | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  round_number: number | null;
  stage?: { name: string } | null;
};

type TeamMini = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type GameRow = {
  match_id: string;
  map_name: string | null;
  team1_score: number | null;
  team2_score: number | null;
  is_tiebreaker: boolean | null;
  went_overtime: boolean | null;
};

// Rôle minimum : manager
export default withStaffRoute(handler, 'manager');

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament id' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tournamentId = String(id);

  try {
    // 1) Vérifier que le tournoi existe
    const { data: tournament, error: tErr } = await supabaseAdmin
      .from('tournaments')
      .select('id, name, slug')
      .eq('id', tournamentId)
      .maybeSingle();

    if (tErr) {
      console.error('admin stats tournament error:', tErr);
      return res.status(500).json({ error: 'Failed to fetch tournament' });
    }

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // 2) Récupérer les matchs du tournoi
    const { data: matchesData, error: mErr } = await supabaseAdmin
      .from('matches')
      .select(
        `id, tournament_id, stage_id, status, is_bye, team1_id, team2_id,
         team1_score, team2_score, winner_team_id, round_number,
         stage:stage_id(name)`
      )
      .eq('tournament_id', tournamentId)
      .neq('status', 'cancelled');

    if (mErr) {
      console.error('admin stats matches error:', mErr);
      return res.status(500).json({ error: 'Failed to fetch matches' });
    }

    const allMatches = (matchesData || []) as unknown as MatchRow[];
    const realMatches = allMatches.filter((m) => !m.is_bye);

    // 3) Récupérer les équipes du tournoi
    const { data: teamsData, error: teErr } = await supabaseAdmin
      .from('tournament_teams')
      .select('team:team_id(id, name, short_name, logo_url)')
      .eq('tournament_id', tournamentId);

    if (teErr) {
      console.error('admin stats teams error:', teErr);
    }

    const teams: TeamMini[] = ((teamsData || []) as any[])
      .map((t) => t.team)
      .filter(Boolean);

    const teamsMap = new Map<string, TeamMini>();
    teams.forEach((t) => teamsMap.set(t.id, t));

    // 4) Récupérer les games pour stats maps
    const matchIds = realMatches.map((m) => m.id);
    let games: GameRow[] = [];

    if (matchIds.length > 0) {
      const { data: gamesData, error: gErr } = await supabaseAdmin
        .from('games')
        .select(
          'match_id, map_name, team1_score, team2_score, is_tiebreaker, went_overtime'
        )
        .in('match_id', matchIds);

      if (gErr) {
        console.error('admin stats games error:', gErr);
      } else {
        games = (gamesData || []) as GameRow[];
      }
    }

    // 5) Calculs des stats

    // Overview
    const finishedMatches = realMatches.filter((m) => m.status === 'finished');
    const pendingMatches = realMatches.filter((m) => m.status === 'pending');
    const ongoingMatches = realMatches.filter((m) => m.status === 'ongoing');
    const totalOvertimes = games.filter((g) => g.went_overtime).length;

    const overview = {
      totalMatches: realMatches.length,
      finishedMatches: finishedMatches.length,
      pendingMatches: pendingMatches.length,
      ongoingMatches: ongoingMatches.length,
      totalTeams: teams.length,
      totalGames: games.length,
      totalOvertimes,
    };

    // Team stats
    const teamStats = computeTeamStats(finishedMatches, games, teamsMap);

    // Map stats
    const mapStats = computeMapStats(games);

    // Closest matches (différence de score minimale)
    const closestMatches = computeClosestMatches(finishedMatches, teamsMap);

    return res.status(200).json({
      tournament,
      overview,
      teamStats,
      mapStats,
      closestMatches,
    });
  } catch (err: unknown) {
    console.error('[/api/admin/tournament/[id]/stats] internal error:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}

/* -----------------------------------------------------------
 * Calcul des stats par équipe
 * ---------------------------------------------------------*/

function computeTeamStats(
  matches: MatchRow[],
  games: GameRow[],
  teamsMap: Map<string, TeamMini>
) {
  type TeamAgg = {
    wins: number;
    losses: number;
    mapsWon: number;
    mapsLost: number;
  };

  const agg = new Map<string, TeamAgg>();

  // Init pour toutes les équipes connues
  teamsMap.forEach((_, teamId) => {
    agg.set(teamId, { wins: 0, losses: 0, mapsWon: 0, mapsLost: 0 });
  });

  // Comptage wins/losses
  for (const m of matches) {
    if (!m.winner_team_id) continue;

    const winnerId = m.winner_team_id;
    const loserId =
      m.team1_id === winnerId ? m.team2_id : m.team1_id;

    if (winnerId && agg.has(winnerId)) {
      const entry = agg.get(winnerId)!;
      entry.wins += 1;
    }

    if (loserId && agg.has(loserId)) {
      const entry = agg.get(loserId)!;
      entry.losses += 1;
    }
  }

  // Comptage maps (depuis games)
  const matchById = new Map<string, MatchRow>();
  matches.forEach((m) => matchById.set(m.id, m));

  for (const g of games) {
    const match = matchById.get(g.match_id);
    if (!match) continue;

    const s1 = g.team1_score ?? 0;
    const s2 = g.team2_score ?? 0;

    if (s1 > s2 && match.team1_id) {
      const e = agg.get(match.team1_id);
      if (e) e.mapsWon += 1;
      const e2 = agg.get(match.team2_id || '');
      if (e2) e2.mapsLost += 1;
    } else if (s2 > s1 && match.team2_id) {
      const e = agg.get(match.team2_id);
      if (e) e.mapsWon += 1;
      const e1 = agg.get(match.team1_id || '');
      if (e1) e1.mapsLost += 1;
    }
  }

  // Construire le tableau final
  const result: {
    team: TeamMini;
    matchesPlayed: number;
    wins: number;
    losses: number;
    winrate: number;
    mapsWon: number;
    mapsLost: number;
    mapDiff: number;
  }[] = [];

  agg.forEach((entry, teamId) => {
    const team = teamsMap.get(teamId);
    if (!team) return;

    const matchesPlayed = entry.wins + entry.losses;
    if (matchesPlayed === 0) return; // ignorer équipes sans match

    const winrate = matchesPlayed > 0 ? entry.wins / matchesPlayed : 0;

    result.push({
      team,
      matchesPlayed,
      wins: entry.wins,
      losses: entry.losses,
      winrate,
      mapsWon: entry.mapsWon,
      mapsLost: entry.mapsLost,
      mapDiff: entry.mapsWon - entry.mapsLost,
    });
  });

  // Tri par winrate desc, puis par mapDiff desc
  result.sort((a, b) => {
    if (b.winrate !== a.winrate) return b.winrate - a.winrate;
    if (b.mapDiff !== a.mapDiff) return b.mapDiff - a.mapDiff;
    return b.wins - a.wins;
  });

  return result;
}

/* -----------------------------------------------------------
 * Calcul des stats par map
 * ---------------------------------------------------------*/

function computeMapStats(games: GameRow[]) {
  type MapAgg = {
    gamesPlayed: number;
    totalRounds: number;
    overtimes: number;
    tiebreakers: number;
  };

  const agg = new Map<string, MapAgg>();

  for (const g of games) {
    if (!g.map_name) continue;

    const key = g.map_name;
    const entry = agg.get(key) || {
      gamesPlayed: 0,
      totalRounds: 0,
      overtimes: 0,
      tiebreakers: 0,
    };

    entry.gamesPlayed += 1;
    entry.totalRounds += (g.team1_score ?? 0) + (g.team2_score ?? 0);
    if (g.went_overtime) entry.overtimes += 1;
    if (g.is_tiebreaker) entry.tiebreakers += 1;

    agg.set(key, entry);
  }

  const totalGames = games.filter((g) => g.map_name).length;

  const result: {
    mapName: string;
    gamesPlayed: number;
    totalRounds: number;
    avgRounds: number;
    overtimes: number;
    tiebreakers: number;
    usageRate: number;
  }[] = [];

  agg.forEach((entry, mapName) => {
    result.push({
      mapName,
      gamesPlayed: entry.gamesPlayed,
      totalRounds: entry.totalRounds,
      avgRounds: entry.gamesPlayed > 0 ? entry.totalRounds / entry.gamesPlayed : 0,
      overtimes: entry.overtimes,
      tiebreakers: entry.tiebreakers,
      usageRate: totalGames > 0 ? entry.gamesPlayed / totalGames : 0,
    });
  });

  // Tri par gamesPlayed desc
  result.sort((a, b) => b.gamesPlayed - a.gamesPlayed);

  return result;
}

/* -----------------------------------------------------------
 * Matchs les plus serrés
 * ---------------------------------------------------------*/

function computeClosestMatches(
  matches: MatchRow[],
  teamsMap: Map<string, TeamMini>
) {
  // Filtrer les matchs avec scores définis
  const scored = matches.filter(
    (m) =>
      typeof m.team1_score === 'number' &&
      typeof m.team2_score === 'number' &&
      m.team1_id &&
      m.team2_id
  );

  // Calculer la différence de score
  const withDiff = scored.map((m) => ({
    ...m,
    diff: Math.abs((m.team1_score ?? 0) - (m.team2_score ?? 0)),
  }));

  // Trier par différence croissante, puis par score total décroissant (matchs intenses)
  withDiff.sort((a, b) => {
    if (a.diff !== b.diff) return a.diff - b.diff;
    const totalA = (a.team1_score ?? 0) + (a.team2_score ?? 0);
    const totalB = (b.team1_score ?? 0) + (b.team2_score ?? 0);
    return totalB - totalA;
  });

  // Prendre les 6 premiers
  const top = withDiff.slice(0, 6);

  return top.map((m) => ({
    id: m.id,
    team1: teamsMap.get(m.team1_id || '') || null,
    team2: teamsMap.get(m.team2_id || '') || null,
    team1_score: m.team1_score ?? 0,
    team2_score: m.team2_score ?? 0,
    winner_team_id: m.winner_team_id,
    stage_name: (m.stage as any)?.name || null,
    round_number: m.round_number,
  }));
}
