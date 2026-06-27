// tests/unit/adminPlayerView.test.ts
//
// Read-only staff inspection of a target user's PLAYER area ("mode vue player").
// Ref: pages/api/admin/users/[userId]/player-view.ts (GET only, minRole 'manager').
//
// Harness mirrors the staff/tenant setup of apiAdminBlacklist.test.ts (staff row
// + tenant_staff + active-tenant cookie), combined with the player-snapshot
// seeding idiom of playerMatches.test.ts.
//
// Coverage:
//   - 405 on POST.
//   - 400 on missing / malformed userId.
//   - 404 on unknown user.
//   - Happy path: snapshot with team (captain) + one upcoming match + demandes +
//     notification counters; asserts the contract shape.
//   - logStaffAction('view_player_data') invoked once with staff id + tenant +
//     target email in payload.

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
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { CHECKIN_OPEN_MINUTES } from '../../utils/checkin';

import handler from '../../pages/api/admin/users/[userId]/player-view';

/* -----------------------------------------------------------
 * Constants
 * ---------------------------------------------------------*/

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const STAFF_AUTH_USER_ID = 'user-mgr-1';

const TARGET_USER_ID = '33333333-3333-4333-8333-333333333333';
const UNKNOWN_USER_ID = '44444444-4444-4444-8444-444444444444';
const TEAM_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_TEAM_ID = '66666666-6666-4666-8666-666666666666';
const TOURNAMENT_ID = '77777777-7777-4777-8777-777777777777';
const MATCH_ID = '88888888-8888-4888-8888-888888888888';
const DEMANDE_OLD_ID = '99999999-9999-4999-8999-999999999991';
const DEMANDE_NEW_ID = '99999999-9999-4999-8999-999999999992';

/* -----------------------------------------------------------
 * Req/Res helpers
 * ---------------------------------------------------------*/

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
    query: { userId: TARGET_USER_ID },
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

/* -----------------------------------------------------------
 * Seeding
 * ---------------------------------------------------------*/

function seedStaff(role: 'owner' | 'admin' | 'manager' | 'caster' = 'manager') {
  store.staff = [makeStaffRow(role)] as any;
  store.tenants = [
    { id: TENANT_A, slug: 'alpha', name: 'Alpha', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: STAFF_ID, role: 'manager' },
  ] as any;
}

function seedTargetUser() {
  setAdminUser(TARGET_USER_ID, 'player@example.com', {
    user_metadata: {
      display_name: 'PlayerOne',
      battle_tag: 'PlayerOne#1234',
      avatar_url: 'https://cdn.example/avatar.png',
      role: 'player',
    },
    created_at: '2026-02-02T00:00:00.000Z',
  });
}

function seedTeamSnapshot() {
  // Target is captain of TEAM_ID.
  store.teams = [
    {
      id: TEAM_ID,
      tenant_id: TENANT_A,
      name: 'Phenix',
      slug: 'phenix',
      logo_url: 'https://cdn.example/logo.png',
      captain_id: TARGET_USER_ID,
    },
    {
      id: OTHER_TEAM_ID,
      tenant_id: TENANT_A,
      name: 'Avoidgers',
      slug: 'avoidgers',
      logo_url: null,
      captain_id: null,
    },
  ] as any;

  store.team_members = [
    {
      id: 'tm-target',
      team_id: TEAM_ID,
      tenant_id: TENANT_A,
      user_id: TARGET_USER_ID,
      role: 'captain',
      battle_tag: 'PlayerOne#1234',
      is_substitute: false,
      display_name: 'PlayerOne',
      created_at: '2026-02-03T00:00:00.000Z',
    },
    {
      id: 'tm-mate',
      team_id: TEAM_ID,
      tenant_id: TENANT_A,
      user_id: 'mate-user',
      role: 'player',
      battle_tag: 'Mate#9',
      is_substitute: true,
      display_name: 'Mate',
      created_at: '2026-02-04T00:00:00.000Z',
    },
  ] as any;
}

function seedMatch() {
  const upcomingScheduledAt = new Date(Date.now() + 30 * 60_000).toISOString();
  store.matches = [
    {
      id: MATCH_ID,
      tenant_id: TENANT_A,
      tournament_id: TOURNAMENT_ID,
      status: 'pending',
      scheduled_at: upcomingScheduledAt,
      match_format: 'bo3',
      round_name: 'Quarterfinal',
      stream_url: null,
      team1_id: TEAM_ID,
      team2_id: OTHER_TEAM_ID,
      team1_score: null,
      team2_score: null,
      winner_team_id: null,
      team1_checkin_token: 'token-team1',
      team2_checkin_token: 'token-team2',
      team1_checked_in_at: null,
      team2_checked_in_at: null,
      team1: { id: TEAM_ID, name: 'Phenix' },
      team2: { id: OTHER_TEAM_ID, name: 'Avoidgers' },
      tournament: {
        id: TOURNAMENT_ID,
        name: 'OW Womens Cup 2026',
        slug: 'ow-womens-cup-2026',
      },
    },
  ] as any;
  return upcomingScheduledAt;
}

