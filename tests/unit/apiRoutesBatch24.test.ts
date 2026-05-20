import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAdminUser,
} from './__helpers__/supabaseMock';

import joinRequestsHandler from '../../pages/api/teams/join-requests';
import myTeamHandler from '../../pages/api/admin/teams/my';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

let _tokenCounter = 0;
function freshBearer() {
  _tokenCounter += 1;
  return `Bearer t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}, includeAuth = false): any {
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
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
});

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

/* -----------------------------------------------------------
 * /api/teams/join-requests
 * ---------------------------------------------------------*/

describe('/api/teams/join-requests', () => {
  it('401 without token', async () => {
    const res = makeRes();
    await joinRequestsHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('403 when user is not captain', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [];
    const res = makeRes();
    await joinRequestsHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(403);
  });

  it('GET 200 lists pending join demandes for captain team', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', captain_id: 'user-1',
        is_active: true,
        name: 'Alpha',
        logo_url: null,
      },
    ] as any;
    store.demandes = [
      {
        id: 'd1',
        team_id: 'team-1',
        type: 'join',
        status: 'pending',
        user_id: 'sender-1',
        created_at: '2026',
      },
      {
        id: 'd2',
        team_id: 'team-1',
        type: 'join',
        status: 'approved',
        user_id: null,
        created_at: '2026',
      },
    ] as any;
    setAdminUser('sender-1', 'sender@example.com');
    const res = makeRes();
    await joinRequestsHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(200);
    const list = (res.body as any).demandes;
    expect(list.map((d: any) => d.id)).toEqual(['d1']);
    expect(list[0].user.email).toBe('sender@example.com');
  });

  it('POST 400 with invalid demandeId', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', captain_id: 'user-1', is_active: true, name: 'A' },
    ] as any;
    const res = makeRes();
    await joinRequestsHandler(
      makeReq(
        {
          method: 'POST',
          body: { demandeId: 'bogus', action: 'approve' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 with invalid action', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', captain_id: 'user-1', is_active: true, name: 'A' },
    ] as any;
    const res = makeRes();
    await joinRequestsHandler(
      makeReq(
        {
          method: 'POST',
          body: { demandeId: VALID_UUID, action: 'unknown' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 404 when demande not found / not pending', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', captain_id: 'user-1', is_active: true, name: 'A' },
    ] as any;
    store.demandes = [];
    const res = makeRes();
    await joinRequestsHandler(
      makeReq(
        {
          method: 'POST',
          body: { demandeId: VALID_UUID, action: 'approve' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('POST approve: creates team_member and marks demande approved', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', captain_id: 'user-1',
        is_active: true,
        name: 'Alpha',
        logo_url: null,
      },
    ] as any;
    store.team_members = [];
    store.tournament_teams = [];
    store.demandes = [
      {
        id: VALID_UUID,
        team_id: 'team-1',
        type: 'join',
        status: 'pending',
        user_id: 'new-player',
        payload: {
          desired_role: 'player',
          user_battle_tag: 'NewPlayer#1234',
        },
      },
    ] as any;
    store.news = [];

    const res = makeRes();
    await joinRequestsHandler(
      makeReq(
        {
          method: 'POST',
          body: { demandeId: VALID_UUID, action: 'approve' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.team_members.length).toBe(1);
    expect((store.team_members[0] as any).user_id).toBe('new-player');
    const dem = (store.demandes as any).find((d: any) => d.id === VALID_UUID);
    expect(dem.status).toBe('approved');
    expect((store.news as any).length).toBe(1);
  });

  it('POST reject: marks demande rejected, no member added', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', captain_id: 'user-1',
        is_active: true,
        name: 'Alpha',
      },
    ] as any;
    store.team_members = [];
    store.demandes = [
      {
        id: VALID_UUID,
        team_id: 'team-1',
        type: 'join',
        status: 'pending',
        user_id: 'new-player',
        payload: { desired_role: 'player' },
      },
    ] as any;
    const res = makeRes();
    await joinRequestsHandler(
      makeReq(
        {
          method: 'POST',
          body: { demandeId: VALID_UUID, action: 'reject' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.team_members.length).toBe(0);
    const dem = (store.demandes as any).find((d: any) => d.id === VALID_UUID);
    expect(dem.status).toBe('rejected');
  });

  it('POST approve: 400 when team would exceed max_players', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', captain_id: 'user-1',
        is_active: true,
        name: 'Alpha',
      },
    ] as any;
    store.team_members = [
      { id: 'm1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', team_id: 'team-1', role: 'player' },
      { id: 'm2', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', team_id: 'team-1', role: 'player' },
    ] as any;
    store.tournament_teams = [
      { tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', team_id: 'team-1', tournament_id: 'tour-1', tournaments: { max_players: 2 },
      },
    ] as any;
    store.demandes = [
      {
        id: VALID_UUID,
        team_id: 'team-1',
        type: 'join',
        status: 'pending',
        user_id: 'new-player',
        payload: { desired_role: 'player' },
      },
    ] as any;

    const res = makeRes();
    await joinRequestsHandler(
      makeReq(
        {
          method: 'POST',
          body: { demandeId: VALID_UUID, action: 'approve' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 405 on unsupported method', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', captain_id: 'user-1', is_active: true, name: 'A' },
    ] as any;
    const res = makeRes();
    await joinRequestsHandler(makeReq({ method: 'PATCH' }, true), res);
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/admin/teams/my
 * ---------------------------------------------------------*/

describe('/api/admin/teams/my', () => {
  it('401 without token', async () => {
    const res = makeRes();
    await myTeamHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('GET 200 returns null team when user has no membership', async () => {
    setAuthUser({ id: 'user-1' });
    store.team_members = [];
    const res = makeRes();
    await myTeamHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).team).toBeNull();
    expect((res.body as any).isCaptain).toBe(false);
  });

  it('GET 200 returns team + members + isCaptain', async () => {
    setAuthUser({ id: 'user-1' });
    store.team_members = [
      {
        id: 'm1',
        team_id: 'team-1',
        user_id: 'user-1',
        role: 'player',
        battle_tag: 'Me#1',
        is_substitute: false,
        // Joined team data (Supabase nested-select shape)
        teams: {
          id: 'team-1',
          name: 'Alpha',
          short_name: 'A',
          logo_url: null,
          country: 'FR',
          description: null,
          captain_id: 'user-1',
          is_joinable: true,
        },
      },
      {
        id: 'm2',
        team_id: 'team-1',
        user_id: 'other',
        role: 'player',
        battle_tag: 'Other#2',
        is_substitute: false,
      },
    ] as any;
    const res = makeRes();
    await myTeamHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.team.name).toBe('Alpha');
    expect(body.isCaptain).toBe(true);
    expect(body.members).toHaveLength(2);
    const me = body.members.find((m: any) => m.user_id === 'user-1');
    expect(me.is_captain).toBe(true);
  });

  it('PATCH 400 when teamId missing', async () => {
    setAuthUser({ id: 'user-1' });
    const res = makeRes();
    await myTeamHandler(makeReq({ method: 'PATCH', body: {} }, true), res);
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 403 when team not found and user has no team', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [];
    const res = makeRes();
    await myTeamHandler(
      makeReq(
        { method: 'PATCH', body: { teamId: 'unknown', name: 'New' } },
        true
      ),
      res
    );
    // The management-access check now runs before the team lookup,
    // so an unknown teamId on a user with no team yields 403, not 404.
    expect(res.statusCode).toBe(403);
  });

  it('PATCH 403 when not captain', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [{ id: 'team-1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', captain_id: 'someone-else' }] as any;
    const res = makeRes();
    await myTeamHandler(
      makeReq(
        { method: 'PATCH', body: { teamId: 'team-1', name: 'New' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('PATCH 400 on too-short name', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [{ id: 'team-1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', captain_id: 'user-1' }] as any;
    const res = makeRes();
    await myTeamHandler(
      makeReq({ method: 'PATCH', body: { teamId: 'team-1', name: 'X' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 400 on description too long', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [{ id: 'team-1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', captain_id: 'user-1' }] as any;
    const res = makeRes();
    await myTeamHandler(
      makeReq(
        {
          method: 'PATCH',
          body: { teamId: 'team-1', description: 'a'.repeat(2001) },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 400 on invalid logo URL', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [{ id: 'team-1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', captain_id: 'user-1' }] as any;
    const res = makeRes();
    await myTeamHandler(
      makeReq(
        {
          method: 'PATCH',
          body: { teamId: 'team-1', logo_url: 'javascript:alert(1)' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 200 updates fields', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', captain_id: 'user-1',
        name: 'Old',
        country: 'FR',
        description: 'old',
      },
    ] as any;
    const res = makeRes();
    await myTeamHandler(
      makeReq(
        {
          method: 'PATCH',
          body: {
            teamId: 'team-1',
            name: '  New Name  ',
            country: 'BE',
            description: 'new',
            logo_url: 'https://example.com/logo.png',
          },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.teams[0] as any).name).toBe('New Name');
    expect((store.teams[0] as any).country).toBe('BE');
    expect((store.teams[0] as any).logo_url).toBe(
      'https://example.com/logo.png'
    );
  });

  it('returns 405 on unsupported method', async () => {
    setAuthUser({ id: 'user-1' });
    const res = makeRes();
    await myTeamHandler(makeReq({ method: 'POST' }, true), res);
    expect(res.statusCode).toBe(405);
  });
});
