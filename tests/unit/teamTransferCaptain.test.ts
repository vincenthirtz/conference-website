// Unit tests for pages/api/teams/transfer-captain.ts
//
// PATCH endpoint: the team captain hands over the captaincy to another member.
// captain-only (`teams.captain_id == userId`), tenant-scoped, logs a staff
// action, and — the behaviour added here — emits `team.captain.changed` so
// Discord role-sync + web-push fire on a player-initiated handover.
//
// The atomic mutation is delegated to the transactional RPC `transfer_captain`
// (FOR UPDATE teams + EXISTS(non-coach member) + UPDATE captain_id). Business
// errors (team_not_found, not_captain, same_user, target_not_member) are raised
// as PL/pgSQL exceptions and mapped to HTTP via mapTeamRpcError. On success the
// handler still emits the role-sync events itself (the RPC doesn't), mirroring
// setTeamCaptain's exact shape: two `team.captain.changed` events, one for the
// previous captain (`role: 'previous'`) and one for the new (`role: 'new'`).
//
// Coverage:
//   - success: RPC called with the right params + both role-sync emits
//   - 403 when caller is not the captain of any team (pre-check, before RPC)
//   - 400 invalid / missing UUID
//   - 400 transferring to self (pre-check, before RPC)
//   - RPC exception mapping: team_not_found 404, not_captain 403,
//     same_user 400, target_not_member 400 (incl. coach)

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setRpcResult,
  rpcCalls,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';

// rosterLock is consulted before the update; keep it unlocked for these tests.
vi.mock('@/utils/teams/rosterLock', () => ({
  isTeamRosterLocked: vi.fn(async () => ({ locked: false })),
  rosterLockErrorMessage: () => 'Roster locked',
}));

// Audit logging is asserted elsewhere; stub it out here.
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: vi.fn(async () => undefined),
}));

// The handler emits via emitRoleSyncEvent (utils/botRoleSync), which internally
// calls emitBotEvent. We assert on the role-sync emitter — that is the canonical
// call site whose payload shape the bot consumes identically.
const emitRoleSyncEvent = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock('@/utils/botRoleSync', () => ({
  emitRoleSyncEvent: (...args: unknown[]) => emitRoleSyncEvent(...args),
}));

import transferCaptainHandler from '../../pages/api/teams/transfer-captain';

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeAuthedReq(over: Partial<any> = {}): any {
  return {
    method: 'PATCH',
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
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAPTAIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STRANGER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function seed() {
  store.teams = [
    {
      id: TEAM_ID,
      captain_id: CAPTAIN_ID,
      tenant_id: CONFERENCE_TENANT_ID,
    },
  ];
  store.team_members = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      team_id: TEAM_ID,
      user_id: CAPTAIN_ID,
      role: 'player',
      tenant_id: CONFERENCE_TENANT_ID,
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      team_id: TEAM_ID,
      user_id: MEMBER_ID,
      role: 'player',
      tenant_id: CONFERENCE_TENANT_ID,
    },
  ];
  store.staff = [];
}

/** Authenticate as `userId` for the next handler call (fresh token each time). */
function authAs(userId: string) {
  setAuthUser({ id: userId });
}

