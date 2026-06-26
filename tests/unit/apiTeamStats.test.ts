import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import handler from '../../pages/api/team/[id]/stats';

/* -----------------------------------------------------------
 * Helpers — minimal req/res shims
 * ---------------------------------------------------------*/

const TEAM_ID = '11111111-1111-4111-8111-111111111111';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'example.com' },
    query: { id: TEAM_ID },
    socket: { remoteAddress: '203.0.113.7' },
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.end = () => res;
  return res;
}

function seedTeam() {
  store.teams = [
    {
      id: TEAM_ID,
      name: 'Team Alpha',
      short_name: 'ALP',
      logo_url: null,
      country: 'FR',
    },
  ];
}

beforeEach(() => {
  resetSupabaseMock();
  seedTeam();
});

describe('GET /api/team/[id]/stats — global stats aggregation', () => {
  it('returns stats from a single tournament row with recomputed winrate', async () => {
    store.team_stats_view = [
      {
        team_id: TEAM_ID,
        tournament_id: 't1',
        matches_played: 4,
        wins: 3,
        losses: 1,
        draws: 0,
        maps_won: 7,
        maps_lost: 3,
      },
    ];

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const stats = (res.body as any).stats;
    expect(stats).not.toBeNull();
    expect(stats.team_id).toBe(TEAM_ID);
    expect(stats.team_name).toBe('Team Alpha');
    expect(stats.total_matches).toBe(4);
    expect(stats.wins).toBe(3);
    expect(stats.losses).toBe(1);
    expect(stats.total_maps_won).toBe(7);
    expect(stats.total_maps_lost).toBe(3);
    expect(stats.winrate).toBeCloseTo(3 / 4, 10);
  });

  it('aggregates across two tournaments (summed counters + recomputed winrate)', async () => {
    store.team_stats_view = [
      {
        team_id: TEAM_ID,
        tournament_id: 't1',
        matches_played: 4,
        wins: 3,
        losses: 1,
        draws: 0,
        maps_won: 7,
        maps_lost: 3,
      },
      {
        team_id: TEAM_ID,
        tournament_id: 't2',
        matches_played: 6,
        wins: 2,
        losses: 3,
        draws: 1,
        maps_won: 5,
        maps_lost: 8,
      },
    ];

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const stats = (res.body as any).stats;
    expect(stats).not.toBeNull();
    expect(stats.total_matches).toBe(10); // 4 + 6
    expect(stats.wins).toBe(5); // 3 + 2
    expect(stats.losses).toBe(4); // 1 + 3
    expect(stats.draws).toBe(1); // 0 + 1
    expect(stats.total_maps_won).toBe(12); // 7 + 5
    expect(stats.total_maps_lost).toBe(11); // 3 + 8
    // winrate recomputed globally, NOT averaged per tournament
    expect(stats.winrate).toBeCloseTo(5 / 10, 10);
  });

  it('returns stats = null when the team has no stats rows', async () => {
    store.team_stats_view = [
      {
        team_id: 'some-other-team',
        tournament_id: 't1',
        matches_played: 4,
        wins: 3,
        losses: 1,
        draws: 0,
        maps_won: 7,
        maps_lost: 3,
      },
    ];

    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).stats).toBeNull();
  });

  it('returns 404 when the team does not exist', async () => {
    store.teams = [];
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('rejects an invalid team id with 400', async () => {
    const req = makeReq({ query: { id: 'not-a-uuid' } });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});
