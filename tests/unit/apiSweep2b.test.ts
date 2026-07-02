// Sweep 2b: medium-sized 0% public/auth handlers.
//
// Targets:
//  - pages/api/player/messages.ts (~240 lines)
//  - pages/api/player/messages/[conversationId].ts (~150 lines)
//  - pages/api/teams/transfer-requests.ts (~280 lines)
//  - pages/api/team/[id]/maps.ts (~230 lines)
//  - pages/api/team/[id]/stats.ts (~290 lines)

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAdminUser,
  setRpcResult,
  rpcCalls,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import messagesHandler from '../../pages/api/player/messages';
import conversationHandler from '../../pages/api/player/messages/[conversationId]';
import transferRequestsHandler from '../../pages/api/teams/transfer-requests';
import teamMapsHandler from '../../pages/api/team/[id]/maps';
import teamStatsHandler from '../../pages/api/team/[id]/stats';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h' },
    query: {},
    body: {},
    ...over,
  };
}

function makeAuthedReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
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

const TEAM_A = '11111111-1111-1111-1111-111111111111';
const TEAM_B = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
});

/* -----------------------------------------------------------
 * /api/player/messages
 * ---------------------------------------------------------*/

describe('/api/player/messages', () => {
  it('401 when unauthenticated', async () => {
    const res = makeRes();
    await messagesHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('403 when not captain or manager of any team', async () => {
    setAuthUser({ id: 'u1', email: 'u@x.com', user_metadata: {} });
    const res = makeRes();
    await messagesHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('403 when not captain', async () => {
    setAuthUser({ id: 'u1', email: 'u@x.com', user_metadata: {} });
    store.team_members = [{ id: 'tm1', user_id: 'u1', team_id: TEAM_A }] as any;
    store.teams = [{ id: TEAM_A, captain_id: 'u-other', name: 'Alpha' }] as any;
    const res = makeRes();
    await messagesHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('GET returns conversations grouped', async () => {
    setAuthUser({ id: 'cap', email: 'cap@x.com', user_metadata: {} });
    store.team_members = [
      { id: 'tm1', user_id: 'cap', team_id: TEAM_A },
    ] as any;
    store.teams = [{ id: TEAM_A, captain_id: 'cap', name: 'Alpha' }] as any;
    store.demandes = [
      {
        id: 'm1',
        type: 'captain_message',
        user_id: 'cap',
        team_id: TEAM_B,
        comment: 'hi',
        status: 'pending',
        created_at: '2026-04-02T00:00:00.000Z',
        payload: {
          conversation_id: `${TEAM_A}_${TEAM_B}`,
          from_team_id: TEAM_A,
          target_team_name: 'Beta',
        },
      },
      {
        id: 'm2',
        type: 'captain_message',
        user_id: 'other',
        team_id: TEAM_A,
        comment: 'hello',
        status: 'pending',
        created_at: '2026-04-03T00:00:00.000Z',
        payload: {
          conversation_id: `${TEAM_A}_${TEAM_B}`,
          from_team_id: TEAM_B,
          from_team_name: 'Beta',
        },
      },
    ] as any;
    const res = makeRes();
    await messagesHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const convs = (res.body as any).conversations;
    expect(convs).toHaveLength(1);
    expect(convs[0].messageCount).toBe(2);
    expect(convs[0].unreadCount).toBe(1);
  });

  it('POST 400 when content missing', async () => {
    setAuthUser({ id: 'cap', email: 'cap@x.com', user_metadata: {} });
    store.team_members = [
      { id: 'tm1', user_id: 'cap', team_id: TEAM_A },
    ] as any;
    store.teams = [{ id: TEAM_A, captain_id: 'cap', name: 'Alpha' }] as any;
    const res = makeRes();
    await messagesHandler(
      makeAuthedReq({
        method: 'POST',
        body: { targetTeamId: TEAM_B, content: '   ' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when content too long', async () => {
    setAuthUser({ id: 'cap', email: 'cap@x.com', user_metadata: {} });
    store.team_members = [
      { id: 'tm1', user_id: 'cap', team_id: TEAM_A },
    ] as any;
    store.teams = [{ id: TEAM_A, captain_id: 'cap', name: 'Alpha' }] as any;
    const res = makeRes();
    await messagesHandler(
      makeAuthedReq({
        method: 'POST',
        body: { targetTeamId: TEAM_B, content: 'a'.repeat(2100) },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when targetTeamId missing', async () => {
    setAuthUser({ id: 'cap', email: 'cap@x.com', user_metadata: {} });
    store.team_members = [
      { id: 'tm1', user_id: 'cap', team_id: TEAM_A },
    ] as any;
    store.teams = [{ id: TEAM_A, captain_id: 'cap', name: 'Alpha' }] as any;
    const res = makeRes();
    await messagesHandler(
      makeAuthedReq({ method: 'POST', body: { content: 'hi' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when targeting own team', async () => {
    setAuthUser({ id: 'cap', email: 'cap@x.com', user_metadata: {} });
    store.team_members = [
      { id: 'tm1', user_id: 'cap', team_id: TEAM_A },
    ] as any;
    store.teams = [{ id: TEAM_A, captain_id: 'cap', name: 'Alpha' }] as any;
    const res = makeRes();
    await messagesHandler(
      makeAuthedReq({
        method: 'POST',
        body: { targetTeamId: TEAM_A, content: 'hi' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when target team not found', async () => {
    setAuthUser({ id: 'cap', email: 'cap@x.com', user_metadata: {} });
    store.team_members = [
      { id: 'tm1', user_id: 'cap', team_id: TEAM_A },
    ] as any;
    store.teams = [{ id: TEAM_A, captain_id: 'cap', name: 'Alpha' }] as any;
    const res = makeRes();
    await messagesHandler(
      makeAuthedReq({
        method: 'POST',
        body: { targetTeamId: TEAM_B, content: 'hi' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 201 sends a message', async () => {
    setAuthUser({
      id: 'cap',
      email: 'cap@x.com',
      user_metadata: { display_name: 'Alice' },
    });
    store.team_members = [
      { id: 'tm1', user_id: 'cap', team_id: TEAM_A },
    ] as any;
    store.teams = [
      { id: TEAM_A, captain_id: 'cap', name: 'Alpha' },
      { id: TEAM_B, captain_id: 'capB', name: 'Beta', is_active: true },
    ] as any;
    const res = makeRes();
    await messagesHandler(
      makeAuthedReq({
        method: 'POST',
        body: { targetTeamId: TEAM_B, content: 'hi there' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).conversationId).toBe(`${TEAM_A}_${TEAM_B}`);
    expect(store.demandes as any[]).toHaveLength(1);
  });

  it('405 on PUT', async () => {
    setAuthUser({ id: 'cap', email: 'cap@x.com', user_metadata: {} });
    store.team_members = [
      { id: 'tm1', user_id: 'cap', team_id: TEAM_A },
    ] as any;
    store.teams = [{ id: TEAM_A, captain_id: 'cap', name: 'Alpha' }] as any;
    const res = makeRes();
    await messagesHandler(makeAuthedReq({ method: 'PUT' }), res);
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/player/messages/[conversationId]
 * ---------------------------------------------------------*/

describe('/api/player/messages/[conversationId]', () => {
  it('400 when conversationId malformed', async () => {
    setAuthUser({ id: 'cap', email: 'c@x.com', user_metadata: {} });
    const res = makeRes();
    await conversationHandler(
      makeAuthedReq({ method: 'GET', query: { conversationId: 'badid' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('403 when captain not part of conversation', async () => {
    setAuthUser({ id: 'cap', email: 'c@x.com', user_metadata: {} });
    store.team_members = [
      { id: 'tm1', user_id: 'cap', team_id: 'team-other' },
    ] as any;
    store.teams = [
      { id: 'team-other', captain_id: 'cap', name: 'Other' },
    ] as any;
    const res = makeRes();
    await conversationHandler(
      makeAuthedReq({
        method: 'GET',
        query: { conversationId: `${TEAM_A}_${TEAM_B}` },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('GET returns conversation messages', async () => {
    setAuthUser({ id: 'cap', email: 'c@x.com', user_metadata: {} });
    store.team_members = [
      { id: 'tm1', user_id: 'cap', team_id: TEAM_A },
    ] as any;
    store.teams = [
      { id: TEAM_A, captain_id: 'cap', name: 'Alpha' },
      { id: TEAM_B, name: 'Beta', short_name: 'B', logo_url: null },
    ] as any;
    store.demandes = [
      {
        id: 'm1',
        type: 'captain_message',
        user_id: 'cap',
        team_id: TEAM_B,
        comment: 'hi',
        status: 'approved',
        created_at: '2026-04-01',
        payload: {
          from_team_id: TEAM_A,
          from_team_name: 'Alpha',
          sender_display_name: 'Alice',
        },
      },
    ] as any;
    const res = makeRes();
    await conversationHandler(
      makeAuthedReq({
        method: 'GET',
        query: { conversationId: `${TEAM_A}_${TEAM_B}` },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.myTeamId).toBe(TEAM_A);
    expect(body.otherTeam.id).toBe(TEAM_B);
    expect(body.messages.length).toBeGreaterThanOrEqual(1);
  });

  it('PATCH marks incoming as read', async () => {
    setAuthUser({ id: 'cap', email: 'c@x.com', user_metadata: {} });
    store.team_members = [
      { id: 'tm1', user_id: 'cap', team_id: TEAM_A },
    ] as any;
    store.teams = [{ id: TEAM_A, captain_id: 'cap', name: 'Alpha' }] as any;
    store.demandes = [
      {
        id: 'm1',
        type: 'captain_message',
        user_id: 'other',
        team_id: TEAM_A,
        status: 'pending',
        payload: { from_team_id: TEAM_B },
      },
    ] as any;
    const res = makeRes();
    await conversationHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { conversationId: `${TEAM_A}_${TEAM_B}` },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).success).toBe(true);
    expect((store.demandes as any[])[0].status).toBe('approved');
  });

  it('403 when user is not captain or manager of any team', async () => {
    setAuthUser({ id: 'lone-user', email: 'l@x.com', user_metadata: {} });
    store.team_members = [];
    const res = makeRes();
    await conversationHandler(
      makeAuthedReq({
        method: 'GET',
        query: { conversationId: `${TEAM_A}_${TEAM_B}` },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('403 when user is not the captain', async () => {
    setAuthUser({ id: 'member-only', email: 'm@x.com', user_metadata: {} });
    store.team_members = [
      { id: 'tm1', user_id: 'member-only', team_id: TEAM_A },
    ] as any;
    store.teams = [
      { id: TEAM_A, captain_id: 'someone-else', name: 'Alpha' },
    ] as any;
    const res = makeRes();
    await conversationHandler(
      makeAuthedReq({
        method: 'GET',
        query: { conversationId: `${TEAM_A}_${TEAM_B}` },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('PATCH 403 when captain not in conversation', async () => {
    setAuthUser({ id: 'cap-other', email: 'c@x.com', user_metadata: {} });
    store.team_members = [
      { id: 'tm1', user_id: 'cap-other', team_id: 'team-z' },
    ] as any;
    store.teams = [{ id: 'team-z', captain_id: 'cap-other', name: 'Z' }] as any;
    const res = makeRes();
    await conversationHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { conversationId: `${TEAM_A}_${TEAM_B}` },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('405 on POST', async () => {
    setAuthUser({ id: 'cap', email: 'c@x.com', user_metadata: {} });
    store.team_members = [
      { id: 'tm1', user_id: 'cap', team_id: TEAM_A },
    ] as any;
    store.teams = [{ id: TEAM_A, captain_id: 'cap', name: 'Alpha' }] as any;
    const res = makeRes();
    await conversationHandler(
      makeAuthedReq({
        method: 'POST',
        query: { conversationId: `${TEAM_A}_${TEAM_B}` },
      }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/teams/transfer-requests
 * ---------------------------------------------------------*/

describe('/api/teams/transfer-requests', () => {
  it('403 when user is not captain of any active team', async () => {
    setAuthUser({ id: 'u1', email: 'u@x.com', user_metadata: {} });
    const res = makeRes();
    await transferRequestsHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('GET returns pending demandes by default', async () => {
    setAuthUser({ id: 'cap', email: 'c@x.com', user_metadata: {} });
    store.teams = [
      { id: TEAM_A, captain_id: 'cap', name: 'Alpha', is_active: true },
    ] as any;
    store.demandes = [
      {
        id: 'd1',
        team_id: TEAM_A,
        type: 'transfer',
        status: 'pending',
        user_id: 'newp',
        created_at: '2026-04-01',
        payload: { from_team_id: TEAM_B, desired_role: 'player' },
      },
      {
        id: 'd2',
        team_id: TEAM_A,
        type: 'transfer',
        status: 'rejected',
        user_id: 'other',
        created_at: '2026-04-02',
        payload: {},
      },
    ] as any;
    setAdminUser('newp', 'newp@x.com');
    const res = makeRes();
    await transferRequestsHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const list = (res.body as any).demandes;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('d1');
    expect(list[0].user.email).toBe('newp@x.com');
  });

  it('GET supports status filter', async () => {
    setAuthUser({ id: 'cap', email: 'c@x.com', user_metadata: {} });
    store.teams = [
      { id: TEAM_A, captain_id: 'cap', name: 'Alpha', is_active: true },
    ] as any;
    store.demandes = [
      {
        id: 'd1',
        team_id: TEAM_A,
        type: 'transfer',
        status: 'rejected',
        user_id: 'u',
        payload: {},
      },
    ] as any;
    const res = makeRes();
    await transferRequestsHandler(
      makeAuthedReq({ method: 'GET', query: { status: 'rejected' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).demandes).toHaveLength(1);
  });

  it('POST 400 on invalid demandeId', async () => {
    setAuthUser({ id: 'cap', email: 'c@x.com', user_metadata: {} });
    store.teams = [
      { id: TEAM_A, captain_id: 'cap', name: 'Alpha', is_active: true },
    ] as any;
    const res = makeRes();
    await transferRequestsHandler(
      makeAuthedReq({
        method: 'POST',
        body: { demandeId: 'not-uuid', action: 'approve' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 on invalid action', async () => {
    setAuthUser({ id: 'cap', email: 'c@x.com', user_metadata: {} });
    store.teams = [
      { id: TEAM_A, captain_id: 'cap', name: 'Alpha', is_active: true },
    ] as any;
    const res = makeRes();
    await transferRequestsHandler(
      makeAuthedReq({
        method: 'POST',
        body: {
          demandeId: '11111111-1111-1111-1111-111111111111',
          action: 'whatever',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 404 when demande missing', async () => {
    setAuthUser({ id: 'cap', email: 'c@x.com', user_metadata: {} });
    store.teams = [
      { id: TEAM_A, captain_id: 'cap', name: 'Alpha', is_active: true },
    ] as any;
    const res = makeRes();
    await transferRequestsHandler(
      makeAuthedReq({
        method: 'POST',
        body: {
          demandeId: '11111111-1111-1111-1111-111111111111',
          action: 'approve',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  // La mutation roster (retrait ancienne team + insert cible + statut) est
  // désormais atomique dans la RPC approve_transfer_request. Le route délègue ;
  // on assert donc l'appel RPC + l'effet de bord news, pas la mutation elle-même
  // (couverte côté DB par la migration).
  it('POST approve delegates to approve_transfer_request RPC + creates news', async () => {
    setAuthUser({ id: 'cap', email: 'c@x.com', user_metadata: {} });
    store.teams = [
      {
        id: TEAM_A,
        captain_id: 'cap',
        name: 'Alpha',
        is_active: true,
        logo_url: null,
      },
    ] as any;
    const demandeId = '11111111-1111-1111-1111-111111111111';
    store.demandes = [
      {
        id: demandeId,
        team_id: TEAM_A,
        type: 'transfer',
        status: 'pending',
        user_id: 'movee',
        payload: {
          from_team_id: TEAM_B,
          from_team_name: 'Beta',
          user_battle_tag: 'Pro#1234',
          desired_role: 'player',
        },
      },
    ] as any;
    store.team_members = [];
    store.tournament_teams = [];
    setRpcResult('approve_transfer_request', {
      data: { id: 'tm-new', team_id: TEAM_A, user_id: 'movee' },
      error: null,
    });
    const res = makeRes();
    await transferRequestsHandler(
      makeAuthedReq({
        method: 'POST',
        body: { demandeId, action: 'approve' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const call = rpcCalls.find((c) => c.fn === 'approve_transfer_request');
    expect(call).toBeTruthy();
    expect(call!.params).toEqual({ p_demande_id: demandeId });
    // News inserted (effet de bord après succès de la RPC).
    expect((store.news as any[]).length).toBeGreaterThan(0);
  });

  it('POST reject only updates status', async () => {
    setAuthUser({ id: 'cap', email: 'c@x.com', user_metadata: {} });
    store.teams = [
      { id: TEAM_A, captain_id: 'cap', name: 'Alpha', is_active: true },
    ] as any;
    const demandeId = '11111111-1111-1111-1111-111111111111';
    store.demandes = [
      {
        id: demandeId,
        team_id: TEAM_A,
        type: 'transfer',
        status: 'pending',
        user_id: 'movee',
        payload: { from_team_id: TEAM_B },
      },
    ] as any;
    const res = makeRes();
    await transferRequestsHandler(
      makeAuthedReq({
        method: 'POST',
        body: { demandeId, action: 'reject' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.demandes as any[])[0].status).toBe('rejected');
  });

  it('405 on PATCH', async () => {
    setAuthUser({ id: 'cap', email: 'c@x.com', user_metadata: {} });
    store.teams = [
      { id: TEAM_A, captain_id: 'cap', name: 'Alpha', is_active: true },
    ] as any;
    const res = makeRes();
    await transferRequestsHandler(makeAuthedReq({ method: 'PATCH' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('POST 400 with invalid action value', async () => {
    setAuthUser({ id: 'cap', email: 'c@x.com', user_metadata: {} });
    store.teams = [
      { id: TEAM_A, captain_id: 'cap', name: 'Alpha', is_active: true },
    ] as any;
    const validUuid = '660e8400-e29b-41d4-a716-446655440000';
    const res = makeRes();
    await transferRequestsHandler(
      makeAuthedReq({
        method: 'POST',
        body: { demandeId: validUuid, action: 'reset' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  // Battle-tag resolution + is_substitute are now handled INSIDE the RPC (which
  // resolves the player's real membership); the route no longer uses
  // payload.from_team_id to mutate. We assert the route delegates cleanly on a
  // payload that omits the battle_tag (previously it would look it up itself).
  it('POST approve delegates even when payload omits battle_tag (RPC resolves it)', async () => {
    setAuthUser({ id: 'cap', email: 'c@x.com', user_metadata: {} });
    const validUuid = '660e8400-e29b-41d4-a716-446655440001';
    store.teams = [
      { id: TEAM_A, captain_id: 'cap', name: 'Alpha', is_active: true },
      { id: 'team-old', name: 'OldTeam', is_active: true },
    ] as any;
    store.demandes = [
      {
        id: validUuid,
        type: 'transfer',
        status: 'pending',
        team_id: TEAM_A,
        user_id: 'user-x',
        comment: '',
        payload: {
          from_team_id: 'team-old',
          desired_role: 'player',
        },
      },
    ] as any;
    store.team_members = [
      {
        id: 'tm-old',
        team_id: 'team-old',
        user_id: 'user-x',
        battle_tag: 'OldTag#1234',
        role: 'player',
      },
    ] as any;
    store.tournament_teams = [];
    setRpcResult('approve_transfer_request', {
      data: { id: 'tm-new', team_id: TEAM_A, user_id: 'user-x' },
      error: null,
    });
    const res = makeRes();
    await transferRequestsHandler(
      makeAuthedReq({
        method: 'POST',
        body: { demandeId: validUuid, action: 'approve' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(
      rpcCalls.find((c) => c.fn === 'approve_transfer_request')!.params
    ).toEqual({ p_demande_id: validUuid });
  });

  it('POST approve for a substitute delegates to the RPC (is_substitute set DB-side)', async () => {
    setAuthUser({ id: 'cap', email: 'c@x.com', user_metadata: {} });
    const validUuid = '660e8400-e29b-41d4-a716-446655440002';
    store.teams = [
      { id: TEAM_A, captain_id: 'cap', name: 'Alpha', is_active: true },
    ] as any;
    store.demandes = [
      {
        id: validUuid,
        type: 'transfer',
        status: 'pending',
        team_id: TEAM_A,
        user_id: 'user-y',
        comment: '',
        payload: {
          desired_role: 'substitute',
          user_battle_tag: 'Sub#5678',
        },
      },
    ] as any;
    store.team_members = [];
    store.tournament_teams = [];
    setRpcResult('approve_transfer_request', {
      data: { id: 'tm-sub', team_id: TEAM_A, user_id: 'user-y', is_substitute: true },
      error: null,
    });
    const res = makeRes();
    await transferRequestsHandler(
      makeAuthedReq({
        method: 'POST',
        body: { demandeId: validUuid, action: 'approve' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(rpcCalls.find((c) => c.fn === 'approve_transfer_request')).toBeTruthy();
  });
});

/* -----------------------------------------------------------
 * /api/team/[id]/maps
 * ---------------------------------------------------------*/

describe('/api/team/[id]/maps', () => {
  it('400 on invalid id', async () => {
    const res = makeRes();
    await teamMapsHandler(makeReq({ query: { id: 'bad' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('405 on POST', async () => {
    const res = makeRes();
    await teamMapsHandler(
      makeReq({ method: 'POST', query: { id: TEAM_A } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('404 when team not found', async () => {
    const res = makeRes();
    await teamMapsHandler(makeReq({ query: { id: TEAM_A } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('200 with no matches returns empty stats', async () => {
    store.teams = [
      {
        id: TEAM_A,
        name: 'Alpha',
        short_name: null,
        logo_url: null,
        country: null,
      },
    ] as any;
    const res = makeRes();
    await teamMapsHandler(makeReq({ query: { id: TEAM_A } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.totalMatches).toBe(0);
    expect(body.totalGames).toBe(0);
    expect(body.mapStats).toEqual([]);
  });

  it('200 aggregates map stats from games', async () => {
    store.teams = [
      {
        id: TEAM_A,
        name: 'Alpha',
        short_name: null,
        logo_url: null,
        country: null,
      },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        status: 'finished',
        is_bye: false,
        team1_id: TEAM_A,
        team2_id: TEAM_B,
      },
      // BYE match should be filtered out
      {
        id: 'm2',
        status: 'finished',
        is_bye: true,
        team1_id: TEAM_A,
        team2_id: null,
      },
    ] as any;
    store.games = [
      {
        match_id: 'm1',
        map_name: 'Ilios',
        team1_score: 3,
        team2_score: 1,
        is_tiebreaker: false,
        went_overtime: true,
      },
      {
        match_id: 'm1',
        map_name: 'Ilios',
        team1_score: 1,
        team2_score: 3,
        is_tiebreaker: false,
        went_overtime: false,
      },
      {
        match_id: 'm1',
        map_name: 'Ilios',
        team1_score: 0,
        team2_score: 0,
        is_tiebreaker: true,
        went_overtime: false,
      },
      // Game without map_name should be skipped
      {
        match_id: 'm1',
        map_name: null,
        team1_score: 0,
        team2_score: 0,
      },
    ] as any;
    const res = makeRes();
    await teamMapsHandler(makeReq({ query: { id: TEAM_A } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.totalMatches).toBe(1);
    expect(body.mapStats[0].mapName).toBe('Ilios');
    expect(body.mapStats[0].gamesPlayed).toBe(3);
    expect(body.mapStats[0].wins).toBe(1);
    expect(body.mapStats[0].losses).toBe(1);
    expect(body.mapStats[0].overtimes).toBe(1);
    expect(body.mapStats[0].tiebreakers).toBe(1);
    expect(res.headers['Cache-Control']).toContain('public');
  });
});

/* -----------------------------------------------------------
 * /api/team/[id]/stats
 * ---------------------------------------------------------*/

describe('/api/team/[id]/stats', () => {
  it('400 on invalid id', async () => {
    const res = makeRes();
    await teamStatsHandler(makeReq({ query: { id: 'bad' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('405 on POST', async () => {
    const res = makeRes();
    await teamStatsHandler(
      makeReq({ method: 'POST', query: { id: TEAM_A } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('404 when team not found', async () => {
    const res = makeRes();
    await teamStatsHandler(makeReq({ query: { id: TEAM_A } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('200 with stats from view + map aggregation including duration', async () => {
    store.teams = [
      {
        id: TEAM_A,
        name: 'Alpha',
        short_name: 'A',
        logo_url: null,
        country: 'FR',
      },
    ] as any;
    // team_stats_view expose une ligne par tournoi avec les colonnes
    // `matches_played` / `maps_won` / `maps_lost` ; le handler agrège et
    // recalcule le winrate (3 / 4 = 0.75).
    store.team_stats_view = [
      {
        team_id: TEAM_A,
        team_name: 'Alpha',
        tournament_id: 't1',
        matches_played: 4,
        wins: 3,
        losses: 1,
        draws: 0,
        maps_won: 9,
        maps_lost: 5,
      },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        status: 'finished',
        is_bye: false,
        team1_id: TEAM_A,
        team2_id: TEAM_B,
        winner_team_id: TEAM_A,
      },
    ] as any;
    store.games = [
      {
        match_id: 'm1',
        map_name: 'Ilios',
        team1_score: 3,
        team2_score: 1,
        winner_team_id: TEAM_A,
        duration_minutes: 12,
        is_tiebreaker: false,
        went_overtime: true,
      },
      {
        match_id: 'm1',
        map_name: 'Ilios',
        team1_score: 1,
        team2_score: 3,
        winner_team_id: null, // fallback to score
        duration_minutes: null,
        is_tiebreaker: false,
        went_overtime: false,
      },
      {
        match_id: 'm1',
        map_name: 'Hanamura',
        team1_score: 2,
        team2_score: 0,
        winner_team_id: TEAM_A,
        duration_minutes: 8,
        is_tiebreaker: false,
        went_overtime: false,
      },
    ] as any;
    const res = makeRes();
    await teamStatsHandler(makeReq({ query: { id: TEAM_A } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.stats?.winrate).toBe(0.75);
    expect(body.matchesPlayed).toBe(1);
    const ilios = body.mapStats.find((m: any) => m.mapName === 'Ilios');
    expect(ilios?.gamesPlayed).toBe(2);
    expect(ilios?.wins).toBe(1); // first game (winner_team_id) + score-fallback loss
    expect(ilios?.losses).toBe(1);
    expect(ilios?.overtimes).toBe(1);
    expect(ilios?.avgDuration).toBe(12);
    const hanamura = body.mapStats.find((m: any) => m.mapName === 'Hanamura');
    expect(hanamura?.avgDuration).toBe(8);
  });
});
