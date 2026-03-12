import { describe, it, expect, vi } from 'vitest';

// Mock supabase before importing standings (top-level import in standings.ts)
vi.mock('../../utils/supabase', () => ({
  supabaseAdmin: {},
}));

import {
  computeGroupStandings,
  computeBracketStandings,
} from '../../utils/stages/standings';

// Minimal types matching what the functions expect
type StageTeamRow = {
  team_id: string;
  seed: number | null;
  team: { id: string; name: string; short_name: string | null } | null;
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

function makeTeam(id: string, name: string, seed: number | null = null): StageTeamRow {
  return {
    team_id: id,
    seed,
    team: { id, name, short_name: null },
  };
}

function makeFinishedMatch(
  id: string,
  overrides: Partial<DbMatch> = {}
): DbMatch {
  return {
    id,
    status: 'finished',
    is_bye: false,
    round_number: 1,
    team1_id: null,
    team2_id: null,
    winner_team_id: null,
    team1_score: null,
    team2_score: null,
    ...overrides,
  };
}

/* -----------------------------------------------------------
 * Group / Round Robin standings
 * ---------------------------------------------------------*/

describe('computeGroupStandings', () => {
  it('returns empty array for no teams', () => {
    const result = computeGroupStandings([], []);
    expect(result).toEqual([]);
  });

  it('returns all teams with zero stats when no matches', () => {
    const teams = [makeTeam('t1', 'Alpha'), makeTeam('t2', 'Beta')];
    const result = computeGroupStandings(teams, []);

    expect(result).toHaveLength(2);
    for (const s of result) {
      expect(s.wins).toBe(0);
      expect(s.losses).toBe(0);
      expect(s.draws).toBe(0);
      expect(s.score).toBe(0);
    }
  });

  it('calculates wins/losses/points correctly', () => {
    const teams = [
      makeTeam('t1', 'Alpha'),
      makeTeam('t2', 'Beta'),
      makeTeam('t3', 'Gamma'),
    ];

    const matches = [
      // t1 beats t2: 2-0
      makeFinishedMatch('m1', {
        team1_id: 't1',
        team2_id: 't2',
        winner_team_id: 't1',
        team1_score: 2,
        team2_score: 0,
      }),
      // t1 beats t3: 2-1
      makeFinishedMatch('m2', {
        team1_id: 't1',
        team2_id: 't3',
        winner_team_id: 't1',
        team1_score: 2,
        team2_score: 1,
      }),
      // t2 beats t3: 1-0
      makeFinishedMatch('m3', {
        team1_id: 't2',
        team2_id: 't3',
        winner_team_id: 't2',
        team1_score: 1,
        team2_score: 0,
      }),
    ];

    const result = computeGroupStandings(teams, matches);

    // t1: 2W 0L → 6pts, t2: 1W 1L → 3pts, t3: 0W 2L → 0pts
    expect(result[0].teamId).toBe('t1');
    expect(result[0].wins).toBe(2);
    expect(result[0].losses).toBe(0);
    expect(result[0].score).toBe(6); // 2 * 3pts

    expect(result[1].teamId).toBe('t2');
    expect(result[1].wins).toBe(1);
    expect(result[1].losses).toBe(1);
    expect(result[1].score).toBe(3);

    expect(result[2].teamId).toBe('t3');
    expect(result[2].wins).toBe(0);
    expect(result[2].losses).toBe(2);
    expect(result[2].score).toBe(0);
  });

  it('handles draws correctly', () => {
    const teams = [makeTeam('t1', 'Alpha'), makeTeam('t2', 'Beta')];

    const matches = [
      // Draw (no winner)
      makeFinishedMatch('m1', {
        team1_id: 't1',
        team2_id: 't2',
        winner_team_id: null,
        team1_score: 1,
        team2_score: 1,
      }),
    ];

    const result = computeGroupStandings(teams, matches);

    expect(result[0].draws).toBe(1);
    expect(result[0].score).toBe(1); // 1pt for draw
    expect(result[1].draws).toBe(1);
    expect(result[1].score).toBe(1);
  });

  it('uses score differential as tiebreaker', () => {
    const teams = [
      makeTeam('t1', 'Alpha'),
      makeTeam('t2', 'Beta'),
      makeTeam('t3', 'Gamma'),
    ];

    const matches = [
      // t1 beats t3: 3-0 (big score diff)
      makeFinishedMatch('m1', {
        team1_id: 't1',
        team2_id: 't3',
        winner_team_id: 't1',
        team1_score: 3,
        team2_score: 0,
      }),
      // t2 beats t3: 1-0 (small score diff)
      makeFinishedMatch('m2', {
        team1_id: 't2',
        team2_id: 't3',
        winner_team_id: 't2',
        team1_score: 1,
        team2_score: 0,
      }),
    ];

    const result = computeGroupStandings(teams, matches);

    // Both have 3pts (1 win), but t1 has better score diff (+3 vs +1)
    expect(result[0].teamId).toBe('t1');
    expect(result[1].teamId).toBe('t2');
  });

  it('assigns rank sequentially', () => {
    const teams = [
      makeTeam('t1', 'Alpha'),
      makeTeam('t2', 'Beta'),
      makeTeam('t3', 'Gamma'),
    ];

    const result = computeGroupStandings(teams, []);

    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
    expect(result[2].rank).toBe(3);
  });

  it('populates team names', () => {
    const teams = [makeTeam('t1', 'Alpha Team')];
    const result = computeGroupStandings(teams, []);

    expect(result[0].teamName).toBe('Alpha Team');
  });

  it('skips matches with missing team ids', () => {
    const teams = [makeTeam('t1', 'Alpha'), makeTeam('t2', 'Beta')];

    const matches = [
      // Match with missing team2
      makeFinishedMatch('m1', {
        team1_id: 't1',
        team2_id: null,
        winner_team_id: 't1',
        team1_score: 1,
        team2_score: 0,
      }),
    ];

    const result = computeGroupStandings(teams, matches);

    // Should ignore the match since team2_id is null
    expect(result[0].wins).toBe(0);
    expect(result[1].wins).toBe(0);
  });
});

/* -----------------------------------------------------------
 * Bracket standings
 * ---------------------------------------------------------*/

describe('computeBracketStandings', () => {
  it('returns empty array for no teams', () => {
    const result = computeBracketStandings([], [], []);
    expect(result).toEqual([]);
  });

  it('ranks teams by furthest round won', () => {
    const teams = [
      makeTeam('t1', 'Alpha', 1),
      makeTeam('t2', 'Beta', 2),
      makeTeam('t3', 'Gamma', 3),
      makeTeam('t4', 'Delta', 4),
    ];

    const allMatches = [
      makeFinishedMatch('sf1', {
        team1_id: 't1',
        team2_id: 't3',
        winner_team_id: 't1',
        round_number: 1,
      }),
      makeFinishedMatch('sf2', {
        team1_id: 't2',
        team2_id: 't4',
        winner_team_id: 't2',
        round_number: 1,
      }),
      makeFinishedMatch('f1', {
        team1_id: 't1',
        team2_id: 't2',
        winner_team_id: 't1',
        round_number: 2,
      }),
    ];

    const finishedMatches = allMatches.filter((m) => m.status === 'finished');

    const result = computeBracketStandings(
      teams,
      finishedMatches,
      allMatches
    );

    // t1 won round 2 (final) → rank 1
    // t2 won round 1 (semi) → rank 2
    // t3 and t4 never won → ranked by seed
    expect(result[0].teamId).toBe('t1');
    expect(result[0].wins).toBe(2);
    expect(result[1].teamId).toBe('t2');
    expect(result[1].wins).toBe(1);
  });

  it('uses seed as tiebreaker for teams with same results', () => {
    const teams = [
      makeTeam('t1', 'Alpha', 3),
      makeTeam('t2', 'Beta', 1),
    ];

    // No matches played yet
    const result = computeBracketStandings(teams, [], []);

    // Both have 0 wins, t2 has better seed (1 < 3)
    expect(result[0].teamId).toBe('t2');
    expect(result[1].teamId).toBe('t1');
  });

  it('tracks wins and losses correctly', () => {
    const teams = [
      makeTeam('t1', 'Alpha'),
      makeTeam('t2', 'Beta'),
    ];

    const matches = [
      makeFinishedMatch('m1', {
        team1_id: 't1',
        team2_id: 't2',
        winner_team_id: 't1',
        round_number: 1,
      }),
    ];

    const result = computeBracketStandings(teams, matches, matches);

    const t1 = result.find((r) => r.teamId === 't1')!;
    const t2 = result.find((r) => r.teamId === 't2')!;

    expect(t1.wins).toBe(1);
    expect(t1.losses).toBe(0);
    expect(t2.wins).toBe(0);
    expect(t2.losses).toBe(1);
  });

  it('draws are always 0 in bracket', () => {
    const teams = [makeTeam('t1', 'Alpha')];
    const result = computeBracketStandings(teams, [], []);
    expect(result[0].draws).toBe(0);
  });

  it('score field reflects lastWinRound', () => {
    const teams = [makeTeam('t1', 'Alpha'), makeTeam('t2', 'Beta')];

    const matches = [
      makeFinishedMatch('m1', {
        team1_id: 't1',
        team2_id: 't2',
        winner_team_id: 't1',
        round_number: 3,
      }),
    ];

    const result = computeBracketStandings(teams, matches, matches);
    const t1 = result.find((r) => r.teamId === 't1')!;
    expect(t1.score).toBe(3); // lastWinRound = 3
  });
});
