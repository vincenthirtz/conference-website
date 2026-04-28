import { describe, it, expect, vi, beforeEach } from 'vitest';

/* -----------------------------------------------------------
 * Supabase mock with controllable per-call responses.
 * Each test sets `responses[]` in the order the resolver will query :
 *   1) tournaments.eq(id, DEFAULT).maybeSingle()
 *   2) tournaments.eq('status','running').order().limit(1).maybeSingle()
 *   3) tournaments.eq('status','published').gte().order().limit(1).maybeSingle()
 * ---------------------------------------------------------*/

let responses: { data: any }[] = [];
let queueIndex = 0;

function makeChain() {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => {
      const r = responses[queueIndex++] ?? { data: null };
      return Promise.resolve(r);
    },
  };
  return chain;
}

vi.mock('../../utils/supabase', () => ({
  supabaseAdmin: {
    from: () => makeChain(),
  },
}));

import {
  resolveCurrentTournamentId,
  DEFAULT_CURRENT_TOURNAMENT_ID,
} from '../../utils/currentTournament';

beforeEach(() => {
  responses = [];
  queueIndex = 0;
});

describe('DEFAULT_CURRENT_TOURNAMENT_ID', () => {
  it('points at the 2026 women cup UUID', () => {
    expect(DEFAULT_CURRENT_TOURNAMENT_ID).toBe(
      'e8fa740c-d92b-49d8-a654-05a37d0eea3b'
    );
  });
});

describe('resolveCurrentTournamentId', () => {
  it('returns the default UUID when it is still active (status=running)', async () => {
    responses = [
      { data: { id: DEFAULT_CURRENT_TOURNAMENT_ID, status: 'running' } },
    ];
    const id = await resolveCurrentTournamentId();
    expect(id).toBe(DEFAULT_CURRENT_TOURNAMENT_ID);
  });

  it('returns the default UUID when its status is published', async () => {
    responses = [
      { data: { id: DEFAULT_CURRENT_TOURNAMENT_ID, status: 'published' } },
    ];
    const id = await resolveCurrentTournamentId();
    expect(id).toBe(DEFAULT_CURRENT_TOURNAMENT_ID);
  });

  it('returns the default UUID when its status is draft', async () => {
    responses = [
      { data: { id: DEFAULT_CURRENT_TOURNAMENT_ID, status: 'draft' } },
    ];
    const id = await resolveCurrentTournamentId();
    expect(id).toBe(DEFAULT_CURRENT_TOURNAMENT_ID);
  });

  it('falls back to the most recent running tournament when default is archived', async () => {
    responses = [
      { data: { id: DEFAULT_CURRENT_TOURNAMENT_ID, status: 'archived' } },
      { data: { id: 'fallback-running-id' } },
    ];
    const id = await resolveCurrentTournamentId();
    expect(id).toBe('fallback-running-id');
  });

  it('falls back to the most recent running tournament when default is completed', async () => {
    responses = [
      { data: { id: DEFAULT_CURRENT_TOURNAMENT_ID, status: 'completed' } },
      { data: { id: 'fallback-running' } },
    ];
    const id = await resolveCurrentTournamentId();
    expect(id).toBe('fallback-running');
  });

  it('falls back to the most recent running tournament when default does not exist', async () => {
    responses = [{ data: null }, { data: { id: 'some-running-id' } }];
    const id = await resolveCurrentTournamentId();
    expect(id).toBe('some-running-id');
  });

  it('falls back to recent published when default is archived AND no running tournament exists', async () => {
    responses = [
      { data: { id: DEFAULT_CURRENT_TOURNAMENT_ID, status: 'archived' } },
      { data: null },
      { data: { id: 'recent-published' } },
    ];
    const id = await resolveCurrentTournamentId();
    expect(id).toBe('recent-published');
  });

  it('returns null when no candidate at all', async () => {
    responses = [{ data: null }, { data: null }, { data: null }];
    const id = await resolveCurrentTournamentId();
    expect(id).toBeNull();
  });
});
