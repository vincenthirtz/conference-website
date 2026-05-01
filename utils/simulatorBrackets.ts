// Bracket / Swiss / Round-Robin generators for the tournament simulator.
// Pure functions — no React, no DOM. Extracted from
// pages/admin/tournament-simulator.tsx.

import type { MatchStatus } from '@/types/admin';
import {
  computeSchedule,
  bracketSeedOrder,
  getBestOfForRound,
  simulateMatch,
  swissPairByRecord,
} from '@/utils/simulator';
import type {
  SimTeam,
  SimMatch,
  SimStage,
  ScheduleConfig,
  EscalationConfig,
} from '@/utils/simulator';
import { fakeId, pickMaps } from './simulatorFakeData';

export function generateSingleElim(
  teams: SimTeam[],
  bestOf: number,
  mapPool: string[],
  schedule: ScheduleConfig,
  escalation: EscalationConfig
): SimStage {
  const size = teams.length;
  const totalRounds = Math.log2(size);
  const matches: SimMatch[] = [];

  // Collect all round numbers for scheduling
  const roundNumbers: number[] = [];

  for (let r = 0; r < totalRounds; r++) {
    const matchesInRound = size / Math.pow(2, r + 1);
    for (let m = 0; m < matchesInRound; m++) {
      roundNumbers.push(r + 1);
    }
  }

  const scheduledDates = computeSchedule(
    roundNumbers.length,
    roundNumbers,
    schedule
  );

  let schedIdx = 0;
  for (let r = 0; r < totalRounds; r++) {
    const matchesInRound = size / Math.pow(2, r + 1);
    let roundName: string;
    if (r + 1 === totalRounds) roundName = 'Finale';
    else if (r + 1 === totalRounds - 1) roundName = 'Demi-finales';
    else if (r + 1 === totalRounds - 2 && totalRounds >= 3)
      roundName = 'Quarts de finale';
    else roundName = `Round ${r + 1}`;

    const roundBo = getBestOfForRound(r + 1, totalRounds, escalation, bestOf);

    for (let m = 0; m < matchesInRound; m++) {
      const isFirstRound = r === 0;
      const seedIdx = bracketSeedOrder(size);
      const t1 = isFirstRound ? teams[seedIdx[m * 2]] : null;
      const t2 = isFirstRound ? teams[seedIdx[m * 2 + 1]] : null;

      matches.push({
        id: fakeId(),
        round_number: r + 1,
        round_name: roundName,
        position_in_round: m + 1,
        status: 'pending',
        match_format: `bo${roundBo}`,
        best_of: roundBo,
        team1: t1 ?? null,
        team2: t2 ?? null,
        team1_id: t1?.id ?? null,
        team2_id: t2?.id ?? null,
        team1_score: null,
        team2_score: null,
        winner_team_id: null,
        scheduled_at: scheduledDates[schedIdx] ?? null,
        maps: pickMaps(roundBo, mapPool),
        bracket_side: 'wb',
        next_match_win_idx: null,
        next_match_win_slot: null,
        next_match_lose_idx: null,
        next_match_lose_slot: null,
        next_match_win_id: null,
        next_match_lose_id: null,
        locked: false,
      });
      schedIdx++;
    }
  }

  // Fix next_match pointers (index + id)
  let offset = 0;
  for (let r = 0; r < totalRounds - 1; r++) {
    const countInRound = size / Math.pow(2, r + 1);
    const nextOffset = offset + countInRound;
    for (let m = 0; m < countInRound; m++) {
      const nextIdx = nextOffset + Math.floor(m / 2);
      const nextSlot = (m % 2 === 0 ? 1 : 2) as 1 | 2;
      matches[offset + m].next_match_win_idx = nextIdx;
      matches[offset + m].next_match_win_slot = nextSlot;
      matches[offset + m].next_match_win_id = matches[nextIdx].id;
    }
    offset = nextOffset;
  }

  return {
    id: fakeId(),
    name: 'Single Elimination',
    stage_type: 'bracket',
    matches,
  };
}

export function generateDoubleElim(
  teams: SimTeam[],
  bestOf: number,
  mapPool: string[],
  schedule: ScheduleConfig,
  escalation: EscalationConfig,
  grandFinalReset: boolean
): SimStage {
  // WB matches
  const single = generateSingleElim(
    teams,
    bestOf,
    mapPool,
    schedule,
    escalation
  );
  const wbMatches = single.matches.map((m) => ({
    ...m,
    bracket_side: 'wb' as const,
  }));

  // LB matches
  const size = teams.length;
  const wbRounds = Math.log2(size);
  const lbRoundsCount = 2 * (wbRounds - 1);
  const lbMatches: SimMatch[] = [];
  let lbTeams = size / 2;

  for (let lbR = 1; lbR <= lbRoundsCount; lbR++) {
    let count: number;
    if (lbR === 1) {
      count = lbTeams / 2;
      lbTeams = lbTeams / 2;
    } else if (lbR % 2 === 0) {
      count = lbTeams;
    } else {
      count = lbTeams / 2;
      lbTeams = lbTeams / 2;
    }

    const roundName = lbR === lbRoundsCount ? 'LB Finale' : `LB Round ${lbR}`;
    for (let m = 0; m < count; m++) {
      lbMatches.push({
        id: fakeId(),
        round_number: lbR,
        round_name: roundName,
        position_in_round: m + 1,
        status: 'pending',
        match_format: `bo${bestOf}`,
        best_of: bestOf,
        team1: null,
        team2: null,
        team1_id: null,
        team2_id: null,
        team1_score: null,
        team2_score: null,
        winner_team_id: null,
        scheduled_at: null,
        maps: pickMaps(bestOf, mapPool),
        bracket_side: 'lb',
        next_match_win_idx: null,
        next_match_win_slot: null,
        next_match_lose_idx: null,
        next_match_lose_slot: null,
        next_match_win_id: null,
        next_match_lose_id: null,
        locked: false,
      });
    }
  }

  // Grand Final
  const gfMatch: SimMatch = {
    id: fakeId(),
    round_number: 1,
    round_name: 'Grande Finale',
    position_in_round: 1,
    status: 'pending',
    match_format: `bo${bestOf}`,
    best_of: bestOf,
    team1: null,
    team2: null,
    team1_id: null,
    team2_id: null,
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    scheduled_at: null,
    maps: pickMaps(bestOf, mapPool),
    bracket_side: 'final',
    next_match_win_idx: null,
    next_match_win_slot: null,
    next_match_lose_idx: null,
    next_match_lose_slot: null,
    next_match_win_id: null,
    next_match_lose_id: null,
    locked: false,
  };

  const allMatches = [...wbMatches, ...lbMatches, gfMatch];

  if (grandFinalReset) {
    allMatches.push({
      ...gfMatch,
      id: fakeId(),
      round_name: 'Grande Finale Reset',
      maps: pickMaps(bestOf, mapPool),
    });
  }

  return {
    id: fakeId(),
    name: 'Double Elimination',
    stage_type: 'bracket',
    matches: allMatches,
  };
}

