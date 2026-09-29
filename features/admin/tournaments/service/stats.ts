// features/admin/tournaments/service/stats.ts — statistiques d'un tournoi
// (GET …/stats) : vue d'ensemble, classement des équipes, maps, matchs serrés.
// Calculs repris à l'identique de la route d'origine.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { MatchStatus } from '@/types/admin';
import { oneRelation, type Relation } from '@/utils/supabase/relation';
import * as tRepo from '../repository/tournaments';
import * as repo from '../repository/insights';
import { fail } from './common';

type MatchRow = {
  id: string;
  status: MatchStatus;
  is_bye: boolean | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  round_number: number | null;
  stage?: unknown;
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

export async function tournamentStats(
  ctx: ServiceContext,
  tournamentId: string
) {
  const { data: t, error: tErr } = await tRepo.findTournament(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (tErr) {
    ctx.logger.error('admin stats tournament error:', tErr);
    fail(500, 'Failed to fetch tournament');
  }
  if (!t) fail(404, 'Tournament not found');
  const tournament = { id: t.id, name: t.name, slug: t.slug };

  const { data: matchesData, error: mErr } = await repo.matchesForStats(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (mErr) {
    ctx.logger.error('admin stats matches error:', mErr);
    fail(500, 'Failed to fetch matches');
  }
  const realMatches = ((matchesData ?? []) as unknown as MatchRow[]).filter(
    (m) => !m.is_bye
  );

  const { data: teamsData, error: teErr } = await repo.entrantCards(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (teErr) ctx.logger.error('admin stats teams error:', teErr);
  const teams = (teamsData ?? [])
    .map((row) => oneRelation(row.team as Relation<TeamMini>))
    .filter((x): x is TeamMini => x !== null);
  const teamsMap = new Map(teams.map((x) => [x.id, x]));

  let games: GameRow[] = [];
  const matchIds = realMatches.map((m) => m.id);
  if (matchIds.length > 0) {
    const { data, error } = await repo.gamesForStats(
      ctx.db,
      ctx.tenantId,
      matchIds
    );
    if (error) ctx.logger.error('admin stats games error:', error);
    else games = (data ?? []) as GameRow[];
  }

  const finished = realMatches.filter((m) => m.status === 'finished');
  return {
    tournament,
    overview: {
      totalMatches: realMatches.length,
      finishedMatches: finished.length,
      pendingMatches: realMatches.filter((m) => m.status === 'pending').length,
      ongoingMatches: realMatches.filter((m) => m.status === 'ongoing').length,
      totalTeams: teams.length,
      totalGames: games.length,
      totalOvertimes: games.filter((g) => g.went_overtime).length,
    },
    teamStats: computeTeamStats(finished, games, teamsMap),
    mapStats: computeMapStats(games),
    closestMatches: computeClosestMatches(finished, teamsMap),
  };
}

function computeTeamStats(
  matches: MatchRow[],
  games: GameRow[],
  teamsMap: Map<string, TeamMini>
) {
  const agg = new Map<
    string,
    { wins: number; losses: number; mapsWon: number; mapsLost: number }
  >();
  teamsMap.forEach((_, id) =>
    agg.set(id, { wins: 0, losses: 0, mapsWon: 0, mapsLost: 0 })
  );

  for (const m of matches) {
    if (!m.winner_team_id) continue;
    const winnerId = m.winner_team_id;
    const loserId = m.team1_id === winnerId ? m.team2_id : m.team1_id;
    const w = agg.get(winnerId);
    if (w) w.wins += 1;
    const l = loserId ? agg.get(loserId) : undefined;
    if (l) l.losses += 1;
  }

  const matchById = new Map(matches.map((m) => [m.id, m]));
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
    if (matchesPlayed === 0) return; // équipes sans match ignorées
    result.push({
      team,
      matchesPlayed,
      wins: entry.wins,
      losses: entry.losses,
      winrate: entry.wins / matchesPlayed,
      mapsWon: entry.mapsWon,
      mapsLost: entry.mapsLost,
      mapDiff: entry.mapsWon - entry.mapsLost,
    });
  });
  // Winrate desc, puis mapDiff desc, puis victoires.
  result.sort((a, b) => {
    if (b.winrate !== a.winrate) return b.winrate - a.winrate;
    if (b.mapDiff !== a.mapDiff) return b.mapDiff - a.mapDiff;
    return b.wins - a.wins;
  });
  return result;
}

function computeMapStats(games: GameRow[]) {
  const agg = new Map<
    string,
    {
      gamesPlayed: number;
      totalRounds: number;
      overtimes: number;
      tiebreakers: number;
    }
  >();
  for (const g of games) {
    if (!g.map_name) continue;
    const entry = agg.get(g.map_name) || {
      gamesPlayed: 0,
      totalRounds: 0,
      overtimes: 0,
      tiebreakers: 0,
    };
    entry.gamesPlayed += 1;
    entry.totalRounds += (g.team1_score ?? 0) + (g.team2_score ?? 0);
    if (g.went_overtime) entry.overtimes += 1;
    if (g.is_tiebreaker) entry.tiebreakers += 1;
    agg.set(g.map_name, entry);
  }
  const totalGames = games.filter((g) => g.map_name).length;
  const result = [...agg.entries()].map(([mapName, e]) => ({
    mapName,
    gamesPlayed: e.gamesPlayed,
    totalRounds: e.totalRounds,
    avgRounds: e.gamesPlayed > 0 ? e.totalRounds / e.gamesPlayed : 0,
    overtimes: e.overtimes,
    tiebreakers: e.tiebreakers,
    usageRate: totalGames > 0 ? e.gamesPlayed / totalGames : 0,
  }));
  result.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
  return result;
}

function computeClosestMatches(
  matches: MatchRow[],
  teamsMap: Map<string, TeamMini>
) {
  const withDiff = matches
    .filter(
      (m) =>
        typeof m.team1_score === 'number' &&
        typeof m.team2_score === 'number' &&
        m.team1_id &&
        m.team2_id
    )
    .map((m) => ({
      ...m,
      diff: Math.abs((m.team1_score ?? 0) - (m.team2_score ?? 0)),
    }));
  // Écart croissant, puis score total décroissant (matchs intenses).
  withDiff.sort((a, b) => {
    if (a.diff !== b.diff) return a.diff - b.diff;
    const totalA = (a.team1_score ?? 0) + (a.team2_score ?? 0);
    const totalB = (b.team1_score ?? 0) + (b.team2_score ?? 0);
    return totalB - totalA;
  });
  return withDiff.slice(0, 6).map((m) => ({
    id: m.id,
    team1: teamsMap.get(m.team1_id || '') || null,
    team2: teamsMap.get(m.team2_id || '') || null,
    team1_score: m.team1_score ?? 0,
    team2_score: m.team2_score ?? 0,
    winner_team_id: m.winner_team_id,
    stage_name:
      oneRelation(m.stage as Relation<{ name: string }>)?.name || null,
    round_number: m.round_number,
  }));
}
