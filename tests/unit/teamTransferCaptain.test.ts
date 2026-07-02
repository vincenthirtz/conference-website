// Unit tests for pages/api/teams/transfer-captain.ts
//
// PATCH endpoint: the team captain hands over the captaincy to another member.
// captain-only (`teams.captain_id == userId`), tenant-scoped, logs a staff
// action, and — the behaviour added here — emits `team.captain.changed` so
// Discord role-sync + web-push fire on a player-initiated handover.
//
// The handler does its own `teams` UPDATE (it does NOT call setTeamCaptain), so
// it must emit the events itself. We mirror setTeamCaptain's exact shape: two
// `team.captain.changed` role-sync events, one for the previous captain
// (`role: 'previous'`) and one for the new captain (`role: 'new'`).
//
// Coverage:
//   - success: captain → member, captain_id updated + both role-sync emits
//   - 403 when caller is not the captain of any team
//   - 400 invalid / missing UUID
//   - 400 transferring to self
//   - 400 target is not a member of the team

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
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

  it('transfers captaincy to a member and emits team.captain.changed for both users', async () => {
    authAs(CAPTAIN_ID);
    const req = makeAuthedReq({ body: { newCaptainUserId: MEMBER_ID } });
    const res = makeRes();

    await transferCaptainHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      newCaptainUserId: MEMBER_ID,
    });

    // captain_id persisted on the team row.
    expect(store.teams[0].captain_id).toBe(MEMBER_ID);

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

  it('returns 400 when the target is not a member of the team', async () => {
    authAs(CAPTAIN_ID);
    const req = makeAuthedReq({ body: { newCaptainUserId: STRANGER_ID } });
    const res = makeRes();

    await transferCaptainHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("n'est pas un membre valide"),
    });
    expect(store.teams[0].captain_id).toBe(CAPTAIN_ID);
    expect(emitRoleSyncEvent).not.toHaveBeenCalled();
  });

  it('returns 400 when the target is a coach (coaches excluded from captaincy)', async () => {
    authAs(CAPTAIN_ID);
    // Le membre cible existe mais avec le rôle coach → capitanat interdit.
    store.team_members = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        team_id: TEAM_ID,
        user_id: CAPTAIN_ID,
        role: 'player',
        tenant_id: CONFERENCE_TENANT_ID,
      },
      {
        id: '44444444-4444-4444-4444-444444444444',
        team_id: TEAM_ID,
        user_id: MEMBER_ID,
        role: 'coach',
        tenant_id: CONFERENCE_TENANT_ID,
      },
    ];
    const req = makeAuthedReq({ body: { newCaptainUserId: MEMBER_ID } });
    const res = makeRes();

    await transferCaptainHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      error: expect.stringContaining('coach'),
    });
    expect(store.teams[0].captain_id).toBe(CAPTAIN_ID);
    expect(emitRoleSyncEvent).not.toHaveBeenCalled();
  });
});
