// utils/stages/standings.ts
// Calcul generique du classement d'un stage, quel que soit son type.
// Reutilise computeSwissStandings() pour les stages swiss,
// et calcule W/L/D pour les stages group/round_robin/bracket.

import { supabaseAdmin } from '../supabase';
import { computeSwissStandings } from '../swiss/standings';
import { defaultSwissScoreConfig } from '../swiss/utils';
import type { SwissMatchResult, SwissScoreConfig } from '../../types/swiss';

export type StageStanding = {
  teamId: string;
  teamName: string | null;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  score: number;
  seed: number | null;
};

type DbMatch = {
  id: string;
  status: string;
  is_bye: boolean | null;
  round_number: number | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
};

type StageTeamRow = {
  team_id: string;
  seed: number | null;
  team: { id: string; name: string; short_name: string | null } | null;
};

/**
 * Calcule le classement d'un stage. Retourne un tableau trie par performance.
 */
export async function computeStageStandings(
  stageId: string,
  stageType: string
): Promise<StageStanding[]> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not available');
  }

  // Fetch stage teams with team names
  const { data: stageTeamsData, error: teamsErr } = await supabaseAdmin
    .from('stage_teams')
    .select('team_id, seed, team:teams(id, name, short_name)')
    .eq('stage_id', stageId);

  if (teamsErr) {
    throw new Error(`Failed to fetch stage teams: ${teamsErr.message}`);
  }

  // Supabase may return `team` as an array (join) — normalize to single object
  const stageTeams: StageTeamRow[] = (stageTeamsData || []).map((row: any) => ({
    team_id: row.team_id,
    seed: row.seed,
    team: Array.isArray(row.team) ? row.team[0] ?? null : row.team ?? null,
  }));

  if (stageTeams.length === 0) {
    return [];
  }

  // Build team name map
  const teamNameMap = new Map<string, string | null>();
  for (const st of stageTeams) {
    teamNameMap.set(st.team_id, st.team?.name ?? null);
  }

  // Fetch finished matches for the stage
  const { data: matchesData, error: matchesErr } = await supabaseAdmin
    .from('matches')
    .select(
      'id, status, is_bye, round_number, team1_id, team2_id, winner_team_id, team1_score, team2_score'
    )
    .eq('stage_id', stageId)
    .neq('status', 'cancelled');

  if (matchesErr) {
    throw new Error(`Failed to fetch matches: ${matchesErr.message}`);
  }

  const matches = (matchesData || []) as DbMatch[];
  const finishedMatches = matches.filter((m) => m.status === 'finished');

  switch (stageType) {
    case 'swiss':
      return computeSwissStageStandings(stageTeams, finishedMatches);
    case 'group':
    case 'round_robin':
      return computeGroupStandings(stageTeams, finishedMatches);
    case 'bracket':
      return computeBracketStandings(stageTeams, finishedMatches, matches);
    default:
      // showmatch, other: just return by seed
      return stageTeams
        .sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999))
        .map((st, idx) => ({
          teamId: st.team_id,
          teamName: st.team?.name ?? null,
          rank: idx + 1,
          wins: 0,
          losses: 0,
          draws: 0,
          score: 0,
          seed: st.seed,
        }));
  }
}

/* -----------------------------------------------------------
 * Swiss standings
 * ---------------------------------------------------------*/

function computeSwissStageStandings(
  stageTeams: StageTeamRow[],
  finishedMatches: DbMatch[]
): StageStanding[] {
  const config: SwissScoreConfig = defaultSwissScoreConfig;

  const participants = stageTeams.map((st, idx) => ({
    id: st.team_id,
    name: st.team?.name,
    seed: st.seed ?? idx + 1,
  }));

  const results: SwissMatchResult[] = [];

  for (const m of finishedMatches) {
    if (!m.team1_id) continue;
    const round = m.round_number ?? 0;

    if (m.is_bye || !m.team2_id) {
      results.push({
        round,
        player1Id: m.team1_id,
        player2Id: null,
        player1Score: config.bye,
        player2Score: 0,
      });
      continue;
    }

    if (m.winner_team_id === m.team1_id) {
      results.push({
        round,
        player1Id: m.team1_id,
        player2Id: m.team2_id,
        player1Score: config.win,
        player2Score: config.loss,
      });
    } else if (m.winner_team_id === m.team2_id) {
      results.push({
        round,
        player1Id: m.team1_id,
        player2Id: m.team2_id,
        player1Score: config.loss,
        player2Score: config.win,
      });
    } else {
      results.push({
        round,
        player1Id: m.team1_id,
        player2Id: m.team2_id,
        player1Score: config.draw,
        player2Score: config.draw,
      });
    }
  }

  const standings = computeSwissStandings({ participants, results });

  const teamNameMap = new Map<string, string | null>();
  for (const st of stageTeams) {
    teamNameMap.set(st.team_id, st.team?.name ?? null);
  }

  return standings.map((s, idx) => ({
    teamId: s.id,
    teamName: teamNameMap.get(s.id) ?? s.name ?? null,
    rank: idx + 1,
    wins: s.wins,
    losses: s.losses,
    draws: s.draws,
    score: s.score,
    seed: s.seed ?? null,
  }));
}