export function generateSwiss(
  teams: SimTeam[],
  rounds: number,
  bestOf: number,
  mapPool: string[],
  schedule: ScheduleConfig
): SimStage {
  const matches: SimMatch[] = [];
  const roundNumbers: number[] = [];
  // Pre-compute match count for scheduling
  for (let r = 0; r < rounds; r++) {
    const matchesInRound = Math.floor(teams.length / 2);
    for (let m = 0; m < matchesInRound; m++) {
      roundNumbers.push(r + 1);
    }
  }
  const scheduledDates = computeSchedule(
    roundNumbers.length,
    roundNumbers,
    schedule
  );
  let schedIdx = 0;

  for (let r = 0; r < rounds; r++) {
    // Round 1: random pairing. Later rounds: pair by record (W-L)
    let pairings: { t1: SimTeam; t2: SimTeam }[];
    if (r === 0) {
      const shuffled = [...teams].sort(() => Math.random() - 0.5);
      pairings = [];
      for (let m = 0; m < Math.floor(shuffled.length / 2); m++) {
        pairings.push({ t1: shuffled[m * 2], t2: shuffled[m * 2 + 1] });
      }
    } else {
      // Simulate previous rounds to get records for pairing
      const simulated = matches.map((m) =>
        m.status === 'pending' ? simulateMatch(m) : m
      );
      const swissPairs = swissPairByRecord(teams, simulated);
      pairings = swissPairs.map((p) => ({
        t1: teams[p.team1Idx],
        t2: teams[p.team2Idx],
      }));
    }

    for (let m = 0; m < pairings.length; m++) {
      const { t1, t2 } = pairings[m];
      matches.push({
        id: fakeId(),
        round_number: r + 1,
        round_name: `Round ${r + 1}`,
        position_in_round: m + 1,
        status: 'pending',
        match_format: `bo${bestOf}`,
        best_of: bestOf,
        team1: t1,
        team2: t2,
        team1_id: t1.id,
        team2_id: t2.id,
        team1_score: null,
        team2_score: null,
        winner_team_id: null,
        scheduled_at: scheduledDates[schedIdx] ?? null,
        maps: pickMaps(bestOf, mapPool),
        bracket_side: 'none',
        next_match_win_idx: null,
        next_match_win_slot: null,
        next_match_lose_idx: null,
        next_match_lose_slot: null,
        next_match_win_id: null,
        next_match_lose_id: null,
        locked: false,
      });
      schedIdx++;
    }
  }
  return { id: fakeId(), name: 'Swiss System', stage_type: 'swiss', matches };
}

export function generateRoundRobin(
  teams: SimTeam[],
  bestOf: number,
  mapPool: string[],
  schedule: ScheduleConfig
): SimStage {
  // Pre-build matches to get round numbers for scheduling
  const rawMatches: { i: number; j: number; round: number }[] = [];
  let round = 1;
  let count = 0;
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      rawMatches.push({ i, j, round });
      count++;
      if (count % Math.floor(teams.length / 2) === 0) round++;
    }
  }

  const roundNumbers = rawMatches.map((m) => m.round);
  const scheduledDates = computeSchedule(
    rawMatches.length,
    roundNumbers,
    schedule
  );

  const matches: SimMatch[] = rawMatches.map(
    (raw, idx): SimMatch => ({
      id: fakeId(),
      round_number: raw.round,
      round_name: `Journée ${raw.round}`,
      position_in_round: idx + 1,
      status: 'pending' as MatchStatus,
      match_format: `bo${bestOf}`,
      best_of: bestOf,
      team1: teams[raw.i],
      team2: teams[raw.j],
      team1_id: teams[raw.i].id,
      team2_id: teams[raw.j].id,
      team1_score: null,
      team2_score: null,
      winner_team_id: null,
      scheduled_at: scheduledDates[idx] ?? null,
      maps: pickMaps(bestOf, mapPool),
      bracket_side: 'none' as const,
      next_match_win_idx: null,
      next_match_win_slot: null,
      next_match_lose_idx: null,
      next_match_lose_slot: null,
      next_match_win_id: null,
      next_match_lose_id: null,
      locked: false,
    })
  );

  return {
    id: fakeId(),
    name: 'Round Robin',
    stage_type: 'round_robin',
    matches,
  };
}
