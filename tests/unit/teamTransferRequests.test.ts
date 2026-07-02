// Unit tests for pages/api/teams/transfer-requests.ts (approve path).
//
// The captain approves a transfer demande. Approval is now delegated to the
// transactional RPC `approve_transfer_request` (which resolves the player's
// REAL membership, removes it, inserts into the target, and enforces
// max_players via a trigger). This route keeps authz + roster-lock + news; the
// mutation is atomic in the RPC.
//
// Coverage:
//   - approve success → RPC called with p_demande_id, news created
//   - roster-lock → 409, RPC not called
//   - RPC 23505 → 409, 23514 → 400, demande_not_pending → 409
//   - reject → status set to rejected, no RPC

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setRpcResult,
  rpcCalls,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';

import transferRequestsHandler from '../../pages/api/teams/transfer-requests';

let _tokenCounter = 0;
function freshBearer() {
  _tokenCounter += 1;
  return `Bearer t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: freshBearer() },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const TENANT = CONFERENCE_TENANT_ID;
const TEAM = 'team-target';
const CAPTAIN = 'captain-1';
const DEMANDE = '550e8400-e29b-41d4-a716-446655449999';

function seedBase() {
  store.teams = [
    { id: TEAM, tenant_id: TENANT, captain_id: CAPTAIN, is_active: true, name: 'Target', logo_url: null },
  ] as any;
  store.demandes = [
    {
      id: DEMANDE,
      team_id: TEAM,
      tenant_id: TENANT,
      type: 'transfer',
      status: 'pending',
      user_id: 'player-x',
      payload: {
        desired_role: 'player',
        user_battle_tag: 'PlayerX#1234',
        from_team_id: 'old-team',
        from_team_name: 'Old',
      },
    },
  ] as any;
  store.tournament_teams = [];
  store.tournaments = [];
  store.news = [];
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: CAPTAIN });
  seedBase();
});

describe('POST /api/teams/transfer-requests (approve)', () => {
  it('approve → calls approve_transfer_request RPC and creates news', async () => {
    setRpcResult('approve_transfer_request', {
      data: { id: 'tm-x', team_id: TEAM, user_id: 'player-x' },
      error: null,
    });
    const res = makeRes();
    await transferRequestsHandler(
      makeReq({ body: { demandeId: DEMANDE, action: 'approve' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const call = rpcCalls.find((c) => c.fn === 'approve_transfer_request');
    expect(call).toBeTruthy();
    expect(call!.params).toEqual({ p_demande_id: DEMANDE });
    expect((store.news as any[]).length).toBe(1);
  });

  it('roster locked → 409, RPC not called', async () => {
    store.tournament_teams = [
      { tenant_id: TENANT, team_id: TEAM, tournament_id: 'tour-1' },
    ] as any;
    const past = new Date(Date.now() - 60_000).toISOString();
    store.tournaments = [
      { id: 'tour-1', tenant_id: TENANT, name: 'Cup', roster_locked_at: past, status: 'in_progress' },
    ] as any;
    const res = makeRes();
    await transferRequestsHandler(
      makeReq({ body: { demandeId: DEMANDE, action: 'approve' } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(rpcCalls.find((c) => c.fn === 'approve_transfer_request')).toBeFalsy();
  });

  it('RPC 23505 → 409', async () => {
    setRpcResult('approve_transfer_request', {
      data: null,
      error: { code: '23505', message: 'duplicate' },
    });
    const res = makeRes();
    await transferRequestsHandler(
      makeReq({ body: { demandeId: DEMANDE, action: 'approve' } }),
      res
    );
    expect(res.statusCode).toBe(409);
  });

  it('RPC 23514 → 400', async () => {
    setRpcResult('approve_transfer_request', {
      data: null,
      error: { code: '23514', message: 'max_players' },
    });
    const res = makeRes();
    await transferRequestsHandler(
      makeReq({ body: { demandeId: DEMANDE, action: 'approve' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('RPC demande_not_pending → 409', async () => {
    setRpcResult('approve_transfer_request', {
      data: null,
      error: { message: 'demande_not_pending' },
    });
    const res = makeRes();
    await transferRequestsHandler(
      makeReq({ body: { demandeId: DEMANDE, action: 'approve' } }),
      res
    );
    expect(res.statusCode).toBe(409);
  });

  it('reject → status rejected, no RPC', async () => {
    const res = makeRes();
    await transferRequestsHandler(
      makeReq({ body: { demandeId: DEMANDE, action: 'reject' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const dem = (store.demandes as any[]).find((d) => d.id === DEMANDE);
    expect(dem.status).toBe('rejected');
    expect(rpcCalls.find((c) => c.fn === 'approve_transfer_request')).toBeFalsy();
  });
});