/* -----------------------------------------------------------
 * Group / Round Robin standings
 * ---------------------------------------------------------*/

/** @internal Exported for testing */
export function computeGroupStandings(
  stageTeams: StageTeamRow[],
  finishedMatches: DbMatch[]
): StageStanding[] {
  type Agg = {
    teamId: string;
    wins: number;
    losses: number;
    draws: number;
    points: number;
    scoreDiff: number;
    seed: number | null;
  };

  const map = new Map<string, Agg>();

  for (const st of stageTeams) {
    map.set(st.team_id, {
      teamId: st.team_id,
      wins: 0,
      losses: 0,
      draws: 0,
      points: 0,
      scoreDiff: 0,
      seed: st.seed,
    });
  }

  for (const m of finishedMatches) {
    if (!m.team1_id || !m.team2_id) continue;

    const a1 = map.get(m.team1_id);
    const a2 = map.get(m.team2_id);
    if (!a1 || !a2) continue;

    const s1 = m.team1_score ?? 0;
    const s2 = m.team2_score ?? 0;

    a1.scoreDiff += s1 - s2;
    a2.scoreDiff += s2 - s1;

    if (m.winner_team_id === m.team1_id) {
      a1.wins += 1;
      a1.points += 3;
      a2.losses += 1;
    } else if (m.winner_team_id === m.team2_id) {
      a2.wins += 1;
      a2.points += 3;
      a1.losses += 1;
    } else {
      // draw
      a1.draws += 1;
      a1.points += 1;
      a2.draws += 1;
      a2.points += 1;
    }
  }

  const sorted = Array.from(map.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.scoreDiff !== a.scoreDiff) return b.scoreDiff - a.scoreDiff;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return (a.seed ?? 999) - (b.seed ?? 999);
  });

  const teamNameMap = new Map<string, string | null>();
  for (const st of stageTeams) {
    teamNameMap.set(st.team_id, st.team?.name ?? null);
  }

  return sorted.map((a, idx) => ({
    teamId: a.teamId,
    teamName: teamNameMap.get(a.teamId) ?? null,
    rank: idx + 1,
    wins: a.wins,
    losses: a.losses,
    draws: a.draws,
    score: a.points,
    seed: a.seed,
  }));
}

/* -----------------------------------------------------------
 * Bracket standings (based on elimination round)
 * ---------------------------------------------------------*/

/** @internal Exported for testing */
export function computeBracketStandings(
  stageTeams: StageTeamRow[],
  finishedMatches: DbMatch[],
  allMatches: DbMatch[]
): StageStanding[] {
  // For bracket: rank based on the furthest round reached.
  // The winner of the highest round match is #1, loser is #2, etc.
  // Teams eliminated in earlier rounds are ranked lower.

  const maxRound = allMatches.reduce(
    (acc, m) => Math.max(acc, m.round_number ?? 0),
    0
  );

  // Track the last round each team won
  const lastWinRound = new Map<string, number>();
  const teamWins = new Map<string, number>();
  const teamLosses = new Map<string, number>();

  for (const m of finishedMatches) {
    if (!m.team1_id) continue;

    if (m.winner_team_id) {
      const loserId =
        m.winner_team_id === m.team1_id ? m.team2_id : m.team1_id;

      const winRound = m.round_number ?? 0;
      const prev = lastWinRound.get(m.winner_team_id) ?? 0;
      if (winRound > prev) lastWinRound.set(m.winner_team_id, winRound);

      teamWins.set(
        m.winner_team_id,
        (teamWins.get(m.winner_team_id) ?? 0) + 1
      );
      if (loserId) {
        teamLosses.set(loserId, (teamLosses.get(loserId) ?? 0) + 1);
      }
    }
  }

  const teamNameMap = new Map<string, string | null>();
  for (const st of stageTeams) {
    teamNameMap.set(st.team_id, st.team?.name ?? null);
  }

  // Sort: highest lastWinRound first, then by wins, then by seed
  const teams = stageTeams.map((st) => ({
    teamId: st.team_id,
    lastWinRound: lastWinRound.get(st.team_id) ?? 0,
    wins: teamWins.get(st.team_id) ?? 0,
    losses: teamLosses.get(st.team_id) ?? 0,
    seed: st.seed,
  }));

  teams.sort((a, b) => {
    if (b.lastWinRound !== a.lastWinRound)
      return b.lastWinRound - a.lastWinRound;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return (a.seed ?? 999) - (b.seed ?? 999);
  });

  return teams.map((t, idx) => ({
    teamId: t.teamId,
    teamName: teamNameMap.get(t.teamId) ?? null,
    rank: idx + 1,
    wins: t.wins,
    losses: t.losses,
    draws: 0,
    score: t.lastWinRound,
    seed: t.seed,
  }));
}
