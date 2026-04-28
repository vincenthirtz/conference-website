import { describe, it, expect, vi } from 'vitest';

// computeWinnerLoserFromMatch is a pure helper, but its module imports
// supabaseAdmin at the top level — mock it to prevent env-var init from
// throwing during test boot.
vi.mock('../../utils/supabase', () => ({
  supabaseAdmin: { from: () => ({}) },
}));

import { computeWinnerLoserFromMatch } from '../../utils/bracket/propagate';
import type { MatchRow } from '../../types/bracket';

function makeMatch(overrides: Partial<MatchRow> = {}): MatchRow {
  return {
    id: 'm1',
    tournament_id: 't1',
    stage_id: 's1',
    status: 'pending',
    is_bye: false,
    team1_id: null,
    team2_id: null,
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    bracket_side: 'wb',
    round_number: 1,
    group_key: null,
    next_match_win_id: null,
    next_match_win_slot: null,
    next_match_lose_id: null,
    next_match_lose_slot: null,
    ...overrides,
  };
}

describe('computeWinnerLoserFromMatch — BYE matches', () => {
  it('promotes the only team in slot 1 when bye', () => {
    const match = makeMatch({
      is_bye: true,
      team1_id: 'team-a',
      team2_id: null,
    });
    const result = computeWinnerLoserFromMatch(match);
    expect(result).toEqual({ winnerTeamId: 'team-a', loserTeamId: null });
  });

  it('promotes the only team in slot 2 when bye', () => {
    const match = makeMatch({
      is_bye: true,
      team1_id: null,
      team2_id: 'team-b',
    });
    const result = computeWinnerLoserFromMatch(match);
    expect(result).toEqual({ winnerTeamId: 'team-b', loserTeamId: null });
  });

  it('returns null winner when bye has no team', () => {
    const match = makeMatch({ is_bye: true, team1_id: null, team2_id: null });
    const result = computeWinnerLoserFromMatch(match);
    expect(result).toEqual({ winnerTeamId: null, loserTeamId: null });
  });

  it('bye takes precedence over scores', () => {
    const match = makeMatch({
      is_bye: true,
      team1_id: 'team-a',
      team2_id: 'team-b',
      team1_score: 0,
      team2_score: 5,
    });
    const result = computeWinnerLoserFromMatch(match);
    expect(result.winnerTeamId).toBe('team-a');
    expect(result.loserTeamId).toBeNull();
  });
});

describe('computeWinnerLoserFromMatch — explicit winner_team_id', () => {
  it('uses winner_team_id as source of truth when team1 wins', () => {
    const match = makeMatch({
      team1_id: 'team-a',
      team2_id: 'team-b',
      winner_team_id: 'team-a',
      team1_score: 0,
      team2_score: 2,
    });
    const result = computeWinnerLoserFromMatch(match);
    expect(result).toEqual({ winnerTeamId: 'team-a', loserTeamId: 'team-b' });
  });

  it('uses winner_team_id when team2 wins', () => {
    const match = makeMatch({
      team1_id: 'team-a',
      team2_id: 'team-b',
      winner_team_id: 'team-b',
      team1_score: 2,
      team2_score: 0,
    });
    const result = computeWinnerLoserFromMatch(match);
    expect(result).toEqual({ winnerTeamId: 'team-b', loserTeamId: 'team-a' });
  });

  it('returns null loser when winner_team_id matches no team in the match', () => {
    const match = makeMatch({
      team1_id: 'team-a',
      team2_id: 'team-b',
      winner_team_id: 'team-c',
    });
    const result = computeWinnerLoserFromMatch(match);
    expect(result.winnerTeamId).toBe('team-c');
    expect(result.loserTeamId).toBeNull();
  });
});

describe('computeWinnerLoserFromMatch — score deduction', () => {
  it('deduces team1 winner when team1_score > team2_score', () => {
    const match = makeMatch({
      team1_id: 'team-a',
      team2_id: 'team-b',
      team1_score: 2,
      team2_score: 1,
    });
    const result = computeWinnerLoserFromMatch(match);
    expect(result).toEqual({ winnerTeamId: 'team-a', loserTeamId: 'team-b' });
  });

  it('deduces team2 winner when team2_score > team1_score', () => {
    const match = makeMatch({
      team1_id: 'team-a',
      team2_id: 'team-b',
      team1_score: 0,
      team2_score: 3,
    });
    const result = computeWinnerLoserFromMatch(match);
    expect(result).toEqual({ winnerTeamId: 'team-b', loserTeamId: 'team-a' });
  });

  it('returns nulls on a tie (no propagation)', () => {
    const match = makeMatch({
      team1_id: 'team-a',
      team2_id: 'team-b',
      team1_score: 2,
      team2_score: 2,
    });
    const result = computeWinnerLoserFromMatch(match);
    expect(result).toEqual({ winnerTeamId: null, loserTeamId: null });
  });

  it('returns nulls when team1_score is null', () => {
    const match = makeMatch({
      team1_id: 'team-a',
      team2_id: 'team-b',
      team1_score: null,
      team2_score: 2,
    });
    const result = computeWinnerLoserFromMatch(match);
    expect(result).toEqual({ winnerTeamId: null, loserTeamId: null });
  });

  it('returns nulls when team2_score is null', () => {
    const match = makeMatch({
      team1_id: 'team-a',
      team2_id: 'team-b',
      team1_score: 2,
      team2_score: null,
    });
    const result = computeWinnerLoserFromMatch(match);
    expect(result).toEqual({ winnerTeamId: null, loserTeamId: null });
  });

  it('returns nulls when team1_id is missing even with valid scores', () => {
    const match = makeMatch({
      team1_id: null,
      team2_id: 'team-b',
      team1_score: 0,
      team2_score: 2,
    });
    const result = computeWinnerLoserFromMatch(match);
    expect(result).toEqual({ winnerTeamId: null, loserTeamId: null });
  });

  it('returns nulls when team2_id is missing even with valid scores', () => {
    const match = makeMatch({
      team1_id: 'team-a',
      team2_id: null,
      team1_score: 2,
      team2_score: 0,
    });
    const result = computeWinnerLoserFromMatch(match);
    expect(result).toEqual({ winnerTeamId: null, loserTeamId: null });
  });
});

describe('computeWinnerLoserFromMatch — precedence rules', () => {
  it('explicit winner_team_id beats score deduction (even if scores would say otherwise)', () => {
    const match = makeMatch({
      team1_id: 'team-a',
      team2_id: 'team-b',
      team1_score: 0,
      team2_score: 5,
      winner_team_id: 'team-a',
    });
    const result = computeWinnerLoserFromMatch(match);
    expect(result.winnerTeamId).toBe('team-a');
    expect(result.loserTeamId).toBe('team-b');
  });

  it('returns nulls with no winner_team_id and no scores', () => {
    const match = makeMatch({
      team1_id: 'team-a',
      team2_id: 'team-b',
    });
    const result = computeWinnerLoserFromMatch(match);
    expect(result).toEqual({ winnerTeamId: null, loserTeamId: null });
  });
});
