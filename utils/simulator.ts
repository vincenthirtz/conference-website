// utils/simulator.ts
// Pure functions for the tournament simulator — extracted for testability.

import type { MatchStatus } from '@/types/admin';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type SimTeam = {
  id: string;
  name: string;
  short_name: string;
  logo_url: null;
  seed: number;
  strength: number; // 1-100, affects win probability
  players: { name: string; battleTag: string }[];
};

export type SimMap = {
  name: string;
  mode: string;
  winner_team_id?: string | null;
};

export type SimMatch = {
  id: string;
  round_number: number;
  round_name: string;
  position_in_round: number;
  status: MatchStatus;
  match_format: string;
  best_of: number;
  team1: SimTeam | null;
  team2: SimTeam | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  scheduled_at: string | null;
  maps: SimMap[];
  bracket_side: 'wb' | 'lb' | 'final' | 'none';
  next_match_win_idx: number | null;
  next_match_win_slot: 1 | 2 | null;
  next_match_lose_idx: number | null;
  next_match_lose_slot: 1 | 2 | null;
  next_match_win_id: string | null;
  next_match_lose_id: string | null;
  locked: boolean;
};

export type SimStage = {
  id: string;
  name: string;
  stage_type: string;
  matches: SimMatch[];
};

export type ScheduleConfig = {
  startDate: string;
  matchDurationMin: number;
  breakBetweenMatchesMin: number;
  breakBetweenRoundsMin: number;
  dayStartHour: number;
  dayEndHour: number;
  matchesPerDay: number;
};

export type EscalationConfig = {
  enabled: boolean;
  earlyRoundsBo: number;
  semiFinalsBo: number;
  finalsBo: number;
};

export type CompetitivenessMetrics = {
  closeMatches: number;
  closeMatchPct: number;
  upsets: number;
  upsetPct: number;
  avgMapsPerMatch: number;
  maxWinStreak: number;
  avgTeamJourney: number;
  dominanceScore: number;
};

export type MonteCarloResult = {
  iterations: number;
  winCounts: Map<string, number>;
  placementDist: Map<string, number[]>;
  winProbability: Map<string, number>;
};

/* ------------------------------------------------------------------ */
/*  Scheduling                                                          */
/* ------------------------------------------------------------------ */

export function computeSchedule(
  matchCount: number,
  roundNumbers: number[],
  schedule: ScheduleConfig
): (string | null)[] {
  if (!schedule.startDate) return Array(matchCount).fill(null);

  const results: (string | null)[] = [];
  let cursor = new Date(schedule.startDate);

  if (cursor.getHours() < schedule.dayStartHour) {
    cursor.setHours(schedule.dayStartHour, 0, 0, 0);
  }

  let lastRound = roundNumbers[0] ?? 1;
  let matchesToday = 0;

  for (let i = 0; i < matchCount; i++) {
    const currentRound = roundNumbers[i] ?? 1;

    if (currentRound !== lastRound) {
      cursor = new Date(
        cursor.getTime() + schedule.breakBetweenRoundsMin * 60000
      );
      lastRound = currentRound;
      matchesToday = 0;
    }

    if (schedule.matchesPerDay > 0 && matchesToday >= schedule.matchesPerDay) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(schedule.dayStartHour, 0, 0, 0);
      matchesToday = 0;
    }

    if (cursor.getHours() >= schedule.dayEndHour) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(schedule.dayStartHour, 0, 0, 0);
      matchesToday = 0;
    }

    results.push(cursor.toISOString());
    matchesToday++;

    cursor = new Date(
      cursor.getTime() +
        (schedule.matchDurationMin + schedule.breakBetweenMatchesMin) * 60000
    );
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  Seeding                                                             */
/* ------------------------------------------------------------------ */

export function bracketSeedOrder(size: number): number[] {
  if (size <= 1) return [0];
  if (size === 2) return [0, 1];
  const half = bracketSeedOrder(size / 2);
  const result: number[] = [];
  for (const s of half) {
    result.push(s, size - 1 - s);
  }
  return result;
}

