// tests/unit/apiPublicV1.test.ts
//
// Unit tests for the versioned public read-only API `/api/public/v1/*`.
// Covers: envelope shape ({ data } / { data, pagination }), CORS headers
// (Access-Control-Allow-Origin: *), OPTIONS preflight → 204, method guard
// (405), 404 on unknown, happy-paths for tournaments/matches/standings, and
// endpoints that reuse existing read utils (leaderboard, leagues).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';

import tournamentsList from '../../pages/api/public/v1/tournaments/index';
import tournamentDetail from '../../pages/api/public/v1/tournaments/[id]/index';
import tournamentMatches from '../../pages/api/public/v1/tournaments/[id]/matches';
import tournamentStandings from '../../pages/api/public/v1/tournaments/[id]/standings';
import matchDetail from '../../pages/api/public/v1/matches/[id]';
import teamDetail from '../../pages/api/public/v1/teams/[id]';
import leaderboard from '../../pages/api/public/v1/leaderboard';
import leaguesList from '../../pages/api/public/v1/leagues/index';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TOURN = '22222222-2222-4222-8222-22222222aaaa';
const MATCH = '11111111-1111-4111-8111-111111111111';
const TEAM1 = '33333333-3333-4333-8333-333333330001';
const TEAM2 = '33333333-3333-4333-8333-333333330002';

