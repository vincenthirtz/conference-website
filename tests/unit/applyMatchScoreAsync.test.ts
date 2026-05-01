import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const {
  resetPropagationForMatch,
  propagateBracketForMatch,
  snapshotPropagationSlots,
  restorePropagationSlots,
  logStaffAction,
  invalidateStandingsCache,
  tryAutoAdvanceFromMatch,
  notifyMatchResult,
  notifyBracketUpdate,
  postMvpPoll,
} = vi.hoisted(() => ({
  resetPropagationForMatch: vi.fn(async () => undefined),
  propagateBracketForMatch: vi.fn(async (matchId: string) => ({
    matchId,
    winnerTeamId: null,
    loserTeamId: null,
    updatedWinMatchId: null,
    updatedLoseMatchId: null,
  })),
  snapshotPropagationSlots: vi.fn(async () => ({
    winMatchId: null,
    winSlotField: null,
    winSlotValue: null,
    loseMatchId: null,
    loseSlotField: null,
    loseSlotValue: null,
  })),
  restorePropagationSlots: vi.fn(async () => undefined),
  logStaffAction: vi.fn(async () => undefined),
  invalidateStandingsCache: vi.fn(() => undefined),
  tryAutoAdvanceFromMatch: vi.fn(async () => undefined),
  notifyMatchResult: vi.fn(async () => undefined),
  notifyBracketUpdate: vi.fn(async () => undefined),
  postMvpPoll: vi.fn(async () => ({ posted: false })),
}));

vi.mock('../../utils/bracket/propagate', () => ({
  resetPropagationForMatch,
  propagateBracketForMatch,
  snapshotPropagationSlots,
  restorePropagationSlots,
  computeWinnerLoserFromMatch: () => ({
    winnerTeamId: null,
    loserTeamId: null,
  }),
}));
vi.mock('../../utils/staffLogs', () => ({ logStaffAction }));
vi.mock('../../utils/stages/standingsCache', () => ({
  invalidateStandingsCache,
  setCachedStandings: vi.fn(),
  getCachedStandings: vi.fn(() => null),
  invalidateAllStandingsCache: vi.fn(),
}));
vi.mock('../../utils/stages/autoAdvance', () => ({ tryAutoAdvanceFromMatch }));
vi.mock('../../utils/discord', () => ({
  notifyMatchResult,
  notifyBracketUpdate,
  postMvpPoll,
}));

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { applyMatchScore } from '../../utils/matches/applyScore';

const TID = 'tour-1';

function seedMatch(over: Partial<Record<string, unknown>> = {}) {
  store.matches = [
    {
      id: 'm1',
      tournament_id: TID,
      stage_id: 'stage-1',
      status: 'pending',
      is_bye: false,
      match_format: 'bo3',
      team1_id: 'team-a',
      team2_id: 'team-b',
      team1_score: null,
      team2_score: null,
      winner_team_id: null,
      forfeit_team_id: null,
      completed_at: null,
      next_match_win_id: null,
      next_match_win_slot: null,
      next_match_lose_id: null,
      next_match_lose_slot: null,
      ...over,
    },
  ] as any;
}

function seedTournament(status = 'in_progress') {
  store.tournaments = [{ id: TID, status }] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  resetPropagationForMatch.mockClear();
  propagateBracketForMatch.mockClear();
  snapshotPropagationSlots.mockClear();
  restorePropagationSlots.mockClear();
  logStaffAction.mockClear();
  invalidateStandingsCache.mockClear();
  tryAutoAdvanceFromMatch.mockClear();
  notifyMatchResult.mockClear();
  notifyBracketUpdate.mockClear();
  postMvpPoll.mockClear();
});

/* -----------------------------------------------------------
 * Guards
 * ---------------------------------------------------------*/

