// Unit tests for the new "manager" team role.
//
// A team_member with role='manager' has the same operational permissions as
// the captain (roster, scrim, messages, joinable, register-team, edit info)
// but cannot perform sensitive actions (transfer captaincy, demote captain).
//
// Targets:
//  - utils/teams/managementAccess.ts        (helper)
//  - pages/api/teams/add-member.ts          (manager can add)
//  - pages/api/teams/update-member-role.ts  (manager can change roles, but not promote to manager)
//  - pages/api/teams/toggle-joinable.ts     (manager can toggle)
//  - pages/api/teams/join-requests.ts       (manager can list)
//  - pages/api/teams/scrim-requests.ts      (manager can list)
//  - pages/api/demandes/scrim.ts            (manager can request)
//  - pages/api/demandes/register-team.ts    (manager can register)
//  - pages/api/admin/teams/my.ts            (manager can edit)
//  - pages/api/teams/transfer-captain.ts    (manager CANNOT transfer)

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  supabaseAdmin,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';
import { getManagedTeam } from '../../utils/teams/managementAccess';

import addMemberHandler from '../../pages/api/teams/add-member';
import updateRoleHandler from '../../pages/api/teams/update-member-role';
import toggleJoinableHandler from '../../pages/api/teams/toggle-joinable';
import joinRequestsHandler from '../../pages/api/teams/join-requests';
import scrimRequestsHandler from '../../pages/api/teams/scrim-requests';
import scrimDemandHandler from '../../pages/api/demandes/scrim';
import registerTeamHandler from '../../pages/api/demandes/register-team';
import myTeamHandler from '../../pages/api/admin/teams/my';
import transferCaptainHandler from '../../pages/api/teams/transfer-captain';

vi.mock('@/utils/discord', () => ({
  notifyScrimRequest: vi.fn(async () => undefined),
  notifyAnnouncement: vi.fn(async () => undefined),
}));
vi.mock('@/utils/email', () => ({
  sendTeamJoinEmail: vi.fn(async () => undefined),
  sendWelcomeEmail: vi.fn(async () => undefined),
}));
vi.mock('@/utils/find-or-create-user', () => ({
  findOrCreateUserByEmail: vi.fn(async () => ({
    userId: 'fake',
    created: false,
  })),
  listUsersEmailMap: vi.fn(async () => new Map()),
}));
vi.mock('@/utils/teams/rosterLock', () => ({
  isTeamRosterLocked: vi.fn(async () => ({ locked: false })),
  rosterLockErrorMessage: () => 'Roster locked',
}));

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
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
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAPTAIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MANAGER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PLAYER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const OTHER_TEAM_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const TM_CAP = '11111111-1111-1111-1111-111111111111';
const TM_MGR = '22222222-2222-2222-2222-222222222222';
const TM_PLY = '33333333-3333-3333-3333-333333333333';
const TM_MGR2 = '44444444-4444-4444-4444-444444444444';

function seedManagerTeam() {
  store.teams = [
    {
      id: TEAM_ID,
      name: 'Alpha',
      logo_url: null,
      captain_id: CAPTAIN_ID,
      is_active: true,
      is_joinable: false,
    },
    {
      id: OTHER_TEAM_ID,
      name: 'Bravo',
      captain_id: 'someone-else',
      is_active: true,
      is_joinable: true,
    },
  ] as any;
  store.team_members = [
    { id: TM_CAP, team_id: TEAM_ID, user_id: CAPTAIN_ID, role: 'player' },
    { id: TM_MGR, team_id: TEAM_ID, user_id: MANAGER_ID, role: 'manager' },
    { id: TM_PLY, team_id: TEAM_ID, user_id: PLAYER_ID, role: 'player' },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  // Most tests sign in as the manager.
  setAuthUser({ id: MANAGER_ID });
  seedManagerTeam();
});

/* -----------------------------------------------------------
 * Helper: getManagedTeam
 * ---------------------------------------------------------*/

