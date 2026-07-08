import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { applyMatchScoreMock, logStaffActionMock } = vi.hoisted(() => ({
  applyMatchScoreMock: vi.fn(async () => ({
    matchId: 'm1',
    updated: true,
    match: {},
    winnerTeamId: 'team-a',
  })),
  logStaffActionMock: vi.fn(async () => undefined),
}));

vi.mock('@/utils/matches/applyScore', () => ({
  applyMatchScore: applyMatchScoreMock,
}));
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: logStaffActionMock,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import adminTeamsHandler from '../../pages/api/admin/teams/index';
import matchByIdHandler from '../../pages/api/matches/[matchId]';
import statsTeamsHandler from '../../pages/api/admin/stats/teams';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'manager'
): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let _tokenCounter = 0;
function freshBearer() {
  _tokenCounter += 1;
  return `Bearer t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}, includeAuth = true): any {
  const headers: Record<string, string> = { host: 'h' };
  if (includeAuth) headers.authorization = freshBearer();
  return {
    method: 'GET',
    headers,
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    endBody: undefined as unknown,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = (b?: unknown) => ((res.endBody = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  applyMatchScoreMock.mockClear();
  logStaffActionMock.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('manager')] as any;
});

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

/* -----------------------------------------------------------
 * /api/admin/teams (manager+)
 * ---------------------------------------------------------*/

describe('GET /api/admin/teams', () => {
  it('returns 405 on non-GET', async () => {
    const res = makeRes();
    await adminTeamsHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('200 lists teams without filters', async () => {
    store.teams = [
      { id: 't1', name: 'Alpha', is_active: true, created_at: '2026' },
      { id: 't2', name: 'Beta', is_active: true, created_at: '2026' },
    ] as any;
    const res = makeRes();
    await adminTeamsHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).teams).toHaveLength(2);
  });

  it('?isActive=false filters inactive teams', async () => {
    store.teams = [
      { id: 't1', name: 'Alpha', is_active: true, created_at: '2026' },
      { id: 't2', name: 'Beta', is_active: false, created_at: '2026' },
    ] as any;
    const res = makeRes();
    await adminTeamsHandler(
      makeReq({ method: 'GET', query: { isActive: 'false' } }),
      res
    );
    expect((res.body as any).teams.map((t: any) => t.id)).toEqual(['t2']);
  });

  it('?includeTotal=1 returns count', async () => {
    store.teams = [
      { id: 't1', name: 'A', is_active: true, created_at: '2026' },
    ] as any;
    const res = makeRes();
    await adminTeamsHandler(
      makeReq({ method: 'GET', query: { includeTotal: '1' } }),
      res
    );
    expect((res.body as any).total).toBe(1);
  });

  it('?tournamentId filters via tournament_teams join', async () => {
    store.teams = [
      { id: 't1', name: 'A', is_active: true, created_at: '2026' },
      { id: 't2', name: 'B', is_active: true, created_at: '2026' },
    ] as any;
    store.tournament_teams = [
      { tournament_id: 'tour-1', team_id: 't2' },
    ] as any;
    const res = makeRes();
    await adminTeamsHandler(
      makeReq({ method: 'GET', query: { tournamentId: 'tour-1' } }),
      res
    );
    expect((res.body as any).teams.map((t: any) => t.id)).toEqual(['t2']);
  });

  it('?tournamentId returns empty list if no team is in the tournament', async () => {
    store.teams = [
      { id: 't1', name: 'A', is_active: true, created_at: '2026' },
    ] as any;
    store.tournament_teams = [];
    const res = makeRes();
    await adminTeamsHandler(
      makeReq({ method: 'GET', query: { tournamentId: 'tour-x' } }),
      res
    );
    expect((res.body as any).teams).toEqual([]);
    expect((res.body as any).total).toBe(0);
  });

  // Search now spans name + slug + short_name via a single PostgREST
  // `.or(name.ilike,slug.ilike,short_name.ilike)` (mirrors the SSR loader in
  // pages/admin/teams/index.tsx). The in-memory mock treats `.or(...)` as a
  // NO-OP (cf. supabaseMock Builder.or), so we can't assert on the filtered
  // result here — only that a `search` param resolves without error and keeps
  // the response shape. The real multi-column filtering is covered by e2e /
  // PostgREST.
  it('accepts a search param without error (multi-column filter not testable via mock)', async () => {
    store.teams = [
      { id: 't1', name: 'Alpha Wolves', is_active: true, created_at: '2026' },
      {
        id: 't2',
        name: 'Beta Hawks',
        slug: 'beta-hawks',
        short_name: 'BH',
        is_active: true,
        created_at: '2026',
      },
    ] as any;
    const res = makeRes();
    await adminTeamsHandler(
      makeReq({ method: 'GET', query: { search: 'wolves' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(Array.isArray((res.body as any).teams)).toBe(true);
  });
});

/* -----------------------------------------------------------
 * /api/matches/[matchId]
 * ---------------------------------------------------------*/

describe('/api/matches/[matchId]', () => {
  it('400 on invalid matchId', async () => {
    const res = makeRes();
    await matchByIdHandler(
      makeReq({ method: 'GET', query: { matchId: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 404 when match not found', async () => {
    store.matches = [];
    const res = makeRes();
    await matchByIdHandler(
      makeReq({ method: 'GET', query: { matchId: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('GET 200 returns the match payload', async () => {
    store.matches = [
      {
        id: VALID_UUID,
        tournament_id: 'tour-1',
        stage_id: null,
        status: 'finished',
        team1_id: 't1',
        team2_id: 't2',
        team1_score: 2,
        team2_score: 1,
        winner_team_id: 't1',
        is_bye: false,
      },
    ] as any;
    const res = makeRes();
    await matchByIdHandler(
      makeReq({ method: 'GET', query: { matchId: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).match.id).toBe(VALID_UUID);
  });

  it('PUT 400 when team1Score/team2Score are not numbers', async () => {
    const res = makeRes();
    await matchByIdHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: VALID_UUID },
        body: { team1Score: 'not-a-number' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(applyMatchScoreMock).not.toHaveBeenCalled();
  });

  it('PUT 200 invokes applyMatchScore with sane defaults', async () => {
    const res = makeRes();
    await matchByIdHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: VALID_UUID },
        body: { team1Score: 2, team2Score: 1 },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(applyMatchScoreMock).toHaveBeenCalledOnce();
    const args = (applyMatchScoreMock.mock.calls[0] as any[])[0];
    expect(args.matchId).toBe(VALID_UUID);
    expect(args.markFinished).toBe(true);
    expect(args.propagateBracket).toBe(true);
  });

  it('PUT respects propagate=false', async () => {
    const res = makeRes();
    await matchByIdHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: VALID_UUID },
        body: { team1Score: 0, team2Score: 0, propagate: false },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const args = (applyMatchScoreMock.mock.calls[0] as any[])[0];
    expect(args.propagateBracket).toBe(false);
  });

  it('DELETE 404 when match missing', async () => {
    store.matches = [];
    const res = makeRes();
    await matchByIdHandler(
      makeReq({ method: 'DELETE', query: { matchId: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('DELETE 200 cancels the match and logs', async () => {
    store.matches = [
      {
        id: VALID_UUID,
        tournament_id: 'tour-1',
        status: 'pending',
        team1_score: null,
        team2_score: null,
        winner_team_id: null,
      },
    ] as any;
    const res = makeRes();
    await matchByIdHandler(
      makeReq({ method: 'DELETE', query: { matchId: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.matches[0] as any).status).toBe('cancelled');
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await matchByIdHandler(
      makeReq({ method: 'POST', query: { matchId: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/admin/stats/teams
 * ---------------------------------------------------------*/

describe('GET /api/admin/stats/teams', () => {
  function seedStats() {
    // S5b-bis : la vue n'a pas tenant_id, donc le handler scope par les
    // tournaments du tenant courant. Il faut donc seed `tournaments` aussi.
    store.tournaments = [
      { id: 'tour-1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4' },
    ] as any;
    store.team_stats_view = [
      {
        team_id: 't1',
        team_name: 'Alpha',
        team_short_name: 'A',
        team_logo_url: null,
        tournament_id: 'tour-1',
        tournament_name: 'Cup',
        tournament_slug: 'cup',
        matches_played: 5,
        wins: 3,
        losses: 2,
        draws: 0,
        maps_won: 7,
        maps_lost: 4,
        map_ties: 0,
        winrate: 0.6,
        map_winrate: 0.64,
        points: 9,
        last_match_at: '2026-04-01',
      },
      {
        team_id: 't2',
        team_name: 'Beta',
        team_short_name: 'B',
        team_logo_url: null,
        tournament_id: null,
        tournament_name: null,
        tournament_slug: null,
        matches_played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        maps_won: 0,
        maps_lost: 0,
        map_ties: 0,
        winrate: null,
        map_winrate: null,
        points: null,
        last_match_at: null,
      },
    ] as any;
  }

  it('returns 405 on non-GET', async () => {
    const res = makeRes();
    await statsTeamsHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('200 returns enriched stats', async () => {
    seedStats();
    const res = makeRes();
    await statsTeamsHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const stats = (res.body as any).stats;
    // S5b-bis : la ligne `t2` a tournament_id=null, exclue par le scope tenant
    // (tournaments-du-tenant filter). Comportement attendu : seul t1 remonte.
    expect(stats).toHaveLength(1);
    const alpha = stats.find((s: any) => s.team_id === 't1');
    expect(alpha.tournament.name).toBe('Cup');
  });

  it('?minMatches=3 filters out teams below threshold', async () => {
    seedStats();
    const res = makeRes();
    await statsTeamsHandler(
      makeReq({ method: 'GET', query: { minMatches: '3' } }),
      res
    );
    expect((res.body as any).stats.map((s: any) => s.team_id)).toEqual(['t1']);
  });

  it('exports CSV when ?export=csv', async () => {
    seedStats();
    const res = makeRes();
    await statsTeamsHandler(
      makeReq({ method: 'GET', query: { export: 'csv' } }),
      res
    );
    expect(res.headers['Content-Type']).toMatch(/text\/csv/);
    expect(typeof res.endBody).toBe('string');
    expect(res.endBody as string).toContain('team_name');
    expect(res.endBody as string).toContain('Alpha');
  });

  it('?tournamentId restricts to a single tournament', async () => {
    seedStats();
    const res = makeRes();
    await statsTeamsHandler(
      makeReq({ method: 'GET', query: { tournamentId: 'tour-1' } }),
      res
    );
    expect((res.body as any).stats.map((s: any) => s.team_id)).toEqual(['t1']);
  });
});