describe('applyMatchScore — guards', () => {
  it('throws when match is not found', async () => {
    store.matches = [];
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      applyMatchScore({ matchId: 'missing', team1Score: 2, team2Score: 1 })
    ).rejects.toThrow(/introuvable/);
    consoleSpy.mockRestore();
  });

  it('throws when the tournament is completed', async () => {
    seedMatch();
    seedTournament('completed');
    await expect(
      applyMatchScore({ matchId: 'm1', team1Score: 2, team2Score: 1 })
    ).rejects.toThrow(/tournoi est terminé/);
  });

  it('throws when the match is disputed', async () => {
    seedMatch({ status: 'disputed' });
    seedTournament();
    await expect(
      applyMatchScore({ matchId: 'm1', team1Score: 2, team2Score: 1 })
    ).rejects.toThrow(/en dispute/);
  });

  it('throws when scores are negative', async () => {
    seedMatch();
    seedTournament();
    await expect(
      applyMatchScore({ matchId: 'm1', team1Score: -1, team2Score: 0 })
    ).rejects.toThrow(/Scores invalides/);
  });

  it('throws when scores are not integers', async () => {
    seedMatch();
    seedTournament();
    await expect(
      applyMatchScore({ matchId: 'm1', team1Score: 1.5, team2Score: 0 })
    ).rejects.toThrow(/Scores invalides/);
  });

  it('throws when forfeit team is not part of the match', async () => {
    seedMatch();
    seedTournament();
    await expect(
      applyMatchScore({ matchId: 'm1', forfeitTeamId: 'team-x' })
    ).rejects.toThrow(/ne fait pas partie de ce match/);
  });
});

/* -----------------------------------------------------------
 * Happy path
 * ---------------------------------------------------------*/

describe('applyMatchScore — happy path', () => {
  it('writes scores, marks finished, and computes winner from scores', async () => {
    seedMatch();
    seedTournament();
    const r = await applyMatchScore({
      matchId: 'm1',
      team1Score: 2,
      team2Score: 1,
    });
    expect(r.updated).toBe(true);
    expect(r.winnerTeamId).toBe('team-a');

    const m = store.matches[0] as any;
    expect(m.team1_score).toBe(2);
    expect(m.team2_score).toBe(1);
    expect(m.winner_team_id).toBe('team-a');
    expect(m.status).toBe('finished');
    expect(m.completed_at).toBeTruthy();
  });

  it('keeps the existing status when markFinished=false and no status provided', async () => {
    seedMatch();
    seedTournament();
    await applyMatchScore({
      matchId: 'm1',
      team1Score: 2,
      team2Score: 1,
      markFinished: false,
    });
    expect((store.matches[0] as any).status).toBe('pending');
  });

  it('uses the explicitly provided winnerTeamId over score deduction', async () => {
    seedMatch();
    seedTournament();
    await applyMatchScore({
      matchId: 'm1',
      team1Score: 1,
      team2Score: 2,
      winnerTeamId: 'team-a', // override despite team-b having higher score
    });
    expect((store.matches[0] as any).winner_team_id).toBe('team-a');
  });

  it('invalidates the standings cache when the match has a stage', async () => {
    seedMatch();
    seedTournament();
    await applyMatchScore({
      matchId: 'm1',
      team1Score: 2,
      team2Score: 1,
    });
    expect(invalidateStandingsCache).toHaveBeenCalledWith('stage-1');
  });
});

/* -----------------------------------------------------------
 * Forfeit
 * ---------------------------------------------------------*/

describe('applyMatchScore — forfeit', () => {
  it('auto-computes scores from match_format when forfeit on team1', async () => {
    seedMatch({ match_format: 'bo5' }); // first to 3 wins
    seedTournament();
    await applyMatchScore({ matchId: 'm1', forfeitTeamId: 'team-a' });
    const m = store.matches[0] as any;
    expect(m.team1_score).toBe(0);
    expect(m.team2_score).toBe(3);
    expect(m.winner_team_id).toBe('team-b');
    expect(m.status).toBe('walkover');
    expect(m.forfeit_team_id).toBe('team-a');
  });

  it('respects explicit scores even on forfeit', async () => {
    seedMatch();
    seedTournament();
    await applyMatchScore({
      matchId: 'm1',
      forfeitTeamId: 'team-b',
      team1Score: 5,
      team2Score: 2,
    });
    const m = store.matches[0] as any;
    expect(m.team1_score).toBe(5);
    expect(m.team2_score).toBe(2);
    expect(m.status).toBe('walkover');
  });
});