describe('getManagedTeam helper', () => {
  it('returns isCaptain=true for the captain', async () => {
    const access = await getManagedTeam(CAPTAIN_ID);
    expect(access).toEqual({
      teamId: TEAM_ID,
      isCaptain: true,
      isManager: false,
    });
  });

  it('returns isManager=true for a member with role=manager', async () => {
    const access = await getManagedTeam(MANAGER_ID);
    expect(access).toEqual({
      teamId: TEAM_ID,
      isCaptain: false,
      isManager: true,
    });
  });

  it('returns null for a plain player (no role=manager)', async () => {
    const access = await getManagedTeam(PLAYER_ID);
    expect(access).toBeNull();
  });

  it('returns null for an unknown user', async () => {
    const access = await getManagedTeam('unknown-user');
    expect(access).toBeNull();
  });
});

/* -----------------------------------------------------------
 * /api/teams/add-member
 * ---------------------------------------------------------*/

describe('/api/teams/add-member as manager', () => {
  it('manager can add a player', async () => {
    const res = makeRes();
    await addMemberHandler(
      makeAuthedReq({
        method: 'POST',
        body: {
          userId: 'new-player',
          role: 'player',
          battleTag: 'NewPlayer#1234',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const inserted = (store.team_members as any[]).find(
      (m) => m.user_id === 'new-player'
    );
    expect(inserted).toBeTruthy();
    expect(inserted.team_id).toBe(TEAM_ID);
  });

  it('plain player cannot add', async () => {
    setAuthUser({ id: PLAYER_ID });
    const res = makeRes();
    await addMemberHandler(
      makeAuthedReq({
        method: 'POST',
        body: {
          userId: 'new-player',
          role: 'player',
          battleTag: 'NewPlayer#1234',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });
});

/* -----------------------------------------------------------
 * /api/teams/update-member-role
 * ---------------------------------------------------------*/

describe('/api/teams/update-member-role as manager', () => {
  it('manager can change a player role to substitute', async () => {
    const res = makeRes();
    await updateRoleHandler(
      makeAuthedReq({
        method: 'PATCH',
        body: { memberId: TM_PLY, role: 'substitute' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.role).toBe('substitute');
    expect(member.is_substitute).toBe(true);
  });

  it('manager CANNOT promote a player to manager (anti-escalation)', async () => {
    const res = makeRes();
    await updateRoleHandler(
      makeAuthedReq({
        method: 'PATCH',
        body: { memberId: TM_PLY, role: 'manager' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect((res.body as any).error).toMatch(/privil/i);
  });

  it('manager CANNOT demote another manager', async () => {
    // Add a second manager to demote.
    (store.team_members as any[]).push({
      id: TM_MGR2,
      team_id: TEAM_ID,
      user_id: 'other-mgr',
      role: 'manager',
    });
    const res = makeRes();
    await updateRoleHandler(
      makeAuthedReq({
        method: 'PATCH',
        body: { memberId: TM_MGR2, role: 'player' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('captain CAN promote a player to manager', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await updateRoleHandler(
      makeAuthedReq({
        method: 'PATCH',
        body: { memberId: TM_PLY, role: 'manager' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.role).toBe('manager');
  });

  it('manager CANNOT edit the captain own member row (403)', async () => {
    // Manager is signed in by default; target the captain's team_members row.
    const res = makeRes();
    await updateRoleHandler(
      makeAuthedReq({
        method: 'PATCH',
        body: { memberId: TM_CAP, role: 'substitute' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
    const member = (store.team_members as any[]).find((m) => m.id === TM_CAP);
    // unchanged
    expect(member.role).toBe('player');
  });

  it('rejects an invalid/unknown role with 400 (no silent coercion)', async () => {
    const res = makeRes();
    await updateRoleHandler(
      makeAuthedReq({
        method: 'PATCH',
        body: { memberId: TM_PLY, role: 'plyaer' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    // not coerced to 'player' — left untouched
    expect(member.role).toBe('player');
    expect(member.is_substitute).toBeUndefined();
  });
});

/* -----------------------------------------------------------
 * /api/teams/toggle-joinable
 * ---------------------------------------------------------*/

describe('/api/teams/toggle-joinable as manager', () => {
  it('manager can toggle joinable', async () => {
    const res = makeRes();
    await toggleJoinableHandler(
      makeAuthedReq({ method: 'POST', body: { joinable: true } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).is_joinable).toBe(true);
  });
});

/* -----------------------------------------------------------
 * /api/teams/join-requests + /api/teams/scrim-requests
 * ---------------------------------------------------------*/

describe('inbox endpoints accept manager', () => {
  it('manager can list join-requests', async () => {
    const res = makeRes();
    await joinRequestsHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
  });

  it('manager can list scrim-requests', async () => {
    const res = makeRes();
    await scrimRequestsHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
  });
});

/* -----------------------------------------------------------
 * /api/demandes/scrim
 * ---------------------------------------------------------*/

describe('/api/demandes/scrim as manager', () => {
  it('manager can request a scrim against another team', async () => {
    const res = makeRes();
    await scrimDemandHandler(
      makeAuthedReq({
        method: 'POST',
        body: {
          teamId: OTHER_TEAM_ID,
          message: 'hi',
          proposedSlots: ['2026-08-01T20:00:00.000Z'],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const inserted = (store.demandes as any[]).find(
      (d) => d.user_id === MANAGER_ID && d.type === 'scrim'
    );
    expect(inserted).toBeTruthy();
  });
});

/* -----------------------------------------------------------
 * /api/demandes/register-team
 * ---------------------------------------------------------*/

describe('/api/demandes/register-team as manager', () => {
  beforeEach(() => {
    store.tournaments = [
      {
        id: 'tour-1',
        name: 'Cup',
        status: 'published',
        max_teams: 32,
        min_players: 1,
      },
    ] as any;
  });

  it('manager can register the team to a tournament', async () => {
    const res = makeRes();
    await registerTeamHandler(
      makeAuthedReq({
        method: 'POST',
        body: { teamId: TEAM_ID, tournamentId: 'tour-1' },
      }),
      res
    );
    // Status may vary depending on downstream checks; assert it's not 403/401.
    expect(res.statusCode).not.toBe(403);
    expect(res.statusCode).not.toBe(401);
  });

  it('plain player cannot register the team', async () => {
    setAuthUser({ id: PLAYER_ID });
    const res = makeRes();
    await registerTeamHandler(
      makeAuthedReq({
        method: 'POST',
        body: { teamId: TEAM_ID, tournamentId: 'tour-1' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });
});

/* -----------------------------------------------------------
 * /api/admin/teams/my (PATCH = edit team info)
 * ---------------------------------------------------------*/

describe('PATCH /api/admin/teams/my as manager', () => {
  it('manager can edit team info (logo, description)', async () => {
    // Stub the update().eq().select().maybeSingle() chain to return an updated row.
    const originalFrom = supabaseAdmin.from;
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'teams') {
        const builder: any = {
          select: () => builder,
          update: (payload: any) => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: { id: TEAM_ID, ...payload },
                  error: null,
                }),
              }),
            }),
          }),
          eq: () => builder,
          maybeSingle: async () => ({
            data: store.teams?.[0] ?? null,
            error: null,
          }),
        };
        return builder;
      }
      return originalFrom(table);
    };

    try {
      const res = makeRes();
      await myTeamHandler(
        makeAuthedReq({
          method: 'PATCH',
          body: {
            teamId: TEAM_ID,
            description: 'Updated by manager',
            logo_url: 'https://example.com/logo.png',
          },
        }),
        res
      );
      expect(res.statusCode).toBe(200);
    } finally {
      (supabaseAdmin as any).from = originalFrom;
    }
  });
});

/* -----------------------------------------------------------
 * /api/teams/transfer-captain (CAPTAIN ONLY)
 * ---------------------------------------------------------*/

describe('/api/teams/transfer-captain remains captain-only', () => {
  it('manager CANNOT transfer captaincy', async () => {
    const res = makeRes();
    await transferCaptainHandler(
      makeAuthedReq({
        method: 'PATCH',
        body: { newCaptainUserId: PLAYER_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('captain can transfer captaincy', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await transferCaptainHandler(
      makeAuthedReq({
        method: 'PATCH',
        body: { newCaptainUserId: PLAYER_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });
});
