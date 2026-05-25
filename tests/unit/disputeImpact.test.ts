import { describe, it, expect, beforeEach } from 'vitest';

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  findDownstreamImpact,
  findDisputesBlockingDownstream,
} from '../../utils/bracket/disputeImpact';

const TENANT_ID = 'tn-1';
const TOURNAMENT_ID = 'tour-1';

beforeEach(() => {
  resetSupabaseMock();
});

/* -----------------------------------------------------------
 * findDownstreamImpact
 * ---------------------------------------------------------*/

describe('findDownstreamImpact', () => {
  it('empty impact when source match has no downstream links', async () => {
    store.matches = [
      {
        id: 'm1',
        tournament_id: TOURNAMENT_ID,
        team1_id: 'tA',
        team2_id: 'tB',
        next_match_win_id: null,
        next_match_lose_id: null,
      },
    ] as any;
    const r = await findDownstreamImpact(TENANT_ID, 'm1');
    expect(r.impacted).toEqual([]);
  });

  it('empty impact when downstream is still pending', async () => {
    store.matches = [
      {
        id: 'm1',
        tournament_id: TOURNAMENT_ID,
        team1_id: 'tA',
        team2_id: 'tB',
        next_match_win_id: 'm2',
        next_match_win_slot: 1,
      },
      { id: 'm2', team1_id: 'tA', status: 'pending' },
    ] as any;
    const r = await findDownstreamImpact(TENANT_ID, 'm1');
    expect(r.impacted).toEqual([]);
  });

  it('flags downstream when ongoing and slot carries source team', async () => {
    store.matches = [
      {
        id: 'm1',
        tournament_id: TOURNAMENT_ID,
        team1_id: 'tA',
        team2_id: 'tB',
        next_match_win_id: 'm2',
        next_match_win_slot: 1,
      },
      { id: 'm2', team1_id: 'tA', status: 'ongoing' },
    ] as any;
    const r = await findDownstreamImpact(TENANT_ID, 'm1');
    expect(r.impacted).toHaveLength(1);
    expect(r.impacted[0]).toMatchObject({
      matchId: 'm2',
      status: 'ongoing',
      side: 'win',
      slot: 1,
    });
  });

  it('also flags finished and walkover downstream', async () => {
    store.matches = [
      {
        id: 'm1',
        tournament_id: TOURNAMENT_ID,
        team1_id: 'tA',
        team2_id: 'tB',
        next_match_win_id: 'm2',
        next_match_win_slot: 2,
        next_match_lose_id: 'm3',
        next_match_lose_slot: 1,
      },
      { id: 'm2', team2_id: 'tA', status: 'finished' },
      { id: 'm3', team1_id: 'tB', status: 'walkover' },
    ] as any;
    const r = await findDownstreamImpact(TENANT_ID, 'm1');
    expect(r.impacted.map((i) => i.matchId).sort()).toEqual(['m2', 'm3']);
  });

  it('skips downstream when slot team is not one of the source teams', async () => {
    // Edge case : downstream was overwritten manually, so the dispute on
    // the source can no longer corrupt it.
    store.matches = [
      {
        id: 'm1',
        tournament_id: TOURNAMENT_ID,
        team1_id: 'tA',
        team2_id: 'tB',
        next_match_win_id: 'm2',
        next_match_win_slot: 1,
      },
      { id: 'm2', team1_id: 'tZ', status: 'ongoing' }, // tZ ≠ tA/tB
    ] as any;
    const r = await findDownstreamImpact(TENANT_ID, 'm1');
    expect(r.impacted).toEqual([]);
  });
});

/* -----------------------------------------------------------
 * findDisputesBlockingDownstream
 * ---------------------------------------------------------*/

describe('findDisputesBlockingDownstream', () => {
  it('returns [] when no dispute in tournament', async () => {
    store.matches = [
      { id: 'm1', tournament_id: TOURNAMENT_ID, status: 'finished' },
    ] as any;
    const r = await findDisputesBlockingDownstream(TENANT_ID, TOURNAMENT_ID);
    expect(r).toEqual([]);
  });

  it('returns [] when disputes have no live downstream', async () => {
    store.matches = [
      {
        id: 'm1',
        tournament_id: TOURNAMENT_ID,
        status: 'disputed',
        team1_id: 'tA',
        next_match_win_id: 'm2',
        next_match_win_slot: 1,
      },
      { id: 'm2', team1_id: 'tA', status: 'pending' },
    ] as any;
    const r = await findDisputesBlockingDownstream(TENANT_ID, TOURNAMENT_ID);
    expect(r).toEqual([]);
  });

  it('aggregates disputes whose downstream is locked', async () => {
    store.matches = [
      {
        id: 'd1',
        tournament_id: TOURNAMENT_ID,
        status: 'disputed',
        team1_id: 'tA',
        next_match_win_id: 'mLive',
        next_match_win_slot: 1,
      },
      {
        id: 'd2',
        tournament_id: TOURNAMENT_ID,
        status: 'disputed',
        team1_id: 'tB',
        next_match_win_id: 'mPending',
        next_match_win_slot: 1,
      },
      { id: 'mLive', team1_id: 'tA', status: 'ongoing' },
      { id: 'mPending', team1_id: 'tB', status: 'pending' },
    ] as any;
    const r = await findDisputesBlockingDownstream(TENANT_ID, TOURNAMENT_ID);
    expect(r).toHaveLength(1);
    expect(r[0].sourceMatchId).toBe('d1');
    expect(r[0].impacted[0].matchId).toBe('mLive');
  });
});
