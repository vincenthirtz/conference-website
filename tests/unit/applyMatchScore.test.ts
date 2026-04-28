import { describe, it, expect, vi } from 'vitest';

// computeWinnerFromScores is a pure helper, but its module imports
// supabaseAdmin (and indirectly the bracket/propagate module which also
// imports supabase). Mock both to keep the test module-level evaluation pure.
vi.mock('../../utils/supabase', () => ({
  supabaseAdmin: { from: () => ({}) },
}));

import { computeWinnerFromScores } from '../../utils/matches/applyScore';

describe('computeWinnerFromScores — BYE matches', () => {
  it('returns team1 when bye and team1 is set', () => {
    expect(computeWinnerFromScores('team-a', null, 0, 0, true)).toBe('team-a');
  });

  it('returns team2 when bye and only team2 is set', () => {
    expect(computeWinnerFromScores(null, 'team-b', 0, 0, true)).toBe('team-b');
  });

  it('returns team1 when bye and both teams are set', () => {
    expect(computeWinnerFromScores('team-a', 'team-b', 0, 0, true)).toBe(
      'team-a'
    );
  });

  it('returns null when bye but no team present', () => {
    expect(computeWinnerFromScores(null, null, 0, 0, true)).toBeNull();
  });

  it('bye ignores actual scores', () => {
    // Even with team2 winning on score, bye → team1 wins
    expect(computeWinnerFromScores('team-a', 'team-b', 0, 5, true)).toBe(
      'team-a'
    );
  });
});

describe('computeWinnerFromScores — score-based winner', () => {
  it('team1 wins when team1Score > team2Score', () => {
    expect(computeWinnerFromScores('team-a', 'team-b', 3, 1, false)).toBe(
      'team-a'
    );
  });

  it('team2 wins when team2Score > team1Score', () => {
    expect(computeWinnerFromScores('team-a', 'team-b', 1, 3, false)).toBe(
      'team-b'
    );
  });

  it('returns null on a tie', () => {
    expect(computeWinnerFromScores('team-a', 'team-b', 2, 2, false)).toBeNull();
  });

  it('returns null on 0-0 tie', () => {
    expect(computeWinnerFromScores('team-a', 'team-b', 0, 0, false)).toBeNull();
  });

  it('handles single-map BO1 (1-0)', () => {
    expect(computeWinnerFromScores('team-a', 'team-b', 1, 0, false)).toBe(
      'team-a'
    );
  });

  it('handles BO5 sweep (3-0)', () => {
    expect(computeWinnerFromScores('team-a', 'team-b', 3, 0, false)).toBe(
      'team-a'
    );
  });
});

describe('computeWinnerFromScores — invalid configs', () => {
  it('returns null when team1_id is missing (non-bye)', () => {
    expect(computeWinnerFromScores(null, 'team-b', 2, 1, false)).toBeNull();
  });

  it('returns null when team2_id is missing (non-bye)', () => {
    expect(computeWinnerFromScores('team-a', null, 2, 1, false)).toBeNull();
  });

  it('returns null when both team ids are missing (non-bye)', () => {
    expect(computeWinnerFromScores(null, null, 2, 1, false)).toBeNull();
  });

  it('treats null isBye like false', () => {
    // is_bye column is nullable — null should behave like false
    expect(computeWinnerFromScores('team-a', 'team-b', 2, 1, null)).toBe(
      'team-a'
    );
  });

  it('returns null when isBye=null and a team is missing', () => {
    expect(computeWinnerFromScores(null, 'team-b', 2, 1, null)).toBeNull();
  });
});

describe('computeWinnerFromScores — edge cases', () => {
  it('ties propagate as null even with very high scores', () => {
    expect(
      computeWinnerFromScores('team-a', 'team-b', 10, 10, false)
    ).toBeNull();
  });

  it('one-point margin still produces a winner', () => {
    expect(computeWinnerFromScores('team-a', 'team-b', 4, 3, false)).toBe(
      'team-a'
    );
  });
});
