// tests/unit/adminCaptainView.test.ts
//
// Read-only staff inspection of the team a target user CAPTAINS ("mode vue
// capitaine"). Ref: pages/api/admin/users/[userId]/captain-view.ts (GET only,
// minRole 'manager').
//
// Harness mirrors adminPlayerView.test.ts (staff row + tenant_staff +
// active-tenant cookie + setAdminUser target seeding).
//
// Coverage:
//   - 405 on POST, 400 on bad userId, 404 on unknown user.
//   - Captain happy path: team + members + pending join requests + demandes.
//   - Non-captain: team null, isCaptain false, empty sections.
//   - logStaffAction('view_captain_data') invoked once.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async (_params?: any) => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: logStaffActionMock,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAdminUser,
  setAuthListUsers,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import handler from '../../pages/api/admin/users/[userId]/captain-view';

/* ----------------------------------------------------------- */

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const STAFF_AUTH_USER_ID = 'user-mgr-1';

const CAPTAIN_ID = '33333333-3333-4333-8333-333333333333';
const MATE_ID = '33333333-3333-4333-8333-333333333334';
const PLAIN_MEMBER_ID = '33333333-3333-4333-8333-333333333335';
const APPLICANT_ID = '33333333-3333-4333-8333-333333333336';
const UNKNOWN_USER_ID = '44444444-4444-4444-8444-444444444444';
const TEAM_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_TEAM_ID = '66666666-6666-4666-8666-666666666666';
const JOIN_DEMANDE_ID = '99999999-9999-4999-8999-999999999991';
const SCRIM_DEMANDE_ID = '99999999-9999-4999-8999-999999999992';

/* ----------------------------------------------------------- */

function makeStaffRow(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'manager'
): StaffMember {
  return {
    id: STAFF_ID,
    auth_user_id: STAFF_AUTH_USER_ID,
    email: 'mgr@example.com',
    role,
    display_name: 'Manager',
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    is_pole_admin: false,
  } as StaffMember;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: 'Bearer t-mgr' },
    cookies: { staff_active_tenant_id: TENANT_A },
    query: { userId: CAPTAIN_ID },
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...over,
  };
}

function makeRes(): any {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    setHeader(k: string, v: unknown) {
      this.headers[k] = v;
    },
    end() {
      return this;
    },
  };
}

/* ----------------------------------------------------------- */

function seedStaff(role: 'owner' | 'admin' | 'manager' | 'caster' = 'manager') {
  store.staff = [makeStaffRow(role)] as any;
  store.tenants = [
    { id: TENANT_A, slug: 'alpha', name: 'Alpha', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: STAFF_ID, role: 'manager' },
  ] as any;
}

/** _authListUsers row carrying user_metadata for the admin_get_user_profiles RPC. */
function profileEntry(id: string, display: string): any {
  return {
    id,
    email: `${display.toLowerCase()}@example.com`,
    user_metadata: {
      display_name: display,
      battle_tag: `${display}#1234`,
    },
  };
}

function seedTargetUser(id: string, display: string) {
  setAdminUser(id, `${display.toLowerCase()}@example.com`, {
    user_metadata: {
      display_name: display,
      battle_tag: `${display}#1234`,
      avatar_url: 'https://cdn.example/avatar.png',
      role: 'player',
    },
    created_at: '2026-02-02T00:00:00.000Z',
  });
}

function seedCaptainTeam() {
  // CAPTAIN_ID captains TEAM_ID.
  store.teams = [
    {
      id: TEAM_ID,
      tenant_id: TENANT_A,
      name: 'Phenix',
      slug: 'phenix',
      logo_url: 'https://cdn.example/logo.png',
      captain_id: CAPTAIN_ID,
      is_joinable: true,
      open_for_scrim: true,
    },
    {
      id: OTHER_TEAM_ID,
      tenant_id: TENANT_A,
      name: 'Avoidgers',
      slug: 'avoidgers',
      logo_url: null,
      captain_id: null,
      is_joinable: false,
      open_for_scrim: false,
    },
  ] as any;

  store.team_members = [
    {
      id: 'tm-captain',
      team_id: TEAM_ID,
      tenant_id: TENANT_A,
      user_id: CAPTAIN_ID,
      role: 'captain',
      battle_tag: 'Captain#1234',
      is_substitute: false,
      created_at: '2026-02-03T00:00:00.000Z',
    },
    {
      id: 'tm-mate',
      team_id: TEAM_ID,
      tenant_id: TENANT_A,
      user_id: MATE_ID,
      role: 'player',
      battle_tag: 'Mate#9',
      is_substitute: true,
      created_at: '2026-02-04T00:00:00.000Z',
    },
  ] as any;
}