export function getBestOfForRound(
  roundNumber: number,
  totalRounds: number,
  escalation: EscalationConfig,
  baseBestOf: number
): number {
  if (!escalation.enabled) return baseBestOf;
  if (roundNumber === totalRounds) return escalation.finalsBo;
  if (roundNumber === totalRounds - 1 && totalRounds >= 3)
    return escalation.semiFinalsBo;
  return escalation.earlyRoundsBo;
}

/* ------------------------------------------------------------------ */
/*  Win probability                                                     */
/* ------------------------------------------------------------------ */

/** Compute win probability for team1 based on strength ratings.
 *  Returns a value between 0.05 and 0.95. */
export function computeWinProbability(
  team1: SimTeam | null,
  team2: SimTeam | null
): number {
  if (!team1 || !team2) return 0.5;
  const s1 = team1.strength ?? 50;
  const s2 = team2.strength ?? 50;
  // Logistic model: diff of 20 strength ≈ 75% win rate
  const diff = s1 - s2;
  const raw = 1 / (1 + Math.exp(-diff / 15));
  return Math.max(0.05, Math.min(0.95, raw));
}

/* ------------------------------------------------------------------ */
/*  Match simulation                                                    */
/* ------------------------------------------------------------------ */

export function simulateMatch(match: SimMatch): SimMatch {
  if (match.status !== 'pending' || !match.team1 || !match.team2) return match;

  const t1WinProb = computeWinProbability(match.team1, match.team2);

  const winsNeeded = Math.ceil(match.best_of / 2);
  let s1 = 0,
    s2 = 0;
  const mapResults = [...match.maps];
  let mapIdx = 0;

  while (s1 < winsNeeded && s2 < winsNeeded) {
    const t1Wins = Math.random() < t1WinProb;
    if (t1Wins) s1++;
    else s2++;
    if (mapIdx < mapResults.length) {
      mapResults[mapIdx] = {
        ...mapResults[mapIdx],
        winner_team_id: t1Wins ? match.team1.id : match.team2.id,
      };
      mapIdx++;
    }
  }

  const winner = s1 > s2 ? match.team1 : match.team2;
  return {
    ...match,
    team1_score: s1,
    team2_score: s2,
    winner_team_id: winner.id,
    status: 'finished',
    maps: mapResults,
  };
}

/* ------------------------------------------------------------------ */
/*  Bracket propagation                                                 */
/* ------------------------------------------------------------------ */

export function propagateBracket(matches: SimMatch[]): SimMatch[] {
  const updated = [...matches];
  const idxById = new Map<string, number>();
  for (let i = 0; i < updated.length; i++) idxById.set(updated[i].id, i);

  for (let i = 0; i < updated.length; i++) {
    const m = updated[i];
    if (m.status !== 'finished' || !m.winner_team_id) continue;

    const winner = m.team1?.id === m.winner_team_id ? m.team1 : m.team2;
    const loser = m.team1?.id === m.winner_team_id ? m.team2 : m.team1;

    const winIdx = m.next_match_win_id
      ? idxById.get(m.next_match_win_id)
      : m.next_match_win_idx;
    if (winIdx != null && winIdx < updated.length) {
      const slot = m.next_match_win_slot;
      if (slot === 1) {
        updated[winIdx] = {
          ...updated[winIdx],
          team1: winner,
          team1_id: winner?.id ?? null,
        };
      } else if (slot === 2) {
        updated[winIdx] = {
          ...updated[winIdx],
          team2: winner,
          team2_id: winner?.id ?? null,
        };
      }
    }

    const loseIdx = m.next_match_lose_id
      ? idxById.get(m.next_match_lose_id)
      : m.next_match_lose_idx;
    if (loseIdx != null && loseIdx < updated.length && loser) {
      const slot = m.next_match_lose_slot;
      if (slot === 1) {
        updated[loseIdx] = {
          ...updated[loseIdx],
          team1: loser,
          team1_id: loser.id,
        };
      } else if (slot === 2) {
        updated[loseIdx] = {
          ...updated[loseIdx],
          team2: loser,
          team2_id: loser.id,
        };
      }
    }
  }
  return updated;
}

