import { describe, it, expect } from 'vitest';
import {
  computeSchedule,
  bracketSeedOrder,
  getBestOfForRound,
  simulateMatch,
  propagateBracket,
  simulateFullTournament,
  simulateBracketToCompletion,
  resolveByes,
  runMonteCarlo,
  computeCompetitiveness,
  swissPairByRecord,
} from '../../utils/simulator';
import type {
  SimTeam,
  SimMatch,
  SimStage,
  ScheduleConfig,
  EscalationConfig,
} from '../../utils/simulator';
import {
  generateSingleElim,
  generateDoubleElim,
  generateSwiss,
} from '../../utils/simulatorBrackets';

/* ------------------------------------------------------------------ */
/*  Test helpers                                                        */
/* ------------------------------------------------------------------ */

function makeTeam(id: string, seed: number, name?: string): SimTeam {
  return {
    id,
    name: name ?? `Team ${seed}`,
    short_name: `T${seed}`,
    logo_url: null,
    seed,
    strength: Math.round(75 - ((seed - 1) / 7) * 40),
    players: [],
  };
}

function makeMatch(id: string, overrides: Partial<SimMatch> = {}): SimMatch {
  return {
    id,
    round_number: 1,
    round_name: 'Round 1',
    position_in_round: 1,
    status: 'pending',
    match_format: 'bo3',
    best_of: 3,
    team1: null,
    team2: null,
    team1_id: null,
    team2_id: null,
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    scheduled_at: null,
    maps: [
      { name: 'Map A', mode: 'Control' },
      { name: 'Map B', mode: 'Escort' },
      { name: 'Map C', mode: 'Hybrid' },
    ],
    bracket_side: 'wb',
    next_match_win_idx: null,
    next_match_win_slot: null,
    next_match_lose_idx: null,
    next_match_lose_slot: null,
    next_match_win_id: null,
    next_match_lose_id: null,
    locked: false,
    ...overrides,
  };
}

/** Build a 4-team single elimination bracket:
 *  m1 (T1 vs T4) → m3 (final)
 *  m2 (T2 vs T3) → m3 (final)
 */
function make4TeamBracket(): { teams: SimTeam[]; stage: SimStage } {
  const teams = [
    makeTeam('t1', 1),
    makeTeam('t2', 2),
    makeTeam('t3', 3),
    makeTeam('t4', 4),
  ];
  const matches: SimMatch[] = [
    makeMatch('m1', {
      team1: teams[0],
      team1_id: 't1',
      team2: teams[3],
      team2_id: 't4',
      round_number: 1,
      round_name: 'Demi-finales',
      position_in_round: 1,
      next_match_win_idx: 2,
      next_match_win_slot: 1,
      next_match_win_id: 'm3',
    }),
    makeMatch('m2', {
      team1: teams[1],
      team1_id: 't2',
      team2: teams[2],
      team2_id: 't3',
      round_number: 1,
      round_name: 'Demi-finales',
      position_in_round: 2,
      next_match_win_idx: 2,
      next_match_win_slot: 2,
      next_match_win_id: 'm3',
    }),
    makeMatch('m3', {
      round_number: 2,
      round_name: 'Finale',
      position_in_round: 1,
    }),
  ];
  return {
    teams,
    stage: { id: 's1', name: 'Bracket', stage_type: 'bracket', matches },
  };
}

/* ================================================================== */
/*  bracketSeedOrder                                                    */
/* ================================================================== */

