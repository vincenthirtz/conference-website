// Tests for the auto-director reactor (Feature: Production broadcast automatisée).
//
// reactToMatchStatus is best-effort and non-throwing: it flips the live run's
// broadcast scene ONLY when the changed match is the one on the current live
// segment and auto_director isn't disabled.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { reactToMatchStatus } from '../../utils/broadcast/autoDirector';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const SEG_ID = '22222222-2222-4222-8222-2222222222aa';
const MATCH_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_MATCH = '44444444-4444-4444-8444-444444444444';

function seedLive(
  opts: { autoDirector?: boolean; segMatchId?: string | null } = {}
) {
  store.event_runs = [
    {
      id: RUN_ID,
      tenant_id: TENANT,
      name: 'Finale',
      slug: 'finale',
      status: 'live',
      started_at: '2026-05-25T18:00:00Z',
      scheduled_at: null,
      broadcast_state: {
        v: 1,
        on_air: true,
        lower_third: null,
        pip: { enabled: false },
        scene: 'starting',
        auto_director: opts.autoDirector ?? true,
        scene_updated_at: null,
      },
    },
  ] as any;
  store.event_segments = [
    {
      id: SEG_ID,
      event_run_id: RUN_ID,
      tenant_id: TENANT,
      ord: 1,
      type: 'match',
      title: 'Match 1',
      status: 'live',
      match_id: opts.segMatchId === undefined ? MATCH_ID : opts.segMatchId,
      duration_min: 45,
    },
  ] as any;
}

function currentScene(): string | undefined {
  const run = (store.event_runs as any[]).find((r) => r.id === RUN_ID);
  return run?.broadcast_state?.scene;
}

beforeEach(() => {
  resetSupabaseMock();
});

describe('reactToMatchStatus', () => {
  it('ongoing → scene "match"', async () => {
    seedLive();
    const applied = await reactToMatchStatus({
      tenantId: TENANT,
      matchId: MATCH_ID,
      newStatus: 'ongoing',
    });
    expect(applied).toBe('match');
    expect(currentScene()).toBe('match');
  });

  it('finished → scene "results"', async () => {
    seedLive();
    const applied = await reactToMatchStatus({
      tenantId: TENANT,
      matchId: MATCH_ID,
      newStatus: 'finished',
    });
    expect(applied).toBe('results');
    expect(currentScene()).toBe('results');
  });

  it('walkover → scene "results"', async () => {
    seedLive();
    const applied = await reactToMatchStatus({
      tenantId: TENANT,
      matchId: MATCH_ID,
      newStatus: 'walkover',
    });
    expect(applied).toBe('results');
    expect(currentScene()).toBe('results');
  });

  it('disputed → scene "pause"', async () => {
    seedLive();
    const applied = await reactToMatchStatus({
      tenantId: TENANT,
      matchId: MATCH_ID,
      newStatus: 'disputed',
    });
    expect(applied).toBe('pause');
    expect(currentScene()).toBe('pause');
  });

  it('no-op for an irrelevant status (e.g. scheduled)', async () => {
    seedLive();
    const applied = await reactToMatchStatus({
      tenantId: TENANT,
      matchId: MATCH_ID,
      newStatus: 'scheduled',
    });
    expect(applied).toBeNull();
    expect(currentScene()).toBe('starting');
  });

  it('no-op when auto_director=false', async () => {
    seedLive({ autoDirector: false });
    const applied = await reactToMatchStatus({
      tenantId: TENANT,
      matchId: MATCH_ID,
      newStatus: 'ongoing',
    });
    expect(applied).toBeNull();
    expect(currentScene()).toBe('starting');
  });

  it('no-op when there is no live run', async () => {
    store.event_runs = [] as any;
    const applied = await reactToMatchStatus({
      tenantId: TENANT,
      matchId: MATCH_ID,
      newStatus: 'ongoing',
    });
    expect(applied).toBeNull();
  });

  it('no-op when the changed match is not the current live segment match', async () => {
    seedLive({ segMatchId: OTHER_MATCH });
    const applied = await reactToMatchStatus({
      tenantId: TENANT,
      matchId: MATCH_ID,
      newStatus: 'ongoing',
    });
    expect(applied).toBeNull();
    expect(currentScene()).toBe('starting');
  });
});