describe('PATCH /api/teams/transfer-captain', () => {
  beforeEach(() => {
    resetSupabaseMock();
    emitRoleSyncEvent.mockClear();
    seed();
  });

  it('calls transfer_captain RPC with the right params and emits team.captain.changed for both users', async () => {
    authAs(CAPTAIN_ID);
    const req = makeAuthedReq({ body: { newCaptainUserId: MEMBER_ID } });
    const res = makeRes();

    await transferCaptainHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      newCaptainUserId: MEMBER_ID,
    });

    // The atomic mutation is delegated to the transfer_captain RPC.
    const rpc = rpcCalls.find((c) => c.fn === 'transfer_captain');
    expect(rpc).toBeDefined();
    expect(rpc!.params).toEqual({
      p_team_id: TEAM_ID,
      p_new_captain: MEMBER_ID,
      p_tenant: CONFERENCE_TENANT_ID,
      p_actor: CAPTAIN_ID,
    });

    // Two role-sync emits mirroring setTeamCaptain's shape.
    expect(emitRoleSyncEvent).toHaveBeenCalledTimes(2);
    expect(emitRoleSyncEvent).toHaveBeenCalledWith(
      'team.captain.changed',
      CAPTAIN_ID,
      CONFERENCE_TENANT_ID,
      { extras: { teamId: TEAM_ID, role: 'previous' } }
    );
    expect(emitRoleSyncEvent).toHaveBeenCalledWith(
      'team.captain.changed',
      MEMBER_ID,
      CONFERENCE_TENANT_ID,
      { extras: { teamId: TEAM_ID, role: 'new' } }
    );
  });

  it('returns 403 when the caller is not a captain of any team', async () => {
    authAs(STRANGER_ID);
    const req = makeAuthedReq({ body: { newCaptainUserId: MEMBER_ID } });
    const res = makeRes();

    await transferCaptainHandler(req, res);

    expect(res.statusCode).toBe(403);
    expect(store.teams[0].captain_id).toBe(CAPTAIN_ID);
    expect(emitRoleSyncEvent).not.toHaveBeenCalled();
  });

  it('returns 400 on a missing / invalid UUID', async () => {
    authAs(CAPTAIN_ID);

    const resMissing = makeRes();
    await transferCaptainHandler(makeAuthedReq({ body: {} }), resMissing);
    expect(resMissing.statusCode).toBe(400);

    const resInvalid = makeRes();
    await transferCaptainHandler(
      makeAuthedReq({ body: { newCaptainUserId: 'not-a-uuid' } }),
      resInvalid
    );
    expect(resInvalid.statusCode).toBe(400);

    expect(store.teams[0].captain_id).toBe(CAPTAIN_ID);
    expect(emitRoleSyncEvent).not.toHaveBeenCalled();
  });

  it('returns 400 when transferring captaincy to self', async () => {
    authAs(CAPTAIN_ID);
    const req = makeAuthedReq({ body: { newCaptainUserId: CAPTAIN_ID } });
    const res = makeRes();

    await transferCaptainHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(store.teams[0].captain_id).toBe(CAPTAIN_ID);
    expect(emitRoleSyncEvent).not.toHaveBeenCalled();
  });

  it('maps target_not_member RPC exception → 400 (target not a member)', async () => {
    authAs(CAPTAIN_ID);
    // The RPC raises `target_not_member` when the target isn't a non-coach
    // member of the team. Seed the exception on the mock.
    setRpcResult('transfer_captain', {
      data: null,
      error: { message: 'target_not_member' },
    });
    const req = makeAuthedReq({ body: { newCaptainUserId: STRANGER_ID } });
    const res = makeRes();

    await transferCaptainHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("n'est pas un membre valide"),
    });
    expect(emitRoleSyncEvent).not.toHaveBeenCalled();
  });

  it('maps target_not_member RPC exception → 400 when the target is a coach', async () => {
    authAs(CAPTAIN_ID);
    // A coach target is excluded by the RPC's EXISTS(non-coach member) guard,
    // which raises the same `target_not_member` sentinel.
    setRpcResult('transfer_captain', {
      data: null,
      error: { message: 'target_not_member' },
    });
    const req = makeAuthedReq({ body: { newCaptainUserId: MEMBER_ID } });
    const res = makeRes();

    await transferCaptainHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("n'est pas un membre valide"),
    });
    expect(emitRoleSyncEvent).not.toHaveBeenCalled();
  });

  it('maps team_not_found RPC exception (P0002) → 404', async () => {
    authAs(CAPTAIN_ID);
    setRpcResult('transfer_captain', {
      data: null,
      error: { code: 'P0002', message: 'query returned no rows' },
    });
    const req = makeAuthedReq({ body: { newCaptainUserId: MEMBER_ID } });
    const res = makeRes();

    await transferCaptainHandler(req, res);

    expect(res.statusCode).toBe(404);
    expect(emitRoleSyncEvent).not.toHaveBeenCalled();
  });

  it('maps not_captain RPC exception → 403', async () => {
    authAs(CAPTAIN_ID);
    setRpcResult('transfer_captain', {
      data: null,
      error: { message: 'not_captain' },
    });
    const req = makeAuthedReq({ body: { newCaptainUserId: MEMBER_ID } });
    const res = makeRes();

    await transferCaptainHandler(req, res);

    expect(res.statusCode).toBe(403);
    expect(emitRoleSyncEvent).not.toHaveBeenCalled();
  });

  it('maps same_user RPC exception → 400', async () => {
    authAs(CAPTAIN_ID);
    // The self-transfer guard is also enforced by the RPC (defense in depth).
    setRpcResult('transfer_captain', {
      data: null,
      error: { message: 'same_user' },
    });
    // Use a distinct-but-valid target so the handler's own pre-check passes and
    // the request reaches the RPC.
    const req = makeAuthedReq({ body: { newCaptainUserId: MEMBER_ID } });
    const res = makeRes();

    await transferCaptainHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(emitRoleSyncEvent).not.toHaveBeenCalled();
  });
});