/* ------------------------------------------------------------------ */
/*  Full tournament simulation (for Monte Carlo)                        */
/* ------------------------------------------------------------------ */

export function simulateFullTournament(stagesInput: SimStage[]): {
  winnerId: string | null;
  standings: string[];
} {
  const stages = stagesInput.map((s) => ({
    ...s,
    matches: s.matches.map((m) => ({ ...m })),
  }));

  for (const stage of stages) {
    if (stage.stage_type === 'bracket' || stage.stage_type === 'showmatch') {
      const roundNums = [
        ...new Set(stage.matches.map((m) => m.round_number)),
      ].sort((a, b) => a - b);
      for (const rn of roundNums) {
        for (let i = 0; i < stage.matches.length; i++) {
          if (
            stage.matches[i].round_number === rn &&
            stage.matches[i].status === 'pending'
          ) {
            stage.matches[i] = simulateMatch(stage.matches[i]);
          }
        }
        stage.matches = propagateBracket(stage.matches);
      }
    } else {
      stage.matches = stage.matches.map((m) =>
        m.status === 'pending' ? simulateMatch(m) : m
      );
    }
  }

  const allMatches = stages.flatMap((s) => s.matches);
  const wins = new Map<string, number>();
  const mapDiff = new Map<string, number>();

  for (const m of allMatches) {
    if (m.status !== 'finished' || !m.winner_team_id) continue;
    wins.set(m.winner_team_id, (wins.get(m.winner_team_id) ?? 0) + 1);
    if (m.team1_id && m.team1_score != null && m.team2_score != null) {
      mapDiff.set(
        m.team1_id,
        (mapDiff.get(m.team1_id) ?? 0) + m.team1_score - m.team2_score
      );
      mapDiff.set(
        m.team2_id!,
        (mapDiff.get(m.team2_id!) ?? 0) + m.team2_score - m.team1_score
      );
    }
  }

  const teamIds = new Set<string>();
  for (const m of allMatches) {
    if (m.team1_id) teamIds.add(m.team1_id);
    if (m.team2_id) teamIds.add(m.team2_id);
  }

  const standings = [...teamIds].sort(
    (a, b) =>
      (wins.get(b) ?? 0) - (wins.get(a) ?? 0) ||
      (mapDiff.get(b) ?? 0) - (mapDiff.get(a) ?? 0)
  );

  return { winnerId: standings[0] ?? null, standings };
}

/* ------------------------------------------------------------------ */
/*  Monte Carlo                                                         */
/* ------------------------------------------------------------------ */

export function runMonteCarlo(
  baseStages: SimStage[],
  teams: SimTeam[],
  iterations: number
): MonteCarloResult {
  const winCounts = new Map<string, number>();
  const placementDist = new Map<string, number[]>();

  for (const t of teams) {
    winCounts.set(t.id, 0);
    placementDist.set(t.id, new Array(teams.length).fill(0));
  }

  for (let i = 0; i < iterations; i++) {
    const clonedStages = baseStages.map((s) => ({
      ...s,
      matches: s.matches.map(
        (m) =>
          ({
            ...m,
            ...(m.locked
              ? {}
              : {
                  status: 'pending' as MatchStatus,
                  team1_score: null,
                  team2_score: null,
                  winner_team_id: null,
                }),
            ...(!m.locked &&
            m.round_number > 1 &&
            (m.bracket_side === 'wb' ||
              m.bracket_side === 'lb' ||
              m.bracket_side === 'final')
              ? {
                  team1: null,
                  team1_id: null,
                  team2: null,
                  team2_id: null,
                }
              : {}),
            maps: m.maps.map((mp) => ({
              ...mp,
              winner_team_id: null as string | null | undefined,
            })),
          }) as SimMatch
      ),
    }));

    for (const stage of clonedStages) {
      if (stage.stage_type === 'bracket' || stage.stage_type === 'showmatch') {
        stage.matches = propagateBracket(stage.matches);
      }
    }

    const { standings } = simulateFullTournament(clonedStages);

    if (standings.length > 0) {
      winCounts.set(standings[0], (winCounts.get(standings[0]) ?? 0) + 1);
    }
    for (let p = 0; p < standings.length; p++) {
      const dist = placementDist.get(standings[p]);
      if (dist && p < dist.length) dist[p]++;
    }
  }

  const winProbability = new Map<string, number>();
  for (const [id, count] of winCounts) {
    winProbability.set(id, count / iterations);
  }

  return { iterations, winCounts, placementDist, winProbability };
}

