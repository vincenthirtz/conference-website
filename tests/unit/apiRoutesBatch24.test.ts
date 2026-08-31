import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAuthListUsers,
  setRpcResult,
  rpcCalls,
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
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        captain_id: 'user-1',
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
    // Auth-user enrichment now resolves through the batch
    // admin_get_user_profiles RPC (fed by setAuthListUsers).
    setAuthListUsers([{ id: 'sender-1', email: 'sender@example.com' }]);
    const res = makeRes();
    await joinRequestsHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(200);
    const list = (res.body as any).demandes;
    expect(list.map((d: any) => d.id)).toEqual(['d1']);
    expect(list[0].user.email).toBe('sender@example.com');
  });

  it('GET batch-enriches senders (full_name + battle_tag) and skips unknown ids', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        captain_id: 'user-1',
        is_active: true,
        name: 'Alpha',
        logo_url: null,
      },
    ] as any;
    store.demandes = [
      {
        id: 'd-known',
        team_id: 'team-1',
        type: 'join',
        status: 'pending',
        user_id: 'known',
        created_at: '2026',
      },
      {
        id: 'd-ghost',
        team_id: 'team-1',
        type: 'join',
        status: 'pending',
        user_id: 'ghost',
        created_at: '2026',
      },
    ] as any;
    // display_name falls back to full_name; battle_tag comes from metadata.
    setAuthListUsers([
      {
        id: 'known',
        email: 'known@example.com',
        user_metadata: { full_name: 'Known Full', battle_tag: 'Known#9' },
      },
    ] as any);

    const res = makeRes();
    await joinRequestsHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(200);
    const list = (res.body as any).demandes;
    const known = list.find((d: any) => d.id === 'd-known');
    const ghost = list.find((d: any) => d.id === 'd-ghost');
    expect(known.user).toEqual({
      id: 'known',
      email: 'known@example.com',
      display_name: 'Known Full',
      battle_tag: 'Known#9',
    });
    // Unknown id → skipped, userInfo null (best-effort).
    expect(ghost.user).toBeNull();
  });

  it('POST 400 with invalid demandeId', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        captain_id: 'user-1',
        is_active: true,
        name: 'A',
      },
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
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        captain_id: 'user-1',
        is_active: true,
        name: 'A',
      },
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
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        captain_id: 'user-1',
        is_active: true,
        name: 'A',
      },
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

  it('POST approve: calls the approve_join_request RPC and creates news', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        captain_id: 'user-1',
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
    // La RPC transactionnelle réussit et renvoie la ligne team_members créée.
    setRpcResult('approve_join_request', {
      data: { id: 'tm-new', team_id: 'team-1', user_id: 'new-player' },
      error: null,
    });

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
    // L'ajout membre + le passage pending→approved sont délégués à la RPC.
    const call = rpcCalls.find((c) => c.fn === 'approve_join_request');
    expect(call).toBeTruthy();
    expect(call!.params).toEqual({ p_demande_id: VALID_UUID });
    // Effet de bord après succès : news auto publiée.
    expect((store.news as any).length).toBe(1);
  });

  it('POST approve: 409 when roster is locked (RPC not called)', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        captain_id: 'user-1',
        is_active: true,
        name: 'Alpha',
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
    store.tournament_teams = [
      {
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        team_id: 'team-1',
        tournament_id: 'tour-1',
      },
    ] as any;
    const past = new Date(Date.now() - 60_000).toISOString();
    store.tournaments = [
      {
        id: 'tour-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        name: 'Cup',
        roster_locked_at: past,
        status: 'in_progress',
      },
    ] as any;

    const res = makeRes();
    await joinRequestsHandler(
      makeReq(
        { method: 'POST', body: { demandeId: VALID_UUID, action: 'approve' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(rpcCalls.find((c) => c.fn === 'approve_join_request')).toBeFalsy();
  });

  it('POST approve: maps RPC 23505 (already in a team) to 409', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        captain_id: 'user-1',
        is_active: true,
        name: 'Alpha',
      },
    ] as any;
    store.demandes = [
      {
        id: VALID_UUID,
        team_id: 'team-1',
        type: 'join',
        status: 'pending',
        user_id: 'new-player',
        payload: { desired_role: 'player', user_battle_tag: 'New#1234' },
      },
    ] as any;
    store.tournament_teams = [];
    setRpcResult('approve_join_request', {
      data: null,
      error: { code: '23505', message: 'duplicate key value' },
    });

    const res = makeRes();
    await joinRequestsHandler(
      makeReq(
        { method: 'POST', body: { demandeId: VALID_UUID, action: 'approve' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(409);
  });

  it('POST approve: maps RPC demande_not_pending to 409', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        captain_id: 'user-1',
        is_active: true,
        name: 'Alpha',
      },
    ] as any;
    store.demandes = [
      {
        id: VALID_UUID,
        team_id: 'team-1',
        type: 'join',
        status: 'pending',
        user_id: 'new-player',
        payload: { desired_role: 'player', user_battle_tag: 'New#1234' },
      },
    ] as any;
    store.tournament_teams = [];
    setRpcResult('approve_join_request', {
      data: null,
      error: { message: 'demande_not_pending' },
    });

    const res = makeRes();
    await joinRequestsHandler(
      makeReq(
        { method: 'POST', body: { demandeId: VALID_UUID, action: 'approve' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(409);
  });

  // `approve_join_request` remplit team_members.battle_tag avec le SEUL
  // payload : une demande sans tag creait une fiche vide (cas des comptes
  // crees via Discord, qui n'ont jamais eu l'occasion d'en saisir un).
  it('POST approve: 400 BATTLE_TAG_REQUIRED when nothing carries a tag', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        captain_id: 'user-1',
        is_active: true,
        name: 'Alpha',
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
    store.tournament_teams = [];

    const res = makeRes();
    await joinRequestsHandler(
      makeReq(
        { method: 'POST', body: { demandeId: VALID_UUID, action: 'approve' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('BATTLE_TAG_REQUIRED');
    expect(rpcCalls.find((c) => c.fn === 'approve_join_request')).toBeFalsy();
  });

  it('POST approve: captain-supplied battleTag is written into the payload', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        captain_id: 'user-1',
        is_active: true,
        name: 'Alpha',
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
    store.tournament_teams = [];
    setRpcResult('approve_join_request', { data: {}, error: null });

    const res = makeRes();
    await joinRequestsHandler(
      makeReq(
        {
          method: 'POST',
          body: {
            demandeId: VALID_UUID,
            action: 'approve',
            battleTag: 'Kezya#21287',
          },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    // La RPC ne lit que le payload : sans cette reecriture, la correction de
    // la capitaine serait perdue.
    const dem = (store.demandes as any).find((d: any) => d.id === VALID_UUID);
    expect(dem.payload.user_battle_tag).toBe('Kezya#21287');
    expect(rpcCalls.find((c) => c.fn === 'approve_join_request')).toBeTruthy();
  });

  it('POST approve: 400 BATTLE_TAG_INVALID on a malformed correction', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        captain_id: 'user-1',
        is_active: true,
        name: 'Alpha',
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
    store.tournament_teams = [];

    const res = makeRes();
    await joinRequestsHandler(
      makeReq(
        {
          method: 'POST',
          body: {
            demandeId: VALID_UUID,
            action: 'approve',
            battleTag: 'Kezya21287',
          },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('BATTLE_TAG_INVALID');
    expect(rpcCalls.find((c) => c.fn === 'approve_join_request')).toBeFalsy();
  });

  it('POST reject: marks demande rejected, no member added', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        captain_id: 'user-1',
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

  it('POST approve: maps RPC 23514 (max_players trigger) to 400', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        captain_id: 'user-1',
        is_active: true,
        name: 'Alpha',
      },
    ] as any;
    store.team_members = [];
    // Pas de roster-lock : la limite est levée par le trigger DB dans la RPC.
    store.tournament_teams = [];
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
    setRpcResult('approve_join_request', {
      data: null,
      error: { code: '23514', message: 'max_players exceeded' },
    });

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
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        captain_id: 'user-1',
        is_active: true,
        name: 'A',
      },
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
    // The GET now delegates to loadManagedTeamSlice, which resolves the team via
    // a separate `teams` query (tenant-scoped) instead of a nested join, so the
    // team detail must be seeded on store.teams.
    store.teams = [
      {
        id: 'team-1',
        name: 'Alpha',
        short_name: 'A',
        logo_url: null,
        country: 'FR',
        description: null,
        captain_id: 'user-1',
        is_joinable: true,
        open_for_scrim: false,
      },
    ] as any;
    store.team_members = [
      {
        id: 'm1',
        team_id: 'team-1',
        user_id: 'user-1',
        role: 'player',
        battle_tag: 'Me#1',
        is_substitute: false,
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
    store.teams = [
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        captain_id: 'someone-else',
      },
    ] as any;
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
    store.teams = [
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        captain_id: 'user-1',
      },
    ] as any;
    const res = makeRes();
    await myTeamHandler(
      makeReq({ method: 'PATCH', body: { teamId: 'team-1', name: 'X' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 400 on description too long', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        captain_id: 'user-1',
      },
    ] as any;
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
    store.teams = [
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        captain_id: 'user-1',
      },
    ] as any;
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
      {
        id: 'team-1',
        tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
        captain_id: 'user-1',
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