function seedDemandes() {
  store.demandes = [
    {
      id: DEMANDE_OLD_ID,
      tenant_id: TENANT_A,
      user_id: TARGET_USER_ID,
      team_id: OTHER_TEAM_ID,
      type: 'join',
      status: 'rejected',
      comment: 'older request',
      processed_at: '2026-03-01T00:00:00.000Z',
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-03-01T01:00:00.000Z',
      payload: { foo: 'bar' },
      team: { id: OTHER_TEAM_ID, name: 'Avoidgers' },
    },
    {
      id: DEMANDE_NEW_ID,
      tenant_id: TENANT_A,
      user_id: TARGET_USER_ID,
      team_id: null,
      type: 'captain_request',
      status: 'pending',
      comment: null,
      processed_at: null,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: null,
      payload: { team_name: 'NewSquad' },
      team: null,
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  setAuthUser({ id: STAFF_AUTH_USER_ID });
  seedStaff('manager');
  seedTargetUser();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* ===========================================================================
 * Guards
 * =========================================================================*/

describe('/api/admin/users/[userId]/player-view — guards', () => {
  it('405 on POST', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('400 on missing userId', async () => {
    const res = makeRes();
    await handler(makeReq({ query: {} }), res);
    expect(res.statusCode).toBe(400);
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
 * Happy path
 * =========================================================================*/

describe('/api/admin/users/[userId]/player-view — snapshot', () => {
  it('returns user + team (captain) + matches + notifications + demandes', async () => {
    seedTeamSnapshot();
    const scheduledAt = seedMatch();
    seedDemandes();

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('private, no-store');

    const body = res.body as any;

    // --- user ---
    expect(body.user).toEqual({
      id: TARGET_USER_ID,
      email: 'player@example.com',
      displayName: 'PlayerOne',
      battleTag: 'PlayerOne#1234',
      avatarUrl: 'https://cdn.example/avatar.png',
      role: 'player',
      createdAt: '2026-02-02T00:00:00.000Z',
    });

    // --- team ---
    expect(body.team).not.toBeNull();
    expect(body.team.id).toBe(TEAM_ID);
    expect(body.team.name).toBe('Phenix');
    expect(body.team.slug).toBe('phenix');
    expect(body.team.logoUrl).toBe('https://cdn.example/logo.png');
    expect(body.team.role).toBe('captain');
    expect(body.team.isSubstitute).toBe(false);
    expect(body.team.members).toHaveLength(2);
    const memberIds = body.team.members.map((m: any) => m.id);
    expect(memberIds).toContain('tm-target');
    expect(memberIds).toContain('tm-mate');
    const mate = body.team.members.find((m: any) => m.id === 'tm-mate');
    expect(mate.isSubstitute).toBe(true);
    expect(mate.battleTag).toBe('Mate#9');

    // --- matches (same shape as /api/player/matches) ---
    expect(body.matches).toHaveLength(1);
    const match = body.matches[0];
    expect(match.id).toBe(MATCH_ID);
    expect(match.slot).toBe(1);
    expect(match.opponent).toEqual({ id: OTHER_TEAM_ID, name: 'Avoidgers' });
    expect(match.bestOf).toBe(3);
    expect(match.checkin).not.toBeNull();
    expect(match.checkin.token).toBe('token-team1');
    expect(match.checkin.isOpen).toBe(true);
    const expectedOpens = new Date(
      new Date(scheduledAt).getTime() - CHECKIN_OPEN_MINUTES * 60_000
    ).toISOString();
    expect(match.checkin.opensAt).toBe(expectedOpens);

    // --- notifications ---
    expect(body.notifications.hasTeam).toBe(true);
    expect(body.notifications.isCaptain).toBe(true);
    expect(body.notifications.isManager).toBe(false);
    // The target is captain, so the check-in window of the upcoming match counts.
    expect(body.notifications.checkinPending).toBe(1);
    expect(typeof body.notifications.total).toBe('number');

    // --- demandes (newest first) ---
    expect(body.demandes).toHaveLength(2);
    expect(body.demandes[0].id).toBe(DEMANDE_NEW_ID);
    expect(body.demandes[1].id).toBe(DEMANDE_OLD_ID);
    expect(body.demandes[1].team).toEqual({
      id: OTHER_TEAM_ID,
      name: 'Avoidgers',
    });
    expect(body.demandes[0].processed_at).toBeNull();
    expect(body.demandes[1].processed_at).toBe('2026-03-01T00:00:00.000Z');
  });

  it('returns team:null and empty matches when the target has no team', async () => {
    // No team_members seeded.
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.team).toBeNull();
    expect(body.matches).toEqual([]);
    expect(body.notifications.hasTeam).toBe(false);
    expect(body.demandes).toEqual([]);
  });

  it('audits the inspection via logStaffAction(view_player_data) once', async () => {
    seedTeamSnapshot();
    seedMatch();
    seedDemandes();

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
    const call = logStaffActionMock.mock.calls[0][0];
    expect(call.action).toBe('view_player_data');
    expect(call.staff_id).toBe(STAFF_ID);
    expect(call.entity_type).toBe('user');
    expect(call.entity_id).toBe(TARGET_USER_ID);
    expect(call.tenant_id).toBe(TENANT_A);
    expect(call.payload).toEqual({ email: 'player@example.com' });
  });
});
