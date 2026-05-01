import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MatchRow } from '../../types/bracket';

vi.mock('../../utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';

import {
  propagateBracketForMatch,
  resetPropagationForMatch,
  snapshotPropagationSlots,
  restorePropagationSlots,
  computeWinnerLoserFromMatch,
} from '../../utils/bracket/propagate';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function defaultMatch(overrides: Partial<MatchRow> = {}): MatchRow {
  return {
    id: 'm1',
    tournament_id: 't1',
    stage_id: 'stage1',
    status: 'finished',
    is_bye: false,
    team1_id: 'team-a',
    team2_id: 'team-b',
    team1_score: 2,
    team2_score: 1,
    winner_team_id: 'team-a',
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

function seedMatches(matches: Partial<MatchRow>[]) {
  store.matches = matches.map((m) => ({ ...defaultMatch(), ...m })) as any;
}

function seedRegistrations(rows: { tournament_id: string; team_id: string }[]) {
  store.tournament_teams = rows as any;
}

function getMatch(id: string): Record<string, unknown> | undefined {
  return (store.matches || []).find((m) => m.id === id);
}

beforeEach(() => {
  resetSupabaseMock();
});

/* -----------------------------------------------------------
 * propagateBracketForMatch
 * ---------------------------------------------------------*/

describe('propagateBracketForMatch — early returns', () => {
  it('throws when the match is missing', async () => {
    seedMatches([]);
    await expect(propagateBracketForMatch('missing')).rejects.toThrow(
      /introuvable/
    );
  });

  it('returns null winner/loser when match status is cancelled', async () => {
    seedMatches([{ id: 'm1', status: 'cancelled' }]);
    const result = await propagateBracketForMatch('m1');
    expect(result).toEqual({
      matchId: 'm1',
      winnerTeamId: null,
      loserTeamId: null,
    });
  });

  it('returns null winner/loser when match status is disputed', async () => {
    seedMatches([{ id: 'm1', status: 'disputed' }]);
    const result = await propagateBracketForMatch('m1');
    expect(result.winnerTeamId).toBeNull();
    expect(result.loserTeamId).toBeNull();
  });
});

describe('propagateBracketForMatch — winner/loser slot writes', () => {
  it('writes the winner into next_match_win_id at the right slot', async () => {
    seedMatches([
      {
        id: 'm1',
        winner_team_id: 'team-a',
        next_match_win_id: 'm-win',
        next_match_win_slot: 1,
      },
      {
        id: 'm-win',
        team1_id: null,
        team2_id: null,
        team1_score: null,
        team2_score: null,
        winner_team_id: null,
        status: 'pending',
      },
    ]);
    seedRegistrations([{ tournament_id: 't1', team_id: 'team-a' }]);

    const result = await propagateBracketForMatch('m1');
    expect(result.winnerTeamId).toBe('team-a');
    expect(result.updatedWinMatchId).toBe('m-win');
    expect(getMatch('m-win')?.team1_id).toBe('team-a');
  });

  it('writes the loser into next_match_lose_id at slot 2', async () => {
    seedMatches([
      {
        id: 'm1',
        winner_team_id: 'team-a',
        next_match_lose_id: 'm-lose',
        next_match_lose_slot: 2,
      },
      {
        id: 'm-lose',
        team1_id: null,
        team2_id: null,
        team1_score: null,
        team2_score: null,
        winner_team_id: null,
        status: 'pending',
      },
    ]);
    seedRegistrations([{ tournament_id: 't1', team_id: 'team-b' }]);

    const result = await propagateBracketForMatch('m1');
    expect(result.loserTeamId).toBe('team-b');
    expect(getMatch('m-lose')?.team2_id).toBe('team-b');
  });

  it('throws when next_match_win_id is set but slot is null', async () => {
    seedMatches([
      {
        id: 'm1',
        next_match_win_id: 'm-win',
        next_match_win_slot: null,
      },
    ]);

    await expect(propagateBracketForMatch('m1')).rejects.toThrow(
      /next_match_win_slot est null/
    );
  });

  it('throws when next_match_lose_id is set but slot is null', async () => {
    seedMatches([
      {
        id: 'm1',
        next_match_lose_id: 'm-lose',
        next_match_lose_slot: null,
      },
    ]);

    await expect(propagateBracketForMatch('m1')).rejects.toThrow(
      /next_match_lose_slot est null/
    );
  });

  it('throws when winner is not registered in the tournament', async () => {
    seedMatches([
      {
        id: 'm1',
        winner_team_id: 'team-a',
        next_match_win_id: 'm-win',
        next_match_win_slot: 1,
      },
      { id: 'm-win', team1_id: null, team2_id: null },
    ]);
    seedRegistrations([]); // team-a NOT registered

    await expect(propagateBracketForMatch('m1')).rejects.toThrow(
      /non inscrite au tournoi/
    );
  });
});

/* -----------------------------------------------------------
 * Tiebreakers
 * ---------------------------------------------------------*/

describe('propagateBracketForMatch — tiebreakers', () => {
  it('does nothing on a tie when policy is manual', async () => {
    seedMatches([
      {
        id: 'm1',
        team1_score: 2,
        team2_score: 2,
        winner_team_id: null,
      },
    ]);
    store.tournament_stages = [
      { id: 'stage1', tiebreaker_policy: 'manual' },
    ] as any;

    const result = await propagateBracketForMatch('m1');
    expect(result.winnerTeamId).toBeNull();
    expect(result.tiebreakerApplied).toBeNull();
  });

  it('resolves a tie via map_diff and propagates the winner', async () => {
    seedMatches([
      {
        id: 'm1',
        team1_score: 2,
        team2_score: 2,
        winner_team_id: null,
        next_match_win_id: 'm-win',
        next_match_win_slot: 1,
      },
      { id: 'm-win', team1_id: null, team2_id: null },
    ]);
    seedRegistrations([{ tournament_id: 't1', team_id: 'team-a' }]);
    store.tournament_stages = [
      { id: 'stage1', tiebreaker_policy: 'map_diff' },
    ] as any;
    store.games = [
      { match_id: 'm1', team1_score: 5, team2_score: 1 },
      { match_id: 'm1', team1_score: 4, team2_score: 3 },
    ] as any;

    const result = await propagateBracketForMatch('m1');
    expect(result.winnerTeamId).toBe('team-a');
    expect(result.loserTeamId).toBe('team-b');
    expect(result.tiebreakerApplied).toBe('map_diff');
    // Winner_team_id should have been written back on the original match
    expect(getMatch('m1')?.winner_team_id).toBe('team-a');
  });

  it('falls back to extra_round when map_diff is itself tied', async () => {
    seedMatches([
      {
        id: 'm1',
        team1_score: 2,
        team2_score: 2,
        winner_team_id: null,
      },
    ]);
    store.tournament_stages = [
      { id: 'stage1', tiebreaker_policy: 'map_diff' },
    ] as any;
    store.games = [{ match_id: 'm1', team1_score: 3, team2_score: 3 }] as any;

    const result = await propagateBracketForMatch('m1');
    expect(result.tiebreakerApplied).toBe('extra_round');
    expect(result.tiebreakerMatchId).toBeTruthy();
    // A new tiebreaker match must exist with the same teams
    const tb = (store.matches || []).find(
      (m) => m.id === result.tiebreakerMatchId
    );
    expect(tb?.team1_id).toBe('team-a');
    expect(tb?.team2_id).toBe('team-b');
    expect(tb?.round_name).toBe('Tiebreaker');
  });

  it('resolves a tie via seed (lower seed wins)', async () => {
    seedMatches([
      {
        id: 'm1',
        team1_score: 1,
        team2_score: 1,
        winner_team_id: null,
        next_match_win_id: null,
      },
    ]);
    store.tournament_stages = [
      { id: 'stage1', tiebreaker_policy: 'seed' },
    ] as any;
    store.stage_teams = [
      { stage_id: 'stage1', team_id: 'team-a', seed: 3 },
      { stage_id: 'stage1', team_id: 'team-b', seed: 1 },
    ] as any;

    const result = await propagateBracketForMatch('m1');
    expect(result.winnerTeamId).toBe('team-b');
    expect(result.loserTeamId).toBe('team-a');
    expect(result.tiebreakerApplied).toBe('seed');
  });

  it('falls back to extra_round when seeds are equal', async () => {
    seedMatches([
      {
        id: 'm1',
        team1_score: 0,
        team2_score: 0,
        winner_team_id: null,
      },
    ]);
    store.tournament_stages = [
      { id: 'stage1', tiebreaker_policy: 'seed' },
    ] as any;
    store.stage_teams = [
      { stage_id: 'stage1', team_id: 'team-a', seed: 2 },
      { stage_id: 'stage1', team_id: 'team-b', seed: 2 },
    ] as any;

    const result = await propagateBracketForMatch('m1');
    expect(result.tiebreakerApplied).toBe('extra_round');
  });
});

/* -----------------------------------------------------------
 * resetPropagationForMatch
 * ---------------------------------------------------------*/

describe('resetPropagationForMatch', () => {
  it('clears the team slot in next_match_win_id', async () => {
    seedMatches([
      {
        id: 'm1',
        next_match_win_id: 'm-win',
        next_match_win_slot: 1,
      },
      { id: 'm-win', team1_id: 'team-a', team2_id: null },
    ]);

    await resetPropagationForMatch('m1');
    expect(getMatch('m-win')?.team1_id).toBeNull();
  });

  it('clears the team slot in next_match_lose_id', async () => {
    seedMatches([
      {
        id: 'm1',
        next_match_lose_id: 'm-lose',
        next_match_lose_slot: 2,
      },
      { id: 'm-lose', team1_id: null, team2_id: 'team-b' },
    ]);

    await resetPropagationForMatch('m1');
    expect(getMatch('m-lose')?.team2_id).toBeNull();
  });

  it('does nothing for a missing match', async () => {
    seedMatches([]);
    await expect(resetPropagationForMatch('nope')).resolves.toBeUndefined();
  });

  it('does nothing when the match has no propagation links', async () => {
    seedMatches([{ id: 'm1' }]);
    await resetPropagationForMatch('m1');
    // No throw, store unchanged
    expect((store.matches || []).length).toBe(1);
  });
});

/* -----------------------------------------------------------
 * snapshotPropagationSlots / restorePropagationSlots
 * ---------------------------------------------------------*/

describe('snapshot + restore propagation slots', () => {
  it('captures current values then restores them', async () => {
    seedMatches([
      {
        id: 'm1',
        next_match_win_id: 'm-win',
        next_match_win_slot: 1,
        next_match_lose_id: 'm-lose',
        next_match_lose_slot: 2,
      },
      { id: 'm-win', team1_id: 'pre-existing-A', team2_id: null },
      { id: 'm-lose', team1_id: null, team2_id: 'pre-existing-B' },
    ]);

    const snap = await snapshotPropagationSlots('m1');
    expect(snap.winSlotValue).toBe('pre-existing-A');
    expect(snap.loseSlotValue).toBe('pre-existing-B');

    // Mutate slots, then restore
    const winRow = getMatch('m-win')!;
    const loseRow = getMatch('m-lose')!;
    winRow.team1_id = 'NEW-A';
    loseRow.team2_id = 'NEW-B';

    await restorePropagationSlots(snap);
    expect(getMatch('m-win')?.team1_id).toBe('pre-existing-A');
    expect(getMatch('m-lose')?.team2_id).toBe('pre-existing-B');
  });

  it('returns an empty snapshot for a missing match', async () => {
    seedMatches([]);
    const snap = await snapshotPropagationSlots('nope');
    expect(snap.winMatchId).toBeNull();
    expect(snap.loseMatchId).toBeNull();
  });

  it('restorePropagationSlots is a no-op for an empty snapshot', async () => {
    await restorePropagationSlots({
      winMatchId: null,
      winSlotField: null,
      winSlotValue: null,
      loseMatchId: null,
      loseSlotField: null,
      loseSlotValue: null,
    });
    // No throw is a pass; nothing in store changed.
    expect(store.matches).toBeUndefined();
  });
});

/* -----------------------------------------------------------
 * computeWinnerLoserFromMatch (sanity — already covered, but keep
 * representative branches local to this suite as a regression net)
 * ---------------------------------------------------------*/

describe('computeWinnerLoserFromMatch — score-only path', () => {
  it('uses scores when winner_team_id is null', () => {
    const m = defaultMatch({ winner_team_id: null });
    const out = computeWinnerLoserFromMatch(m);
    expect(out.winnerTeamId).toBe('team-a');
    expect(out.loserTeamId).toBe('team-b');
  });
});