let ipCounter = 0;
function makeReq(over: Partial<any> = {}): any {
  // Unique IP per request so the per-endpoint rate limiter never trips
  // between unrelated test cases.
  ipCounter += 1;
  return {
    method: 'GET',
    headers: { host: 'h', 'x-real-ip': `10.0.0.${ipCounter % 250}` },
    query: {},
    body: {},
    cookies: {},
    socket: { remoteAddress: `10.0.0.${ipCounter % 250}` },
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    ended: false,
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
  res.end = () => {
    res.ended = true;
    return res;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  ipCounter = 0;
});

/* ------------------------------------------------------------------ *
 * Cross-cutting: CORS + method guard + preflight
 * ------------------------------------------------------------------ */

describe('public/v1 cross-cutting', () => {
  it('sets Access-Control-Allow-Origin: * on a normal GET', async () => {
    const req = makeReq({ query: {} });
    const res = makeRes();
    await tournamentsList(req, res);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res.headers['Access-Control-Allow-Methods']).toBe('GET, OPTIONS');
    expect(res.headers['Access-Control-Allow-Headers']).toBe('Content-Type');
  });

  it('answers OPTIONS preflight with 204 + CORS headers, no body', async () => {
    const req = makeReq({ method: 'OPTIONS' });
    const res = makeRes();
    await tournamentsList(req, res);
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(res.body).toBeUndefined();
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('rejects non-GET methods with 405 + Allow header', async () => {
    const req = makeReq({ method: 'POST' });
    const res = makeRes();
    await tournamentsList(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET, OPTIONS');
    expect((res.body as any).code).toBe('METHOD_NOT_ALLOWED');
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('sets Cache-Control on successful responses', async () => {
    const req = makeReq();
    const res = makeRes();
    await tournamentsList(req, res);
    expect(String(res.headers['Cache-Control'])).toMatch(
      /public, s-maxage=\d+, stale-while-revalidate=\d+/
    );
  });
});

/* ------------------------------------------------------------------ *
 * GET /api/public/v1/tournaments
 * ------------------------------------------------------------------ */

describe('GET /api/public/v1/tournaments', () => {
  it('returns { data: [] } (+ pagination) when empty', async () => {
    const req = makeReq();
    const res = makeRes();
    await tournamentsList(req, res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).data).toEqual([]);
    expect((res.body as any).pagination).toEqual({
      limit: 50,
      offset: 0,
      count: 0,
    });
  });

  it('lists public tournaments and projects only public columns', async () => {
    store.tournaments = [
      {
        id: TOURN,
        tenant_id: TENANT,
        name: 'Summer Cup',
        slug: 'summer-cup',
        game: 'overwatch',
        status: 'running',
        start_date: '2026-07-01',
        end_date: null,
        format: 'single_elim',
        // sensitive / internal columns that must NOT leak
        created_at: '2026-06-01',
        internal_notes: 'secret',
      },
    ];
    const req = makeReq();
    const res = makeRes();
    await tournamentsList(req, res);
    expect(res.statusCode).toBe(200);
    const rows = (res.body as any).data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: TOURN,
      name: 'Summer Cup',
      slug: 'summer-cup',
      game: 'overwatch',
      status: 'running',
      start_date: '2026-07-01',
      end_date: null,
      format: 'single_elim',
    });
    expect(rows[0]).not.toHaveProperty('internal_notes');
    expect(rows[0]).not.toHaveProperty('created_at');
  });
});

/* ------------------------------------------------------------------ *
 * GET /api/public/v1/tournaments/{id}
 * ------------------------------------------------------------------ */

describe('GET /api/public/v1/tournaments/{id}', () => {
  it('404 when the tournament is unknown', async () => {
    const req = makeReq({ query: { id: 'nope' } });
    const res = makeRes();
    await tournamentDetail(req, res);
    expect(res.statusCode).toBe(404);
    expect((res.body as any).code).toBe('NOT_FOUND');
  });

  it('404 (hidden) when the tournament is a draft', async () => {
    store.tournaments = [
      { id: TOURN, tenant_id: TENANT, name: 'Draft Cup', status: 'draft' },
    ];
    const req = makeReq({ query: { id: TOURN } });
    const res = makeRes();
    await tournamentDetail(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('returns detail + stage summary for a public tournament', async () => {
    store.tournaments = [
      {
        id: TOURN,
        tenant_id: TENANT,
        name: 'Summer Cup',
        slug: 'summer-cup',
        game: 'overwatch',
        status: 'completed',
        start_date: '2026-07-01',
        end_date: '2026-07-10',
        format: 'double_elim',
      },
    ];
    store.tournament_stages = [
      {
        id: 'stage-1',
        tenant_id: TENANT,
        tournament_id: TOURN,
        name: 'Groups',
        stage_type: 'group',
        is_active: false,
        order_index: 0,
      },
      {
        id: 'stage-2',
        tenant_id: TENANT,
        tournament_id: TOURN,
        name: 'Playoffs',
        stage_type: 'single_elimination',
        is_active: true,
        order_index: 1,
      },
    ];
    const req = makeReq({ query: { id: TOURN } });
    const res = makeRes();
    await tournamentDetail(req, res);
    expect(res.statusCode).toBe(200);
    const data = (res.body as any).data;
    expect(data.id).toBe(TOURN);
    expect(data.stages).toHaveLength(2);
    expect(data.stages[0]).toEqual({
      id: 'stage-1',
      name: 'Groups',
      stage_type: 'group',
      status: 'inactive',
    });
    expect(data.stages[1].status).toBe('active');
  });
});

/* ------------------------------------------------------------------ *
 * GET /api/public/v1/tournaments/{id}/matches
 * ------------------------------------------------------------------ */

describe('GET /api/public/v1/tournaments/{id}/matches', () => {
  it('happy path: matches with batched team names', async () => {
    store.tournaments = [
      { id: TOURN, tenant_id: TENANT, name: 'Cup', status: 'running' },
    ];
    store.teams = [
      { id: TEAM1, tenant_id: TENANT, name: 'Alpha' },
      { id: TEAM2, tenant_id: TENANT, name: 'Bravo' },
    ];
    store.matches = [
      {
        id: MATCH,
        tenant_id: TENANT,
        tournament_id: TOURN,
        stage_id: 'stage-1',
        round_number: 1,
        bracket_side: 'winners',
        team1_id: TEAM1,
        team2_id: TEAM2,
        team1_score: 2,
        team2_score: 1,
        winner_team_id: TEAM1,
        status: 'finished',
        scheduled_at: '2026-07-02T18:00:00Z',
      },
    ];
    const req = makeReq({ query: { id: TOURN } });
    const res = makeRes();
    await tournamentMatches(req, res);
    expect(res.statusCode).toBe(200);
    const rows = (res.body as any).data;
    expect(rows).toHaveLength(1);
    expect(rows[0].team1_name).toBe('Alpha');
    expect(rows[0].team2_name).toBe('Bravo');
    expect(rows[0].winner_team_id).toBe(TEAM1);
    expect(rows[0]).not.toHaveProperty('lobby_code');
    expect(rows[0]).not.toHaveProperty('notes');
  });

  it('404 when the tournament does not exist', async () => {
    const req = makeReq({ query: { id: 'ghost' } });
    const res = makeRes();
    await tournamentMatches(req, res);
    expect(res.statusCode).toBe(404);
  });
});

/* ------------------------------------------------------------------ *
 * GET /api/public/v1/tournaments/{id}/standings
 * ------------------------------------------------------------------ */

describe('GET /api/public/v1/tournaments/{id}/standings', () => {
  it('returns [] when the tournament is not finalized', async () => {
    store.tournaments = [
      { id: TOURN, tenant_id: TENANT, name: 'Cup', status: 'running' },
    ];
    const req = makeReq({ query: { id: TOURN } });
    const res = makeRes();
    await tournamentStandings(req, res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).data).toEqual([]);
  });

  it('returns ranked standings joined with team info (no notes)', async () => {
    store.tournaments = [
      { id: TOURN, tenant_id: TENANT, name: 'Cup', status: 'completed' },
    ];
    store.teams = [
      {
        id: TEAM1,
        tenant_id: TENANT,
        name: 'Alpha',
        slug: 'alpha',
        logo_url: 'a.png',
      },
      {
        id: TEAM2,
        tenant_id: TENANT,
        name: 'Bravo',
        slug: 'bravo',
        logo_url: null,
      },
    ];
    store.final_rankings = [
      {
        tenant_id: TENANT,
        tournament_id: TOURN,
        team_id: TEAM2,
        rank: 2,
        prize: '250€',
        notes: 'internal note',
      },
      {
        tenant_id: TENANT,
        tournament_id: TOURN,
        team_id: TEAM1,
        rank: 1,
        prize: '500€',
        notes: 'secret',
      },
    ];
    const req = makeReq({ query: { id: TOURN } });
    const res = makeRes();
    await tournamentStandings(req, res);
    expect(res.statusCode).toBe(200);
    const rows = (res.body as any).data;
    expect(rows.map((r: any) => r.rank)).toEqual([1, 2]);
    expect(rows[0].teamName).toBe('Alpha');
    expect(rows[0].prize).toBe('500€');
    expect(rows[0]).not.toHaveProperty('notes');
  });
});

/* ------------------------------------------------------------------ *
 * GET /api/public/v1/matches/{id}
 * ------------------------------------------------------------------ */

describe('GET /api/public/v1/matches/{id}', () => {
  it('400 on a non-UUID id', async () => {
    const req = makeReq({ query: { id: 'not-a-uuid' } });
    const res = makeRes();
    await matchDetail(req, res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('BAD_REQUEST');
  });

  it('404 when the match is unknown', async () => {
    const req = makeReq({ query: { id: MATCH } });
    const res = makeRes();
    await matchDetail(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('returns match detail + games', async () => {
    store.teams = [
      { id: TEAM1, tenant_id: TENANT, name: 'Alpha' },
      { id: TEAM2, tenant_id: TENANT, name: 'Bravo' },
    ];
    store.matches = [
      {
        id: MATCH,
        tenant_id: TENANT,
        tournament_id: TOURN,
        stage_id: null,
        round_number: 3,
        bracket_side: null,
        team1_id: TEAM1,
        team2_id: TEAM2,
        team1_score: 2,
        team2_score: 0,
        winner_team_id: TEAM1,
        status: 'finished',
        scheduled_at: null,
      },
    ];
    store.games = [
      {
        tenant_id: TENANT,
        match_id: MATCH,
        map_name: 'Ilios',
        map_order: 1,
        team1_score: 1,
        team2_score: 0,
        winner_team_id: TEAM1,
      },
    ];
    const req = makeReq({ query: { id: MATCH } });
    const res = makeRes();
    await matchDetail(req, res);
    expect(res.statusCode).toBe(200);
    const data = (res.body as any).data;
    expect(data.team1_name).toBe('Alpha');
    expect(data.games).toHaveLength(1);
    expect(data.games[0].map_name).toBe('Ilios');
  });
});

/* ------------------------------------------------------------------ *
 * GET /api/public/v1/teams/{id}
 * ------------------------------------------------------------------ */

describe('GET /api/public/v1/teams/{id}', () => {
  it('returns team + public roster without private fields', async () => {
    store.teams = [
      {
        id: TEAM1,
        tenant_id: TENANT,
        name: 'Alpha',
        short_name: 'ALP',
        slug: 'alpha',
        logo_url: 'a.png',
      },
    ];
    store.team_members = [
      {
        tenant_id: TENANT,
        team_id: TEAM1,
        display_name: 'Player One',
        role: 'player',
        is_substitute: false,
        // private fields that must never be projected
        email: 'p1@example.com',
        discord_user_id: '123456789012345678',
      },
    ];
    const req = makeReq({ query: { id: TEAM1 } });
    const res = makeRes();
    await teamDetail(req, res);
    expect(res.statusCode).toBe(200);
    const data = (res.body as any).data;
    expect(data.name).toBe('Alpha');
    expect(data.roster).toHaveLength(1);
    expect(data.roster[0]).toEqual({
      display_name: 'Player One',
      role: 'player',
      is_substitute: false,
    });
    expect(data.roster[0]).not.toHaveProperty('email');
    expect(data.roster[0]).not.toHaveProperty('discord_user_id');
  });

  it('404 when the team is unknown', async () => {
    const req = makeReq({ query: { id: TEAM1 } });
    const res = makeRes();
    await teamDetail(req, res);
    expect(res.statusCode).toBe(404);
  });
});

/* ------------------------------------------------------------------ *
 * GET /api/public/v1/leaderboard  (reuses readLeaderboard)
 * ------------------------------------------------------------------ */

describe('GET /api/public/v1/leaderboard', () => {
  it('returns { data, pagination } from readLeaderboard', async () => {
    store.player_ratings = [
      {
        tenant_id: TENANT,
        user_id: 'u1',
        rating: 1600,
        rd: 60,
        games_played: 10,
        wins: 7,
        losses: 3,
        display_name: 'Top',
        battle_tag: null,
        avatar_url: null,
      },
      {
        tenant_id: TENANT,
        user_id: 'u2',
        rating: 1500,
        rd: 60,
        games_played: 5,
        wins: 2,
        losses: 3,
        display_name: 'Mid',
        battle_tag: null,
        avatar_url: null,
      },
    ];
    const req = makeReq();
    const res = makeRes();
    await leaderboard(req, res);
    expect(res.statusCode).toBe(200);
    const rows = (res.body as any).data;
    expect(rows[0].userId).toBe('u1');
    expect(rows[0].rank).toBe(1);
    expect((res.body as any).pagination.limit).toBe(50);
    expect((res.body as any).pagination.offset).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * GET /api/public/v1/leagues  (reuses readPublicLeagues)
 * ------------------------------------------------------------------ */

describe('GET /api/public/v1/leagues', () => {
  it('returns only public, non-draft leagues in { data }', async () => {
    store.leagues = [
      {
        id: 'l1',
        tenant_id: TENANT,
        name: 'Pro League',
        slug: 'pro',
        is_public: true,
        status: 'active',
      },
      {
        id: 'l2',
        tenant_id: TENANT,
        name: 'Hidden',
        slug: 'hidden',
        is_public: true,
        status: 'draft',
      },
    ];
    const req = makeReq();
    const res = makeRes();
    await leaguesList(req, res);
    expect(res.statusCode).toBe(200);
    const rows = (res.body as any).data;
    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe('pro');
  });
});
