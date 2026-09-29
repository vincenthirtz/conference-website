// tests/unit/adminLeaguesRoutes.test.ts
//
// Routes admin des ligues, migrées sur `defineAdminRoute`
// (features/admin/leagues) : un succès et au moins une erreur par route, avec
// le contrat historique des corps d'erreur (INVALID_BODY, SLUG_CONFLICT,
// TOURNAMENT_NOT_FOUND) et le journal staff.
//
// Supabase + rateLimit sont mockés globalement (tests/unit/__helpers__/testSetup.ts).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import leaguesHandler from '../../pages/api/admin/leagues/index';
import leagueByIdHandler from '../../pages/api/admin/leagues/[id]/index';
import standingsHandler from '../../pages/api/admin/leagues/[id]/standings';
import linkHandler from '../../pages/api/admin/leagues/[id]/tournaments/index';
import unlinkHandler from '../../pages/api/admin/leagues/[id]/tournaments/[tournamentId]';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const LEAGUE_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const TOURNAMENT_ID = 'a1b2c3d4-0000-4000-8000-000000000002';
const TEAM_ID = 'a1b2c3d4-0000-4000-8000-000000000003';

let n = 0;
function makeReq(over: Partial<any> = {}): any {
  n += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-leagues-${n}` },
    query: {},
    cookies: {},
    body: {},
    ...over,
  };
}

function makeRes(): any {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    ended: false,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.end = () => ((res.ended = true), res);
  return res;
}

function staffRow(role: StaffMember['role'] = 'admin'): StaffMember {
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

function league(over: Record<string, unknown> = {}) {
  return {
    id: LEAGUE_ID,
    tenant_id: TENANT,
    name: 'Saison 1',
    slug: 'saison-1',
    description: null,
    game: null,
    status: 'draft',
    start_date: null,
    end_date: null,
    points_table: { '1': 10 },
    is_public: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [staffRow()] as any;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('/api/admin/leagues', () => {
  it('GET lists the tenant leagues', async () => {
    store.leagues = [league()] as any;
    const res = makeRes();
    await leaguesHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.leagues).toHaveLength(1);
    expect(res.body.leagues[0].slug).toBe('saison-1');
  });

  it('POST 400 keeps the historical INVALID_BODY error shape', async () => {
    const res = makeRes();
    await leaguesHandler(
      makeReq({ method: 'POST', body: { name: 'X', slug: 'Pas Valide' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid body');
    expect(res.body.code).toBe('INVALID_BODY');
    expect(res.body.details).toBeDefined();
  });

  it('POST 409 SLUG_CONFLICT when the slug is taken in the tenant', async () => {
    store.leagues = [league()] as any;
    const res = makeRes();
    await leaguesHandler(
      makeReq({ method: 'POST', body: { name: 'Autre', slug: 'saison-1' } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      error: 'Slug already in use',
      code: 'SLUG_CONFLICT',
    });
  });

  it('405 with Allow on an undeclared method', async () => {
    const res = makeRes();
    await leaguesHandler(makeReq({ method: 'PUT' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET,POST');
  });

  it('403 below the manage_tournaments permission', async () => {
    store.staff = [staffRow('caster')] as any;
    const res = makeRes();
    await leaguesHandler(makeReq(), res);
    expect(res.statusCode).toBe(403);
  });
});

describe('/api/admin/leagues/[id]', () => {
  it('400 on an invalid id, with the historical message', async () => {
    const res = makeRes();
    await leagueByIdHandler(makeReq({ query: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Missing or invalid id');
  });

  it('GET 404 when the league is not in the tenant', async () => {
    store.leagues = [] as any;
    const res = makeRes();
    await leagueByIdHandler(makeReq({ query: { id: LEAGUE_ID } }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('League not found');
  });

  it('GET returns the league', async () => {
    store.leagues = [league()] as any;
    const res = makeRes();
    await leagueByIdHandler(makeReq({ query: { id: LEAGUE_ID } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(LEAGUE_ID);
  });

  it('PATCH 400 when no field is given', async () => {
    store.leagues = [league()] as any;
    const res = makeRes();
    await leagueByIdHandler(
      makeReq({ method: 'PATCH', query: { id: LEAGUE_ID }, body: {} }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('No fields to update');
  });

  it('PATCH updates and logs update_league', async () => {
    store.leagues = [league()] as any;
    store.staff_logs = [] as any;
    const res = makeRes();
    await leagueByIdHandler(
      makeReq({
        method: 'PATCH',
        query: { id: LEAGUE_ID },
        body: { name: 'Saison 1 bis' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.leagues as any[])[0].name).toBe('Saison 1 bis');
    const log = (store.staff_logs as any[]).find(
      (l) => l.action === 'update_league'
    );
    expect(log?.payload?.fields).toEqual(['name']);
  });

  it('DELETE answers 204 without a body', async () => {
    store.leagues = [league()] as any;
    const res = makeRes();
    await leagueByIdHandler(
      makeReq({ method: 'DELETE', query: { id: LEAGUE_ID } }),
      res
    );
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(store.leagues as any[]).toHaveLength(0);
  });
});

describe('/api/admin/leagues/[id]/standings', () => {
  it('404 when the league does not exist', async () => {
    const res = makeRes();
    await standingsHandler(makeReq({ query: { id: LEAGUE_ID } }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('League not found');
  });

  it('returns standings joined with team names, and linked tournaments', async () => {
    store.leagues = [league()] as any;
    store.league_standings = [
      {
        id: 's1',
        tenant_id: TENANT,
        league_id: LEAGUE_ID,
        team_id: TEAM_ID,
        points: 10,
        tournaments_counted: 1,
        scrims_counted: null,
        best_rank: 1,
        rank: 1,
      },
    ] as any;
    store.teams = [
      { id: TEAM_ID, tenant_id: TENANT, name: 'Alpha', slug: 'alpha' },
    ] as any;
    store.league_tournaments = [
      {
        league_id: LEAGUE_ID,
        tenant_id: TENANT,
        tournament_id: TOURNAMENT_ID,
        weight: null,
      },
    ] as any;
    store.tournaments = [
      { id: TOURNAMENT_ID, tenant_id: TENANT, name: 'Cup', slug: 'cup' },
    ] as any;

    const res = makeRes();
    await standingsHandler(makeReq({ query: { id: LEAGUE_ID } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.standings).toEqual([
      {
        teamId: TEAM_ID,
        teamName: 'Alpha',
        teamSlug: 'alpha',
        logoUrl: null,
        points: 10,
        tournamentsCounted: 1,
        scrimsCounted: 0,
        bestRank: 1,
        rank: 1,
      },
    ]);
    expect(res.body.tournaments).toEqual([
      { id: TOURNAMENT_ID, name: 'Cup', slug: 'cup', weight: 1 },
    ]);
  });
});

describe('/api/admin/leagues/[id]/tournaments', () => {
  it('404 TOURNAMENT_NOT_FOUND when the tournament is not in the tenant', async () => {
    store.leagues = [league()] as any;
    store.tournaments = [] as any;
    const res = makeRes();
    await linkHandler(
      makeReq({
        method: 'POST',
        query: { id: LEAGUE_ID },
        body: { tournament_id: TOURNAMENT_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({
      error: 'Tournament not found',
      code: 'TOURNAMENT_NOT_FOUND',
    });
  });

  it('201 links the tournament and logs link_league_tournament', async () => {
    store.leagues = [league()] as any;
    store.tournaments = [{ id: TOURNAMENT_ID, tenant_id: TENANT }] as any;
    store.league_tournaments = [] as any;
    store.staff_logs = [] as any;
    const res = makeRes();
    await linkHandler(
      makeReq({
        method: 'POST',
        query: { id: LEAGUE_ID },
        body: { tournament_id: TOURNAMENT_ID, weight: 2 },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      league_id: LEAGUE_ID,
      tournament_id: TOURNAMENT_ID,
      weight: 2,
    });
    const log = (store.staff_logs as any[]).find(
      (l) => l.action === 'link_league_tournament'
    );
    expect(log?.payload).toMatchObject({
      operation: 'link_tournament',
      tournament_id: TOURNAMENT_ID,
      weight: 2,
    });
  });
});

describe('/api/admin/leagues/[id]/tournaments/[tournamentId]', () => {
  it('400 on an invalid tournament id', async () => {
    const res = makeRes();
    await unlinkHandler(
      makeReq({
        method: 'DELETE',
        query: { id: LEAGUE_ID, tournamentId: 'nope' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Missing or invalid tournament id');
  });

  it('204 unlinks the tournament', async () => {
    store.league_tournaments = [
      {
        league_id: LEAGUE_ID,
        tenant_id: TENANT,
        tournament_id: TOURNAMENT_ID,
        weight: 1,
      },
    ] as any;
    const res = makeRes();
    await unlinkHandler(
      makeReq({
        method: 'DELETE',
        query: { id: LEAGUE_ID, tournamentId: TOURNAMENT_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(204);
    expect(store.league_tournaments as any[]).toHaveLength(0);
  });
});