/* ---------------------------------------------------------------------------
 * Amorçage du capitanat par un MANAGER (équipe sans capitaine)
 *
 * Une équipe créée « en tant que manager » (POST /api/teams/create-with-member
 * avec `manager_email`) naît avec `captain_id = NULL` : la capitaine désignée
 * n'est qu'invitée. Le manager doit pouvoir amorcer le capitanat — mais JAMAIS
 * voler un capitanat existant (ça reste réservé à la capitaine en poste).
 * Le handler route alors vers la RPC `designate_captain`.
 * ------------------------------------------------------------------------- */

const MANAGER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

describe('PATCH /api/teams/transfer-captain — désignation par un manager', () => {
  beforeEach(() => {
    resetSupabaseMock();
    emitRoleSyncEvent.mockClear();
    store.staff = [];
    store.team_members = [
      {
        id: '44444444-4444-4444-4444-444444444444',
        team_id: TEAM_ID,
        user_id: MANAGER_ID,
        role: 'manager',
        tenant_id: CONFERENCE_TENANT_ID,
      },
      {
        id: '33333333-3333-3333-3333-333333333333',
        team_id: TEAM_ID,
        user_id: MEMBER_ID,
        role: 'player',
        tenant_id: CONFERENCE_TENANT_ID,
      },
    ];
  });

  it('appelle designate_captain quand l’équipe n’a pas de capitaine', async () => {
    store.teams = [
      { id: TEAM_ID, captain_id: null, tenant_id: CONFERENCE_TENANT_ID },
    ];
    authAs(MANAGER_ID);
    const res = makeRes();

    await transferCaptainHandler(
      makeAuthedReq({ body: { newCaptainUserId: MEMBER_ID } }),
      res
    );

    expect(res.statusCode).toBe(200);
    const rpc = rpcCalls.find((c) => c.fn === 'designate_captain');
    expect(rpc).toBeDefined();
    expect(rpc!.params).toEqual({
      p_team_id: TEAM_ID,
      p_new_captain: MEMBER_ID,
      p_tenant: CONFERENCE_TENANT_ID,
    });
    // Pas d'ancien capitaine → un seul event (la nouvelle).
    expect(emitRoleSyncEvent).toHaveBeenCalledTimes(1);
    expect(emitRoleSyncEvent).toHaveBeenCalledWith(
      'team.captain.changed',
      MEMBER_ID,
      CONFERENCE_TENANT_ID,
      { extras: { teamId: TEAM_ID, role: 'new' } }
    );
  });

  it('403 quand l’équipe a déjà une capitaine (pas de vol de capitanat)', async () => {
    store.teams = [
      { id: TEAM_ID, captain_id: CAPTAIN_ID, tenant_id: CONFERENCE_TENANT_ID },
    ];
    authAs(MANAGER_ID);
    const res = makeRes();

    await transferCaptainHandler(
      makeAuthedReq({ body: { newCaptainUserId: MEMBER_ID } }),
      res
    );

    expect(res.statusCode).toBe(403);
    expect(rpcCalls.find((c) => c.fn === 'designate_captain')).toBeUndefined();
    expect(store.teams[0].captain_id).toBe(CAPTAIN_ID);
    expect(emitRoleSyncEvent).not.toHaveBeenCalled();
  });

  it('mappe captain_already_set → 409 (course entre deux désignations)', async () => {
    store.teams = [
      { id: TEAM_ID, captain_id: null, tenant_id: CONFERENCE_TENANT_ID },
    ];
    setRpcResult('designate_captain', {
      data: null,
      error: { message: 'captain_already_set' },
    });
    authAs(MANAGER_ID);
    const res = makeRes();

    await transferCaptainHandler(
      makeAuthedReq({ body: { newCaptainUserId: MEMBER_ID } }),
      res
    );

    expect(res.statusCode).toBe(409);
    expect(emitRoleSyncEvent).not.toHaveBeenCalled();
  });
});