/* ------------------------------------------------------------------ */
/*  Competitiveness metrics                                             */
/* ------------------------------------------------------------------ */

export function computeCompetitiveness(
  allMatches: SimMatch[],
  teams: SimTeam[]
): CompetitivenessMetrics {
  const finishedMatches = allMatches.filter(
    (m) => m.status === 'finished' && m.team1 && m.team2
  );
  if (finishedMatches.length === 0) {
    return {
      closeMatches: 0,
      closeMatchPct: 0,
      upsets: 0,
      upsetPct: 0,
      avgMapsPerMatch: 0,
      maxWinStreak: 0,
      avgTeamJourney: 0,
      dominanceScore: 0,
    };
  }

  let closeMatches = 0;
  let upsets = 0;
  let totalMaps = 0;

  for (const m of finishedMatches) {
    const s1 = m.team1_score ?? 0;
    const s2 = m.team2_score ?? 0;
    totalMaps += s1 + s2;

    if (Math.abs(s1 - s2) === 1) closeMatches++;

    if (m.winner_team_id && m.team1 && m.team2) {
      const winner = m.winner_team_id === m.team1.id ? m.team1 : m.team2;
      const loser = m.winner_team_id === m.team1.id ? m.team2 : m.team1;
      if (winner.seed > loser.seed) upsets++;
    }
  }

  const teamMatches = new Map<string, boolean[]>();
  for (const m of finishedMatches) {
    if (m.team1_id) {
      if (!teamMatches.has(m.team1_id)) teamMatches.set(m.team1_id, []);
      teamMatches.get(m.team1_id)!.push(m.winner_team_id === m.team1_id);
    }
    if (m.team2_id) {
      if (!teamMatches.has(m.team2_id)) teamMatches.set(m.team2_id, []);
      teamMatches.get(m.team2_id)!.push(m.winner_team_id === m.team2_id);
    }
  }

  let maxWinStreak = 0;
  let totalMatchesPlayed = 0;
  for (const results of teamMatches.values()) {
    totalMatchesPlayed += results.length;
    let streak = 0;
    for (const won of results) {
      if (won) {
        streak++;
        maxWinStreak = Math.max(maxWinStreak, streak);
      } else streak = 0;
    }
  }

  const avgTeamJourney =
    teamMatches.size > 0 ? totalMatchesPlayed / teamMatches.size : 0;

  const wins = new Map<string, number>();
  for (const m of finishedMatches) {
    if (m.winner_team_id)
      wins.set(m.winner_team_id, (wins.get(m.winner_team_id) ?? 0) + 1);
  }
  const winValues = [...wins.values()].sort((a, b) => b - a);
  const topWins = winValues[0] ?? 0;
  const dominanceScore =
    finishedMatches.length > 0 ? topWins / finishedMatches.length : 0;

  return {
    closeMatches,
    closeMatchPct: Math.round((closeMatches / finishedMatches.length) * 100),
    upsets,
    upsetPct: Math.round((upsets / finishedMatches.length) * 100),
    avgMapsPerMatch: Math.round((totalMaps / finishedMatches.length) * 10) / 10,
    maxWinStreak,
    avgTeamJourney: Math.round(avgTeamJourney * 10) / 10,
    dominanceScore: Math.round(dominanceScore * 100),
  };
}

/* ------------------------------------------------------------------ */
/*  Swiss pairing by record                                             */
/* ------------------------------------------------------------------ */

export type SwissPairing = { team1Idx: number; team2Idx: number };

/** Pair teams by similar W-L record for a Swiss round.
 *  Teams are sorted by (wins desc, map diff desc), then paired sequentially.
 *  Already-played matchups are avoided when possible. */