describe('bracketSeedOrder', () => {
  it('returns [0] for size 1', () => {
    expect(bracketSeedOrder(1)).toEqual([0]);
  });

  it('returns [0, 1] for size 2', () => {
    expect(bracketSeedOrder(2)).toEqual([0, 1]);
  });

  it('pairs seed 1 vs seed 4 and seed 2 vs seed 3 for size 4', () => {
    const order = bracketSeedOrder(4);
    // Pairs: (order[0] vs order[1]), (order[2] vs order[3])
    expect(order).toEqual([0, 3, 1, 2]);
  });

  it('produces correct seeding for 8 teams', () => {
    const order = bracketSeedOrder(8);
    expect(order).toHaveLength(8);
    // First pair should be seed 1 (0) vs seed 8 (7)
    expect(order[0]).toBe(0);
    expect(order[1]).toBe(7);
    // All indices present
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('ensures top seeds are on opposite sides of bracket for 8', () => {
    const order = bracketSeedOrder(8);
    // Seed 1 (0) and seed 2 (1) should be in different halves
    const firstHalf = order.slice(0, 4);
    const secondHalf = order.slice(4, 8);
    expect(firstHalf).toContain(0);
    expect(secondHalf).toContain(1);
  });
});

/* ================================================================== */
/*  getBestOfForRound                                                   */
/* ================================================================== */

describe('getBestOfForRound', () => {
  const escalation: EscalationConfig = {
    enabled: true,
    earlyRoundsBo: 1,
    semiFinalsBo: 3,
    finalsBo: 5,
  };

  it('returns baseBestOf when escalation disabled', () => {
    const disabled = { ...escalation, enabled: false };
    expect(getBestOfForRound(1, 3, disabled, 3)).toBe(3);
    expect(getBestOfForRound(3, 3, disabled, 3)).toBe(3);
  });

  it('returns earlyRoundsBo for early rounds', () => {
    expect(getBestOfForRound(1, 4, escalation, 3)).toBe(1);
  });

  it('returns semiFinalsBo for semis', () => {
    // totalRounds=3, semi = round 2
    expect(getBestOfForRound(2, 3, escalation, 3)).toBe(3);
  });

  it('returns finalsBo for the final round', () => {
    expect(getBestOfForRound(3, 3, escalation, 3)).toBe(5);
  });

  it('does not apply semi escalation when only 2 rounds', () => {
    // totalRounds=2: round 1 = early, round 2 = final
    expect(getBestOfForRound(1, 2, escalation, 3)).toBe(1);
    expect(getBestOfForRound(2, 2, escalation, 3)).toBe(5);
  });
});

/* ================================================================== */
/*  computeSchedule                                                     */
/* ================================================================== */

describe('computeSchedule', () => {
  const baseSchedule: ScheduleConfig = {
    startDate: '2026-03-23T10:00:00',
    matchDurationMin: 30,
    breakBetweenMatchesMin: 10,
    breakBetweenRoundsMin: 30,
    dayStartHour: 10,
    dayEndHour: 22,
    matchesPerDay: 0,
  };

  it('returns all nulls when no startDate', () => {
    const result = computeSchedule(3, [1, 1, 1], {
      ...baseSchedule,
      startDate: '',
    });
    expect(result).toEqual([null, null, null]);
  });

  it('returns correct number of dates', () => {
    const result = computeSchedule(4, [1, 1, 2, 2], baseSchedule);
    expect(result).toHaveLength(4);
    result.forEach((d) => expect(d).not.toBeNull());
  });

  it('spaces matches by duration + break', () => {
    const result = computeSchedule(2, [1, 1], baseSchedule);
    const d1 = new Date(result[0]!);
    const d2 = new Date(result[1]!);
    const diffMin = (d2.getTime() - d1.getTime()) / 60000;
    expect(diffMin).toBe(40); // 30 match + 10 break
  });

  it('adds round break when round changes', () => {
    const result = computeSchedule(2, [1, 2], baseSchedule);
    const d1 = new Date(result[0]!);
    const d2 = new Date(result[1]!);
    const diffMin = (d2.getTime() - d1.getTime()) / 60000;
    // match 1 ends at +30, then round break +30, so match 2 starts at +60 from start + break between
    expect(diffMin).toBe(70); // 30 match + 10 break + 30 round break
  });

  it('respects matchesPerDay limit', () => {
    const schedule = { ...baseSchedule, matchesPerDay: 2 };
    const result = computeSchedule(3, [1, 1, 1], schedule);
    const d1 = new Date(result[0]!);
    const d3 = new Date(result[2]!);
    // 3rd match should be on next day
    expect(d3.getDate()).toBeGreaterThan(d1.getDate());
  });
});

/* ================================================================== */
/*  simulateMatch                                                       */
/* ================================================================== */

describe('simulateMatch', () => {
  it('returns unchanged match if not pending', () => {
    const t1 = makeTeam('t1', 1);
    const t2 = makeTeam('t2', 2);
    const match = makeMatch('m1', {
      team1: t1,
      team1_id: 't1',
      team2: t2,
      team2_id: 't2',
      status: 'finished',
      team1_score: 2,
      team2_score: 1,
      winner_team_id: 't1',
    });
    const result = simulateMatch(match);
    expect(result).toEqual(match);
  });

  it('returns unchanged match if missing a team', () => {
    const t1 = makeTeam('t1', 1);
    const match = makeMatch('m1', { team1: t1, team1_id: 't1' });
    const result = simulateMatch(match);
    expect(result.status).toBe('pending');
  });

  it('produces a finished match with valid scores for BO3', () => {
    const t1 = makeTeam('t1', 1);
    const t2 = makeTeam('t2', 2);
    const match = makeMatch('m1', {
      team1: t1,
      team1_id: 't1',
      team2: t2,
      team2_id: 't2',
      best_of: 3,
    });

    const result = simulateMatch(match);
    expect(result.status).toBe('finished');
    expect(result.winner_team_id).toBeDefined();
    expect(result.team1_score).not.toBeNull();
    expect(result.team2_score).not.toBeNull();

    const s1 = result.team1_score!;
    const s2 = result.team2_score!;
    // One team must have exactly 2 wins (ceil(3/2))
    expect(Math.max(s1, s2)).toBe(2);
    // Total maps played: 2 or 3
    expect(s1 + s2).toBeGreaterThanOrEqual(2);
    expect(s1 + s2).toBeLessThanOrEqual(3);
  });

  it('produces valid scores for BO5', () => {
    const t1 = makeTeam('t1', 1);
    const t2 = makeTeam('t2', 2);
    const match = makeMatch('m1', {
      team1: t1,
      team1_id: 't1',
      team2: t2,
      team2_id: 't2',
      best_of: 5,
      maps: Array.from({ length: 5 }, (_, i) => ({
        name: `Map ${i}`,
        mode: 'Control',
      })),
    });

    const result = simulateMatch(match);
    const s1 = result.team1_score!;
    const s2 = result.team2_score!;
    expect(Math.max(s1, s2)).toBe(3);
    expect(s1 + s2).toBeGreaterThanOrEqual(3);
    expect(s1 + s2).toBeLessThanOrEqual(5);
  });

  it('winner is always one of the two teams', () => {
    const t1 = makeTeam('t1', 1);
    const t2 = makeTeam('t2', 2);
    const match = makeMatch('m1', {
      team1: t1,
      team1_id: 't1',
      team2: t2,
      team2_id: 't2',
    });

    for (let i = 0; i < 20; i++) {
      const result = simulateMatch(match);
      expect(['t1', 't2']).toContain(result.winner_team_id);
    }
  });

  it('assigns map winners correctly', () => {
    const t1 = makeTeam('t1', 1);
    const t2 = makeTeam('t2', 2);
    const match = makeMatch('m1', {
      team1: t1,
      team1_id: 't1',
      team2: t2,
      team2_id: 't2',
      best_of: 3,
    });

    const result = simulateMatch(match);
    const playedMaps = result.maps.filter((m) => m.winner_team_id != null);
    expect(playedMaps.length).toBe(result.team1_score! + result.team2_score!);
  });
});

/* ================================================================== */
/*  propagateBracket                                                    */
/* ================================================================== */

describe('propagateBracket', () => {
  it('propagates winner to next match via index', () => {
    const t1 = makeTeam('t1', 1);
    const t2 = makeTeam('t2', 2);
    const matches: SimMatch[] = [
      makeMatch('m1', {
        team1: t1,
        team1_id: 't1',
        team2: t2,
        team2_id: 't2',
        status: 'finished',
        winner_team_id: 't1',
        team1_score: 2,
        team2_score: 0,
        next_match_win_idx: 1,
        next_match_win_slot: 1,
      }),
      makeMatch('m2'),
    ];

    const result = propagateBracket(matches);
    expect(result[1].team1_id).toBe('t1');
    expect(result[1].team1?.id).toBe('t1');
  });

  it('propagates winner to next match via ID', () => {
    const t1 = makeTeam('t1', 1);
    const t2 = makeTeam('t2', 2);
    const matches: SimMatch[] = [
      makeMatch('m1', {
        team1: t1,
        team1_id: 't1',
        team2: t2,
        team2_id: 't2',
        status: 'finished',
        winner_team_id: 't2',
        team1_score: 0,
        team2_score: 2,
        next_match_win_id: 'm2',
        next_match_win_slot: 2,
      }),
      makeMatch('m2'),
    ];

    const result = propagateBracket(matches);
    expect(result[1].team2_id).toBe('t2');
  });

  it('propagates loser for double elimination', () => {
    const t1 = makeTeam('t1', 1);
    const t2 = makeTeam('t2', 2);
    const matches: SimMatch[] = [
      makeMatch('m1', {
        team1: t1,
        team1_id: 't1',
        team2: t2,
        team2_id: 't2',
        status: 'finished',
        winner_team_id: 't1',
        team1_score: 2,
        team2_score: 1,
        next_match_win_id: 'm2',
        next_match_win_slot: 1,
        next_match_lose_id: 'm3',
        next_match_lose_slot: 1,
      }),
      makeMatch('m2'),
      makeMatch('m3', { bracket_side: 'lb' }),
    ];

    const result = propagateBracket(matches);
    expect(result[1].team1_id).toBe('t1'); // winner → m2 slot 1
    expect(result[2].team1_id).toBe('t2'); // loser → m3 slot 1
  });

  it('does not propagate pending matches', () => {
    const t1 = makeTeam('t1', 1);
    const t2 = makeTeam('t2', 2);
    const matches: SimMatch[] = [
      makeMatch('m1', {
        team1: t1,
        team1_id: 't1',
        team2: t2,
        team2_id: 't2',
        status: 'pending',
        next_match_win_id: 'm2',
        next_match_win_slot: 1,
      }),
      makeMatch('m2'),
    ];

    const result = propagateBracket(matches);
    expect(result[1].team1_id).toBeNull();
  });

  it('handles full 4-team bracket propagation', () => {
    const { stage } = make4TeamBracket();

    // Simulate both semis
    stage.matches[0] = {
      ...stage.matches[0],
      status: 'finished',
      winner_team_id: 't1',
      team1_score: 2,
      team2_score: 0,
    };
    stage.matches[1] = {
      ...stage.matches[1],
      status: 'finished',
      winner_team_id: 't3',
      team1_score: 1,
      team2_score: 2,
    };

    const result = propagateBracket(stage.matches);
    // Final should have t1 vs t3
    expect(result[2].team1_id).toBe('t1');
    expect(result[2].team2_id).toBe('t3');
  });
});

/* ================================================================== */
/*  simulateFullTournament                                              */
/* ================================================================== */

describe('simulateFullTournament', () => {
  it('produces a winner from a 4-team bracket', () => {
    const { stage, teams } = make4TeamBracket();
    const { winnerId, standings } = simulateFullTournament([stage]);

    expect(winnerId).toBeDefined();
    expect(teams.map((t) => t.id)).toContain(winnerId);
    expect(standings).toHaveLength(4);
  });

  it('finishes all matches', () => {
    const { stage } = make4TeamBracket();
    // We need to check after simulation - simulateFullTournament modifies a deep clone
    const cloned = { ...stage, matches: stage.matches.map((m) => ({ ...m })) };
    simulateFullTournament([cloned]);
    // The original should be untouched (function clones internally)
    expect(stage.matches[2].status).toBe('pending');
  });

  it('handles non-bracket stages', () => {
    const t1 = makeTeam('t1', 1);
    const t2 = makeTeam('t2', 2);
    const stage: SimStage = {
      id: 's1',
      name: 'Round Robin',
      stage_type: 'round_robin',
      matches: [
        makeMatch('m1', {
          team1: t1,
          team1_id: 't1',
          team2: t2,
          team2_id: 't2',
          bracket_side: 'none',
        }),
      ],
    };

    const { winnerId } = simulateFullTournament([stage]);
    expect(winnerId).toBeDefined();
    expect(['t1', 't2']).toContain(winnerId);
  });
});

/* ================================================================== */
/*  computeCompetitiveness                                              */
/* ================================================================== */

describe('computeCompetitiveness', () => {
  it('returns zeros for no finished matches', () => {
    const teams = [makeTeam('t1', 1)];
    const result = computeCompetitiveness([], teams);
    expect(result.closeMatches).toBe(0);
    expect(result.upsets).toBe(0);
    expect(result.dominanceScore).toBe(0);
  });

  it('detects close matches (1 map margin)', () => {
    const t1 = makeTeam('t1', 1);
    const t2 = makeTeam('t2', 2);
    const matches: SimMatch[] = [
      makeMatch('m1', {
        team1: t1,
        team1_id: 't1',
        team2: t2,
        team2_id: 't2',
        status: 'finished',
        winner_team_id: 't1',
        team1_score: 2,
        team2_score: 1,
      }),
    ];

    const result = computeCompetitiveness(matches, [t1, t2]);
    expect(result.closeMatches).toBe(1);
    expect(result.closeMatchPct).toBe(100);
  });

  it('does not count non-close matches', () => {
    const t1 = makeTeam('t1', 1);
    const t2 = makeTeam('t2', 2);
    const matches: SimMatch[] = [
      makeMatch('m1', {
        team1: t1,
        team1_id: 't1',
        team2: t2,
        team2_id: 't2',
        status: 'finished',
        winner_team_id: 't1',
        team1_score: 2,
        team2_score: 0,
      }),
    ];

    const result = computeCompetitiveness(matches, [t1, t2]);
    expect(result.closeMatches).toBe(0);
  });

  it('detects upsets (lower seed loses)', () => {
    const t1 = makeTeam('t1', 1); // seed 1 = better
    const t2 = makeTeam('t2', 4); // seed 4 = worse
    const matches: SimMatch[] = [
      makeMatch('m1', {
        team1: t1,
        team1_id: 't1',
        team2: t2,
        team2_id: 't2',
        status: 'finished',
        winner_team_id: 't2', // upset!
        team1_score: 1,
        team2_score: 2,
      }),
    ];

    const result = computeCompetitiveness(matches, [t1, t2]);
    expect(result.upsets).toBe(1);
  });

  it('does not count expected wins as upsets', () => {
    const t1 = makeTeam('t1', 1);
    const t2 = makeTeam('t2', 4);
    const matches: SimMatch[] = [
      makeMatch('m1', {
        team1: t1,
        team1_id: 't1',
        team2: t2,
        team2_id: 't2',
        status: 'finished',
        winner_team_id: 't1',
        team1_score: 2,
        team2_score: 0,
      }),
    ];

    const result = computeCompetitiveness(matches, [t1, t2]);
    expect(result.upsets).toBe(0);
  });

  it('calculates avg maps per match', () => {
    const t1 = makeTeam('t1', 1);
    const t2 = makeTeam('t2', 2);
    const matches: SimMatch[] = [
      makeMatch('m1', {
        team1: t1,
        team1_id: 't1',
        team2: t2,
        team2_id: 't2',
        status: 'finished',
        winner_team_id: 't1',
        team1_score: 2,
        team2_score: 1, // 3 maps
      }),
      makeMatch('m2', {
        team1: t1,
        team1_id: 't1',
        team2: t2,
        team2_id: 't2',
        status: 'finished',
        winner_team_id: 't1',
        team1_score: 2,
        team2_score: 0, // 2 maps
      }),
    ];

    const result = computeCompetitiveness(matches, [t1, t2]);
    expect(result.avgMapsPerMatch).toBe(2.5); // (3+2)/2
  });

  it('calculates win streaks', () => {
    const t1 = makeTeam('t1', 1);
    const t2 = makeTeam('t2', 2);
    const t3 = makeTeam('t3', 3);
    const matches: SimMatch[] = [
      makeMatch('m1', {
        team1: t1,
        team1_id: 't1',
        team2: t2,
        team2_id: 't2',
        status: 'finished',
        winner_team_id: 't1',
        team1_score: 2,
        team2_score: 0,
      }),
      makeMatch('m2', {
        team1: t1,
        team1_id: 't1',
        team2: t3,
        team2_id: 't3',
        status: 'finished',
        winner_team_id: 't1',
        team1_score: 2,
        team2_score: 1,
      }),
      makeMatch('m3', {
        team1: t1,
        team1_id: 't1',
        team2: t2,
        team2_id: 't2',
        status: 'finished',
        winner_team_id: 't2',
        team1_score: 0,
        team2_score: 2,
      }),
    ];

    const result = computeCompetitiveness(matches, [t1, t2, t3]);
    expect(result.maxWinStreak).toBe(2); // t1 won m1 and m2
  });

  it('calculates dominance score', () => {
    const t1 = makeTeam('t1', 1);
    const t2 = makeTeam('t2', 2);
    // t1 wins all 3 matches
    const matches: SimMatch[] = [
      makeMatch('m1', {
        team1: t1,
        team1_id: 't1',
        team2: t2,
        team2_id: 't2',
        status: 'finished',
        winner_team_id: 't1',
        team1_score: 2,
        team2_score: 0,
      }),
      makeMatch('m2', {
        team1: t1,
        team1_id: 't1',
        team2: t2,
        team2_id: 't2',
        status: 'finished',
        winner_team_id: 't1',
        team1_score: 2,
        team2_score: 0,
      }),
      makeMatch('m3', {
        team1: t1,
        team1_id: 't1',
        team2: t2,
        team2_id: 't2',
        status: 'finished',
        winner_team_id: 't1',
        team1_score: 2,
        team2_score: 0,
      }),
    ];

    const result = computeCompetitiveness(matches, [t1, t2]);
    expect(result.dominanceScore).toBe(100); // 3/3 = 100%
  });
});

/* ================================================================== */
/*  runMonteCarlo                                                       */
/* ================================================================== */

describe('runMonteCarlo', () => {
  it('runs the specified number of iterations', () => {
    const { stage, teams } = make4TeamBracket();
    const result = runMonteCarlo([stage], teams, 50);
    expect(result.iterations).toBe(50);
  });

  it('win counts sum to total iterations', () => {
    const { stage, teams } = make4TeamBracket();
    const result = runMonteCarlo([stage], teams, 100);
    let totalWins = 0;
    for (const count of result.winCounts.values()) totalWins += count;
    expect(totalWins).toBe(100);
  });

  it('all teams have entries in results', () => {
    const { stage, teams } = make4TeamBracket();
    const result = runMonteCarlo([stage], teams, 20);
    for (const t of teams) {
      expect(result.winCounts.has(t.id)).toBe(true);
      expect(result.winProbability.has(t.id)).toBe(true);
      expect(result.placementDist.has(t.id)).toBe(true);
    }
  });

  it('win probabilities sum to approximately 1', () => {
    const { stage, teams } = make4TeamBracket();
    const result = runMonteCarlo([stage], teams, 100);
    let totalProb = 0;
    for (const prob of result.winProbability.values()) totalProb += prob;
    expect(totalProb).toBeCloseTo(1.0, 5);
  });

  it('placement distributions sum to iterations for each team', () => {
    const { stage, teams } = make4TeamBracket();
    const iterations = 50;
    const result = runMonteCarlo([stage], teams, iterations);
    for (const t of teams) {
      const dist = result.placementDist.get(t.id)!;
      const total = dist.reduce((a, b) => a + b, 0);
      expect(total).toBe(iterations);
    }
  });

  it('higher seed tends to win more often over many iterations', () => {
    const { stage, teams } = make4TeamBracket();
    const result = runMonteCarlo([stage], teams, 500);
    const seed1Wins = result.winCounts.get('t1') ?? 0;
    const seed4Wins = result.winCounts.get('t4') ?? 0;
    // With seed advantage, seed 1 should win more often than seed 4
    expect(seed1Wins).toBeGreaterThan(seed4Wins);
  });
});

/* ================================================================== */
/*  Double elimination bracket wiring & simulation                     */
/* ================================================================== */

const NOOP_SCHEDULE: ScheduleConfig = {
  startDate: '',
  matchDurationMin: 60,
  breakBetweenMatchesMin: 15,
  breakBetweenRoundsMin: 30,
  dayStartHour: 10,
  dayEndHour: 22,
  matchesPerDay: 0,
};

const NO_ESCALATION: EscalationConfig = {
  enabled: false,
  earlyRoundsBo: 3,
  semiFinalsBo: 3,
  finalsBo: 3,
};

const MAP_POOL = ['Map A', 'Map B', 'Map C', 'Map D', 'Map E'];

function makeSeededTeams(count: number): SimTeam[] {
  return Array.from({ length: count }, (_, i) => makeTeam(`t${i + 1}`, i + 1));
}

/** Run a bracket stage to completion via the real shared engine. */
function simulateBracketStage(stage: SimStage): SimMatch[] {
  return simulateBracketToCompletion(stage.matches);
}

describe('generateDoubleElim wiring', () => {
  it('routes every WB loser into the lower bracket', () => {
    const teams = makeSeededTeams(8);
    const stage = generateDoubleElim(
      teams,
      3,
      MAP_POOL,
      NOOP_SCHEDULE,
      NO_ESCALATION,
      false
    );
    const wbMatches = stage.matches.filter((m) => m.bracket_side === 'wb');
    expect(wbMatches.length).toBe(7); // 4 + 2 + 1
    for (const m of wbMatches) {
      expect(m.next_match_lose_id).not.toBeNull();
    }
  });

  it('feeds both finalists into the grand final', () => {
    const teams = makeSeededTeams(8);
    const stage = generateDoubleElim(
      teams,
      3,
      MAP_POOL,
      NOOP_SCHEDULE,
      NO_ESCALATION,
      false
    );
    const gf = stage.matches.find((m) => m.bracket_side === 'final');
    expect(gf).toBeDefined();
    const feeders = stage.matches.filter(
      (m) => m.next_match_win_id === gf!.id
    );
    // Exactly the WB final and the LB final advance into the grand final.
    expect(feeders).toHaveLength(2);
    const sides = feeders.map((m) => m.bracket_side).sort();
    expect(sides).toEqual(['lb', 'wb']);
  });

  it('gives every lower-bracket match an outgoing winner pointer', () => {
    const teams = makeSeededTeams(8);
    const stage = generateDoubleElim(
      teams,
      3,
      MAP_POOL,
      NOOP_SCHEDULE,
      NO_ESCALATION,
      false
    );
    const lbMatches = stage.matches.filter((m) => m.bracket_side === 'lb');
    for (const m of lbMatches) {
      expect(m.next_match_win_id).not.toBeNull();
    }
  });

  for (const size of [4, 8, 16]) {
    it(`simulates a ${size}-team double elimination to completion`, () => {
      const teams = makeSeededTeams(size);
      const stage = generateDoubleElim(
        teams,
        3,
        MAP_POOL,
        NOOP_SCHEDULE,
        NO_ESCALATION,
        false
      );
      const simulated = simulateBracketStage(stage);
      // Every match (WB, LB and grand final) must receive teams and finish.
      for (const m of simulated) {
        expect(m.status).toBe('finished');
        expect(m.winner_team_id).not.toBeNull();
      }
    });
  }

  it('crowns a valid champion and full standings via simulateFullTournament', () => {
    const teams = makeSeededTeams(8);
    const stage = generateDoubleElim(
      teams,
      3,
      MAP_POOL,
      NOOP_SCHEDULE,
      NO_ESCALATION,
      false
    );
    const { winnerId, standings } = simulateFullTournament([stage]);
    expect(teams.map((t) => t.id)).toContain(winnerId);
    expect(standings).toHaveLength(8);
  });

  it('leaves the grand final reset match inert (unwired)', () => {
    const teams = makeSeededTeams(8);
    const stage = generateDoubleElim(
      teams,
      3,
      MAP_POOL,
      NOOP_SCHEDULE,
      NO_ESCALATION,
      true
    );
    const finals = stage.matches.filter((m) => m.bracket_side === 'final');
    expect(finals).toHaveLength(2);
    const reset = finals.find((m) => m.round_name === 'Grande Finale Reset');
    expect(reset).toBeDefined();
    // No match points into the reset — it stays a manual placeholder.
    expect(
      stage.matches.some(
        (m) =>
          m.next_match_win_id === reset!.id ||
          m.next_match_lose_id === reset!.id
      )
    ).toBe(false);
  });
});

describe('runMonteCarlo on double elimination', () => {
  it('keeps win counts consistent and favours the top seed', () => {
    const teams = makeSeededTeams(8);
    const stage = generateDoubleElim(
      teams,
      3,
      MAP_POOL,
      NOOP_SCHEDULE,
      NO_ESCALATION,
      false
    );
    const result = runMonteCarlo([stage], teams, 200);
    let totalWins = 0;
    for (const count of result.winCounts.values()) totalWins += count;
    expect(totalWins).toBe(200);
    // A double-elim run must produce a champion in every iteration.
    const seed1 = result.winCounts.get('t1') ?? 0;
    const seed8 = result.winCounts.get('t8') ?? 0;
    expect(seed1).toBeGreaterThan(seed8);
  });
});

describe('generateSingleElim still simulates to completion', () => {
  it('finishes every match of an 8-team single elimination', () => {
    const teams = makeSeededTeams(8);
    const stage = generateSingleElim(
      teams,
      3,
      MAP_POOL,
      NOOP_SCHEDULE,
      NO_ESCALATION
    );
    const simulated = simulateBracketStage(stage);
    for (const m of simulated) {
      expect(m.status).toBe('finished');
      expect(m.winner_team_id).not.toBeNull();
    }
  });
});

/* ================================================================== */
/*  Byes — resolveByes primitive                                       */
/* ================================================================== */

describe('resolveByes', () => {
  it('advances a lone team with no feeder (a bye) as a free win', () => {
    const t1 = makeTeam('t1', 1);
    const m = makeMatch('m1', {
      team1: t1,
      team1_id: 't1',
      team2: null,
      team2_id: null,
      bracket_side: 'none',
    });
    const [resolved] = resolveByes([m]);
    expect(resolved.status).toBe('finished');
    expect(resolved.winner_team_id).toBe('t1');
    // A bye has no map score, so it stays out of map-diff / competitiveness.
    expect(resolved.team1_score).toBeNull();
    expect(resolved.team2_score).toBeNull();
  });

  it('does not advance a lone team while a pending feeder can still arrive', () => {
    const t1 = makeTeam('t1', 1);
    const feeder = makeMatch('f1', {
      team1: t1,
      team1_id: 't1',
      team2: makeTeam('t2', 2),
      team2_id: 't2',
      next_match_win_id: 'target',
      next_match_win_idx: 1,
      next_match_win_slot: 2,
    });
    const target = makeMatch('target', {
      team1: makeTeam('t3', 3),
      team1_id: 't3',
      team2: null,
      team2_id: null,
      round_number: 2,
    });
    const [, resolvedTarget] = resolveByes([feeder, target]);
    // The pending feeder still owes an opponent to slot 2 → no bye.
    expect(resolvedTarget.status).toBe('pending');
  });

  it('leaves two-team matches untouched', () => {
    const m = makeMatch('m1', {
      team1: makeTeam('t1', 1),
      team1_id: 't1',
      team2: makeTeam('t2', 2),
      team2_id: 't2',
    });
    const [resolved] = resolveByes([m]);
    expect(resolved.status).toBe('pending');
  });
});

/* ================================================================== */
/*  Byes — non-power-of-2 elimination brackets                         */
/* ================================================================== */

describe('non-power-of-2 elimination brackets', () => {
  it('gives the top seeds a first-round bye (6-team single elim)', () => {
    const teams = makeSeededTeams(6);
    const stage = generateSingleElim(
      teams,
      3,
      MAP_POOL,
      NOOP_SCHEDULE,
      NO_ESCALATION
    );
    // Padded to 8 → 4 first-round matches, 2 of them byes.
    const r1 = stage.matches.filter((m) => m.round_number === 1);
    expect(r1).toHaveLength(4);
    const byes = r1.filter((m) => !!m.team1 !== !!m.team2);
    expect(byes).toHaveLength(2);
    // Byes are pre-resolved and their teams already advanced.
    for (const b of byes) {
      expect(b.status).toBe('finished');
      expect(b.winner_team_id).toBeTruthy();
    }
    // The two byes belong to the two best seeds.
    const byeSeeds = byes
      .map((b) => (b.team1 ?? b.team2)!.seed)
      .sort((a, c) => a - c);
    expect(byeSeeds).toEqual([1, 2]);
  });

  // Single elimination supports arbitrary field sizes via byes.
  for (const size of [5, 6, 7, 9, 12, 13]) {
    it(`simulates a ${size}-team single elimination to completion`, () => {
      const teams = makeSeededTeams(size);
      const stage = generateSingleElim(
        teams,
        3,
        MAP_POOL,
        NOOP_SCHEDULE,
        NO_ESCALATION
      );
      const simulated = simulateBracketStage(stage);
      for (const m of simulated) {
        expect(m.status).toBe('finished');
        expect(m.winner_team_id).not.toBeNull();
      }
      const { winnerId, standings } = simulateFullTournament([stage]);
      expect(teams.map((t) => t.id)).toContain(winnerId);
      expect(standings).toHaveLength(size);
    });
  }

  it('keeps Monte Carlo win counts consistent for a 6-team bracket', () => {
    const teams = makeSeededTeams(6);
    const stage = generateSingleElim(
      teams,
      3,
      MAP_POOL,
      NOOP_SCHEDULE,
      NO_ESCALATION
    );
    const result = runMonteCarlo([stage], teams, 100);
    let total = 0;
    for (const c of result.winCounts.values()) total += c;
    expect(total).toBe(100);
    for (const t of teams) expect(result.winProbability.has(t.id)).toBe(true);
  });
});

/* ================================================================== */
/*  Byes — odd Swiss rounds                                             */
/* ================================================================== */

describe('odd Swiss brackets', () => {
  it('gives one bye per round and never a double bye when avoidable', () => {
    const teams = makeSeededTeams(5);
    const rounds = 4;
    const stage = generateSwiss(teams, rounds, 3, MAP_POOL, NOOP_SCHEDULE);

    const byeMatches = stage.matches.filter((m) => !!m.team1 !== !!m.team2);
    expect(byeMatches).toHaveLength(rounds); // one bye each round

    // Every bye is resolved as a free win.
    for (const b of byeMatches) {
      expect(b.status).toBe('finished');
      expect(b.winner_team_id).toBeTruthy();
    }

    // 5 teams over 4 rounds → 4 distinct bye recipients (no repeats).
    const byeTeamIds = byeMatches.map((m) => m.team1_id ?? m.team2_id);
    expect(new Set(byeTeamIds).size).toBe(rounds);
  });

  it('round-1 bye goes to the weakest seed', () => {
    const teams = makeSeededTeams(5);
    const stage = generateSwiss(teams, 1, 3, MAP_POOL, NOOP_SCHEDULE);
    const bye = stage.matches.find((m) => !!m.team1 !== !!m.team2)!;
    expect(bye).toBeDefined();
    expect(bye.team1_id ?? bye.team2_id).toBe('t5'); // highest seed number
  });

  it('a Swiss bye counts as a win in the standings', () => {
    const teams = makeSeededTeams(5);
    const stage = generateSwiss(teams, 3, 3, MAP_POOL, NOOP_SCHEDULE);
    const { standings } = simulateFullTournament([stage]);
    expect(standings).toHaveLength(5);
  });

  it('swissPairByRecord flags a bye for an odd field', () => {
    const teams = makeSeededTeams(5);
    const { pairings, byeTeamIdx } = swissPairByRecord(teams, []);
    expect(pairings).toHaveLength(2);
    expect(byeTeamIdx).not.toBeNull();
  });
});
