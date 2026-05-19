// Tests unit pour computeWinnerLoserFromMatch (utils/bracket/propagate.ts).
// Fonction pure — pas de DB. (P2-A)

import { describe, it, expect } from 'vitest';
import { computeWinnerLoserFromMatch } from '../../utils/bracket/propagate';
import type { MatchRow } from '../../types/bracket';

function makeMatch(over: Partial<MatchRow>): MatchRow {
  return {
    id: 'm1',
    tournament_id: 't1',
    stage_id: 's1',
    status: 'finished',
    is_bye: false,
    match_format: 'bo1',
    team1_id: null,
    team2_id: null,
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    forfeit_team_id: null,
    completed_at: null,
    updated_at: null,
    round_number: 1,
    bracket_side: null,
    next_match_win_id: null,
    next_match_win_slot: null,
    next_match_lose_id: null,
    next_match_lose_slot: null,
    ...over,
  } as MatchRow;
}

describe('computeWinnerLoserFromMatch', () => {
  it('BYE avec team1 présente : team1 wins, no loser', () => {
    const m = makeMatch({ is_bye: true, team1_id: 'A', team2_id: null });
    expect(computeWinnerLoserFromMatch(m)).toEqual({
      winnerTeamId: 'A',
      loserTeamId: null,
    });
  });

  it('BYE avec team2 présente : team2 wins, no loser', () => {
    const m = makeMatch({ is_bye: true, team1_id: null, team2_id: 'B' });
    expect(computeWinnerLoserFromMatch(m)).toEqual({
      winnerTeamId: 'B',
      loserTeamId: null,
    });
  });

  it('winner_team_id explicite = team1 : loser = team2', () => {
    const m = makeMatch({
      team1_id: 'A',
      team2_id: 'B',
      winner_team_id: 'A',
    });
    expect(computeWinnerLoserFromMatch(m)).toEqual({
      winnerTeamId: 'A',
      loserTeamId: 'B',
    });
  });

  it('winner_team_id explicite = team2 : loser = team1', () => {
    const m = makeMatch({
      team1_id: 'A',
      team2_id: 'B',
      winner_team_id: 'B',
    });
    expect(computeWinnerLoserFromMatch(m)).toEqual({
      winnerTeamId: 'B',
      loserTeamId: 'A',
    });
  });

  it('pas de winner explicite, scores team1 > team2 : team1 wins', () => {
    const m = makeMatch({
      team1_id: 'A',
      team2_id: 'B',
      team1_score: 3,
      team2_score: 1,
    });
    expect(computeWinnerLoserFromMatch(m)).toEqual({
      winnerTeamId: 'A',
      loserTeamId: 'B',
    });
  });

  it('égalité de score : winner null', () => {
    const m = makeMatch({
      team1_id: 'A',
      team2_id: 'B',
      team1_score: 2,
      team2_score: 2,
    });
    expect(computeWinnerLoserFromMatch(m).winnerTeamId).toBeNull();
  });

  it('scores absents : winner null', () => {
    const m = makeMatch({ team1_id: 'A', team2_id: 'B' });
    expect(computeWinnerLoserFromMatch(m).winnerTeamId).toBeNull();
  });
});