export function swissPairByRecord(
  teams: SimTeam[],
  previousMatches: SimMatch[]
): SwissPairing[] {
  // Build record
  const wins = new Map<string, number>();
  const mapDiff = new Map<string, number>();
  const playedPairs = new Set<string>();

  for (const m of previousMatches) {
    if (m.status !== 'finished') continue;
    if (m.winner_team_id)
      wins.set(m.winner_team_id, (wins.get(m.winner_team_id) ?? 0) + 1);
    if (m.team1_id && m.team2_id) {
      const pairKey = [m.team1_id, m.team2_id].sort().join('-');
      playedPairs.add(pairKey);
      if (m.team1_score != null && m.team2_score != null) {
        mapDiff.set(
          m.team1_id,
          (mapDiff.get(m.team1_id) ?? 0) + m.team1_score - m.team2_score
        );
        mapDiff.set(
          m.team2_id,
          (mapDiff.get(m.team2_id) ?? 0) + m.team2_score - m.team1_score
        );
      }
    }
  }

  // Sort teams by record
  const indices = teams.map((_, i) => i);
  indices.sort((a, b) => {
    const wA = wins.get(teams[a].id) ?? 0;
    const wB = wins.get(teams[b].id) ?? 0;
    if (wB !== wA) return wB - wA;
    const dA = mapDiff.get(teams[a].id) ?? 0;
    const dB = mapDiff.get(teams[b].id) ?? 0;
    return dB - dA;
  });

  // Greedy pairing: pick pairs sequentially, avoiding rematches when possible
  const paired = new Set<number>();
  const pairings: SwissPairing[] = [];

  for (let i = 0; i < indices.length; i++) {
    if (paired.has(indices[i])) continue;
    let bestJ = -1;
    // First pass: find unpaired opponent we haven't played
    for (let j = i + 1; j < indices.length; j++) {
      if (paired.has(indices[j])) continue;
      const pairKey = [teams[indices[i]].id, teams[indices[j]].id]
        .sort()
        .join('-');
      if (!playedPairs.has(pairKey)) {
        bestJ = j;
        break;
      }
    }
    // Fallback: take next unpaired
    if (bestJ === -1) {
      for (let j = i + 1; j < indices.length; j++) {
        if (!paired.has(indices[j])) {
          bestJ = j;
          break;
        }
      }
    }
    if (bestJ === -1) continue; // odd team out
    paired.add(indices[i]);
    paired.add(indices[bestJ]);
    pairings.push({ team1Idx: indices[i], team2Idx: indices[bestJ] });
  }

  return pairings;
}

/* ------------------------------------------------------------------ */
/*  Head-to-head records                                                */
/* ------------------------------------------------------------------ */

export type H2HRecord = {
  team1Id: string;
  team2Id: string;
  team1Wins: number;
  team2Wins: number;
  mapScore1: number;
  mapScore2: number;
};

/** Compute head-to-head records between all teams. */
export function computeHeadToHead(matches: SimMatch[]): H2HRecord[] {
  const records = new Map<string, H2HRecord>();

  for (const m of matches) {
    if (
      m.status !== 'finished' ||
      !m.team1_id ||
      !m.team2_id ||
      !m.winner_team_id
    )
      continue;
    const key = [m.team1_id, m.team2_id].sort().join('-');
    const [first, second] = [m.team1_id, m.team2_id].sort();

    if (!records.has(key)) {
      records.set(key, {
        team1Id: first,
        team2Id: second,
        team1Wins: 0,
        team2Wins: 0,
        mapScore1: 0,
        mapScore2: 0,
      });
    }
    const rec = records.get(key)!;

    const isT1First = m.team1_id === first;
    if (m.winner_team_id === first) rec.team1Wins++;
    else rec.team2Wins++;

    if (m.team1_score != null && m.team2_score != null) {
      rec.mapScore1 += isT1First ? m.team1_score : m.team2_score;
      rec.mapScore2 += isT1First ? m.team2_score : m.team1_score;
    }
  }

  return Array.from(records.values());
}