function seedDemandes() {
  store.demandes = [
    {
      id: JOIN_DEMANDE_ID,
      tenant_id: TENANT_A,
      user_id: APPLICANT_ID,
      team_id: TEAM_ID,
      type: 'join',
      status: 'pending',
      comment: 'let me in',
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: null,
      processed_at: null,
      payload: { desired_role: 'support', user_battle_tag: 'Applicant#7' },
    },
    {
      id: SCRIM_DEMANDE_ID,
      tenant_id: TENANT_A,
      user_id: null,
      team_id: TEAM_ID,
      type: 'scrim',
      status: 'approved',
      comment: null,
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-03-01T01:00:00.000Z',
      processed_at: '2026-03-01T01:00:00.000Z',
      payload: { scrim_nego: { slots: [] } },
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  setAuthUser({ id: STAFF_AUTH_USER_ID });
  seedStaff('manager');
  seedTargetUser(CAPTAIN_ID, 'Captain');
  seedTargetUser(MATE_ID, 'Mate');
  seedTargetUser(APPLICANT_ID, 'Applicant');
  // The batch profile RPC (admin_get_user_profiles) resolves member/applicant
  // display names from _authListUsers, distinct from getUserById's _adminUsers.
  setAuthListUsers([
    profileEntry(CAPTAIN_ID, 'Captain'),
    profileEntry(MATE_ID, 'Mate'),
    profileEntry(APPLICANT_ID, 'Applicant'),
  ]);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* ===========================================================================
 * Guards
 * =========================================================================*/

describe('/api/admin/users/[userId]/captain-view — guards', () => {
  it('405 on POST', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('400 on malformed userId', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { userId: 'not-a-uuid' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('404 on unknown user', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { userId: UNKNOWN_USER_ID } }), res);
    expect(res.statusCode).toBe(404);
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('403 when role is below manager (caster)', async () => {
    seedStaff('caster');
    invalidateStaffCache();
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(403);
  });
});

/* ===========================================================================
 * Captain snapshot
 * =========================================================================*/

describe('/api/admin/users/[userId]/captain-view — captain snapshot', () => {
  it('returns team + members + pending join requests + demandes', async () => {
    seedCaptainTeam();
    seedDemandes();

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('private, no-store');

    const body = res.body as any;

    // --- user ---
    expect(body.user.id).toBe(CAPTAIN_ID);
    expect(body.user.displayName).toBe('Captain');

    // --- flags ---
    expect(body.isCaptain).toBe(true);

    // --- team ---
    expect(body.team).not.toBeNull();
    expect(body.team.id).toBe(TEAM_ID);
    expect(body.team.name).toBe('Phenix');
    expect(body.team.slug).toBe('phenix');
    expect(body.team.logoUrl).toBe('https://cdn.example/logo.png');
    expect(body.team.captainId).toBe(CAPTAIN_ID);
    expect(body.team.isJoinable).toBe(true);
    expect(body.team.openForScrim).toBe(true);

    // --- members ---
    expect(body.team.members).toHaveLength(2);
    const captain = body.team.members.find((m: any) => m.id === 'tm-captain');
    expect(captain.isCaptain).toBe(true);
    expect(captain.displayName).toBe('Captain');
    const mate = body.team.members.find((m: any) => m.id === 'tm-mate');
    expect(mate.isCaptain).toBe(false);
    expect(mate.isSubstitute).toBe(true);
    expect(mate.battleTag).toBe('Mate#9');
    expect(mate.displayName).toBe('Mate');

    // --- join requests (pending only) ---
    expect(body.joinRequests).toHaveLength(1);
    const jr = body.joinRequests[0];
    expect(jr.id).toBe(JOIN_DEMANDE_ID);
    expect(jr.desiredRole).toBe('support');
    expect(jr.comment).toBe('let me in');
    expect(jr.user).toEqual({
      displayName: 'Applicant',
      battleTag: 'Applicant#1234',
    });

    // --- demandes (team history, newest first) ---
    expect(body.demandes.length).toBeGreaterThanOrEqual(2);
    expect(body.demandes[0].id).toBe(JOIN_DEMANDE_ID);
    expect(body.demandes[1].id).toBe(SCRIM_DEMANDE_ID);

    // --- sections present ---
    expect(Array.isArray(body.pendingScrims)).toBe(true);
    expect(body.nextMatch).toBeDefined();
  });

  it('audits the inspection via logStaffAction(view_captain_data) once', async () => {
    seedCaptainTeam();
    seedDemandes();

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
    const call = logStaffActionMock.mock.calls[0][0];
    expect(call.action).toBe('view_captain_data');
    expect(call.staff_id).toBe(STAFF_ID);
    expect(call.entity_type).toBe('user');
    expect(call.entity_id).toBe(CAPTAIN_ID);
    expect(call.tenant_id).toBe(TENANT_A);
  });
});

/* ===========================================================================
 * Non-captain
 * =========================================================================*/

describe('/api/admin/users/[userId]/captain-view — non-captain', () => {
  it('returns team:null + isCaptain:false when the target captains no team', async () => {
    // Target is a plain member of a team captained by someone else.
    seedTargetUser(PLAIN_MEMBER_ID, 'Plain');
    store.teams = [
      {
        id: TEAM_ID,
        tenant_id: TENANT_A,
        name: 'Phenix',
        slug: 'phenix',
        logo_url: null,
        captain_id: CAPTAIN_ID,
        is_joinable: true,
        open_for_scrim: false,
      },
    ] as any;
    store.team_members = [
      {
        id: 'tm-plain',
        team_id: TEAM_ID,
        tenant_id: TENANT_A,
        user_id: PLAIN_MEMBER_ID,
        role: 'player',
        battle_tag: 'Plain#1',
        is_substitute: false,
        created_at: '2026-02-03T00:00:00.000Z',
      },
    ] as any;

    const res = makeRes();
    await handler(makeReq({ query: { userId: PLAIN_MEMBER_ID } }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.team).toBeNull();
    expect(body.isCaptain).toBe(false);
    expect(body.joinRequests).toEqual([]);
    expect(body.pendingScrims).toEqual([]);
    expect(body.demandes).toEqual([]);
    // Still audited.
    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
  });

  it('returns team:null when the target has no team at all', async () => {
    store.teams = [] as any;
    store.team_members = [] as any;
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).team).toBeNull();
    expect((res.body as any).isCaptain).toBe(false);
  });
});