/* -----------------------------------------------------------
 * Propagation flow
 * ---------------------------------------------------------*/

describe('applyMatchScore — propagation', () => {
  it('runs snapshot, reset and propagate when status becomes finished', async () => {
    seedMatch();
    seedTournament();
    await applyMatchScore({
      matchId: 'm1',
      team1Score: 2,
      team2Score: 1,
    });

    expect(snapshotPropagationSlots).toHaveBeenCalledWith('m1');
    expect(resetPropagationForMatch).toHaveBeenCalledWith('m1');
    expect(propagateBracketForMatch).toHaveBeenCalledWith('m1');
  });

  it('skips propagation when propagateBracket=false', async () => {
    seedMatch();
    seedTournament();
    await applyMatchScore({
      matchId: 'm1',
      team1Score: 2,
      team2Score: 1,
      propagateBracket: false,
    });

    expect(snapshotPropagationSlots).not.toHaveBeenCalled();
    expect(resetPropagationForMatch).not.toHaveBeenCalled();
    expect(propagateBracketForMatch).not.toHaveBeenCalled();
  });

  it('rolls back the match write when propagation fails', async () => {
    seedMatch();
    seedTournament();
    propagateBracketForMatch.mockRejectedValueOnce(new Error('bracket boom'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      applyMatchScore({ matchId: 'm1', team1Score: 2, team2Score: 1 })
    ).rejects.toThrow(/Propagation bracket échouée/);
    consoleSpy.mockRestore();

    // The match row must have been restored to its previous state
    const m = store.matches[0] as any;
    expect(m.team1_score).toBeNull();
    expect(m.team2_score).toBeNull();
    expect(m.winner_team_id).toBeNull();
    expect(m.status).toBe('pending');
  });

  it('aborts cleanly when reset fails (snapshot is restored, no match update)', async () => {
    seedMatch();
    seedTournament();
    resetPropagationForMatch.mockRejectedValueOnce(new Error('reset failure'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      applyMatchScore({ matchId: 'm1', team1Score: 2, team2Score: 1 })
    ).rejects.toThrow(/Reset de la propagation échoué/);
    consoleSpy.mockRestore();

    expect(restorePropagationSlots).toHaveBeenCalled();
    // Match was not updated (still no scores)
    expect((store.matches[0] as any).team1_score).toBeNull();
  });
});

/* -----------------------------------------------------------
 * Side effects
 * ---------------------------------------------------------*/

describe('applyMatchScore — side effects', () => {
  it('logs staff action when staffId is provided', async () => {
    seedMatch();
    seedTournament();
    await applyMatchScore({
      matchId: 'm1',
      team1Score: 2,
      team2Score: 1,
      staffId: 'staff-1',
    });

    expect(logStaffAction).toHaveBeenCalledOnce();
    const args = (logStaffAction.mock.calls[0] as any[])[0];
    expect(args.action).toBe('update_match');
    expect(args.entity_id).toBe('m1');
    expect(args.payload.new_team1_score).toBe(2);
  });

  it('does not log when staffId is omitted', async () => {
    seedMatch();
    seedTournament();
    await applyMatchScore({ matchId: 'm1', team1Score: 2, team2Score: 1 });
    expect(logStaffAction).not.toHaveBeenCalled();
  });

  it('triggers Discord match-result notification on a finished match', async () => {
    seedMatch();
    seedTournament();
    store.teams = [
      { id: 'team-a', name: 'Alpha', logo_url: null },
      { id: 'team-b', name: 'Bravo', logo_url: null },
    ] as any;

    await applyMatchScore({
      matchId: 'm1',
      team1Score: 2,
      team2Score: 1,
    });

    // Notifications are fire-and-forget — let microtasks flush.
    await new Promise((r) => setImmediate(r));
    expect(notifyMatchResult).toHaveBeenCalled();
  });

  it('triggers tryAutoAdvanceFromMatch when finished and a stage is set', async () => {
    seedMatch();
    seedTournament();
    await applyMatchScore({
      matchId: 'm1',
      team1Score: 2,
      team2Score: 1,
    });
    await new Promise((r) => setImmediate(r));
    expect(tryAutoAdvanceFromMatch).toHaveBeenCalledWith({
      stageId: 'stage-1',
      staffId: null,
    });
  });

  it('skips MVP poll on a forfeit (walkover)', async () => {
    seedMatch();
    seedTournament();
    await applyMatchScore({ matchId: 'm1', forfeitTeamId: 'team-a' });
    await new Promise((r) => setImmediate(r));
    expect(postMvpPoll).not.toHaveBeenCalled();
  });

  it('auto-computes scores from match_format=bo1 on forfeit of team2', async () => {
    seedMatch({ match_format: 'bo1' });
    seedTournament();
    await applyMatchScore({ matchId: 'm1', forfeitTeamId: 'team-b' });
    const m = (store.matches as any).find((x: any) => x.id === 'm1');
    expect(m.team1_score).toBe(1);
    expect(m.team2_score).toBe(0);
    expect(m.winner_team_id).toBe('team-a');
  });

  it('auto-computes scores from match_format=bo7 on forfeit', async () => {
    seedMatch({ match_format: 'bo7' });
    seedTournament();
    await applyMatchScore({ matchId: 'm1', forfeitTeamId: 'team-b' });
    const m = (store.matches as any).find((x: any) => x.id === 'm1');
    // bo7 -> first to 4
    expect(m.team1_score).toBe(4);
    expect(m.team2_score).toBe(0);
  });

  it('uses sensible default when match_format unknown on forfeit', async () => {
    seedMatch({ match_format: null });
    seedTournament();
    await applyMatchScore({ matchId: 'm1', forfeitTeamId: 'team-b' });
    const m = (store.matches as any).find((x: any) => x.id === 'm1');
    // default is bo1 / 1 win
    expect(m.team1_score).toBeGreaterThanOrEqual(1);
    expect(m.winner_team_id).toBe('team-a');
  });

  it('forfeit transitions match to walkover status', async () => {
    seedMatch();
    seedTournament();
    await applyMatchScore({ matchId: 'm1', forfeitTeamId: 'team-a' });
    const m = (store.matches as any).find((x: any) => x.id === 'm1');
    expect(m.status).toBe('walkover');
    expect(m.forfeit_team_id).toBe('team-a');
    expect(m.winner_team_id).toBe('team-b');
  });
});

/* -----------------------------------------------------------
 * computeWinnerFromScores — pure helper
 * ---------------------------------------------------------*/

import { computeWinnerFromScores } from '../../utils/matches/applyScore';

describe('computeWinnerFromScores', () => {
  it('returns the present team as winner on a bye', () => {
    expect(computeWinnerFromScores('team-a', null, 0, 0, true)).toBe('team-a');
    expect(computeWinnerFromScores(null, 'team-b', 0, 0, true)).toBe('team-b');
  });

  it('returns null when both team IDs are null', () => {
    expect(computeWinnerFromScores(null, null, 2, 1, false)).toBeNull();
  });

  it('returns team1 when team1Score > team2Score', () => {
    expect(computeWinnerFromScores('a', 'b', 3, 1, false)).toBe('a');
  });

  it('returns team2 when team2Score > team1Score', () => {
    expect(computeWinnerFromScores('a', 'b', 1, 3, false)).toBe('b');
  });

  it('returns null on tied scores', () => {
    expect(computeWinnerFromScores('a', 'b', 2, 2, false)).toBeNull();
  });

  it('returns null when one team is missing and not a bye', () => {
    expect(computeWinnerFromScores('a', null, 5, 0, false)).toBeNull();
  });
});
