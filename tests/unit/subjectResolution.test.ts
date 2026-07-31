// tests/unit/subjectResolution.test.ts
//
// Subject resolution (utils/subject.ts) — the `?as=<userId>` staff-inspection
// layer shared by every migrated player/team read endpoint.
//
// Two levels of coverage:
//   A. The wrapper itself, exercised through a probe handler, so the gating
//      rules are asserted independently of any endpoint's business logic.
//   B. One real endpoint (/api/player/matches) proving that an inspecting
//      admin gets the TARGET's data, scoped to the STAFF's active tenant.
//
// Harness = staff/tenant setup of adminPlayerView.test.ts (staff row +
// tenant_staff + active-tenant cookie) over the player-endpoint idiom of
// playerMatches.test.ts.

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
import { withSubjectRoute, type SubjectContext } from '../../utils/subject';

import matchesHandler from '../../pages/api/player/matches';
import toggleJoinableHandler from '../../pages/api/teams/toggle-joinable';

/* -----------------------------------------------------------
 * Constants
 * ---------------------------------------------------------*/

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const STAFF_AUTH_USER_ID = '22222222-2222-4222-8222-222222222222';

const TARGET_USER_ID = '33333333-3333-4333-8333-333333333333';
const UNKNOWN_USER_ID = '44444444-4444-4444-8444-444444444444';
const PLAIN_USER_ID = '55555555-5555-4555-8555-555555555555';

const TEAM_A_ID = '66666666-6666-4666-8666-666666666666';
const TEAM_B_ID = '77777777-7777-4777-8777-777777777777';

/* -----------------------------------------------------------
 * Req/Res helpers
 * ---------------------------------------------------------*/

// `resolveUserFromToken` caches token → user, so every request needs its own
// bearer or a later test would resolve to the previous test's caller.
let _bearer = 0;
function freshBearer() {
  _bearer += 1;
  return `Bearer t-${Date.now()}-${_bearer}`;
}

function makeReq(over: Partial<any> = {}, includeAuth = true): any {
  const headers: Record<string, string> = { host: 'h' };
  if (includeAuth) headers.authorization = freshBearer();
  return {
    method: 'GET',
    url: '/api/player/matches',
    headers,
    cookies: { staff_active_tenant_id: TENANT_A },
    query: {},
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
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
  res.end = () => res;
  return res;
}

/* -----------------------------------------------------------
 * Seeding
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'admin'
): StaffMember {
  return {
    id: STAFF_ID,
    auth_user_id: STAFF_AUTH_USER_ID,
    email: 'admin@example.com',
    role,
    display_name: 'Adminette',
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    is_pole_admin: false,
  } as StaffMember;
}

function seedStaff(role: 'owner' | 'admin' | 'caster' = 'admin') {
  store.staff = [makeStaffRow(role)] as any;
  store.tenants = [
    { id: TENANT_A, slug: 'alpha', name: 'Alpha', is_active: true },
    { id: TENANT_B, slug: 'beta', name: 'Beta', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: STAFF_ID, role },
  ] as any;
}

/** Target belongs to TEAM_A in the staff's active tenant. */
function seedTargetInTenantA() {
  store.teams = [
    { id: TEAM_A_ID, tenant_id: TENANT_A, name: 'Phenix' },
    { id: TEAM_B_ID, tenant_id: TENANT_B, name: 'Ailleurs' },
  ] as any;
  store.team_members = [
    {
      id: 'tm-target-a',
      team_id: TEAM_A_ID,
      tenant_id: TENANT_A,
      user_id: TARGET_USER_ID,
      role: 'player',
    },
  ] as any;
  store.matches = [];
}

/** Same target, but their only membership lives in ANOTHER tenant. */
function seedTargetInTenantB() {
  store.teams = [
    { id: TEAM_A_ID, tenant_id: TENANT_A, name: 'Phenix' },
    { id: TEAM_B_ID, tenant_id: TENANT_B, name: 'Ailleurs' },
  ] as any;
  store.team_members = [
    {
      id: 'tm-target-b',
      team_id: TEAM_B_ID,
      tenant_id: TENANT_B,
      user_id: TARGET_USER_ID,
      role: 'player',
    },
  ] as any;
  store.matches = [];
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  setAdminUser(TARGET_USER_ID, 'target@example.com');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* -----------------------------------------------------------
 * A. The wrapper, via a probe handler
 * ---------------------------------------------------------*/

let lastSubject: SubjectContext | null = null;

const probe = withSubjectRoute(async (_req, res, { subject }) => {
  lastSubject = subject;
  // Deliberately set a caching policy AFTER the wrapper ran: an inspected
  // payload must still come back `no-store`.
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.status(200).json({ ok: true });
});

const captainProbe = withSubjectRoute(
  async (_req, res, { subject }) => {
    lastSubject = subject;
    res.status(200).json({ ok: true });
  },
  { auditAction: 'view_captain_data' }
);

/** Route ayant opté pour les écritures « agir en tant que » (S4). */
const actAsProbe = withSubjectRoute(
  async (_req, res, { subject }) => {
    lastSubject = subject;
    res.status(200).json({ ok: true });
  },
  { allowActAs: true }
);

describe('withSubjectRoute — self path', () => {
  beforeEach(() => {
    lastSubject = null;
    setAuthUser({ id: PLAIN_USER_ID });
  });

  it('resolves the caller when no ?as= is given, without touching staff_logs', async () => {
    const res = makeRes();
    await probe(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(lastSubject).toMatchObject({
      userId: PLAIN_USER_ID,
      callerId: PLAIN_USER_ID,
      isInspection: false,
      staffId: null,
    });
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('treats ?as=<myself> as a no-op, not an inspection', async () => {
    const res = makeRes();
    await probe(makeReq({ query: { as: PLAIN_USER_ID } }), res);

    expect(res.statusCode).toBe(200);
    expect(lastSubject?.isInspection).toBe(false);
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('leaves the handler free to set its own Cache-Control', async () => {
    const res = makeRes();
    await probe(makeReq(), res);
    expect(res.headers['Cache-Control']).toBe('private, max-age=60');
  });

  it('401s an unauthenticated caller before any subject work', async () => {
    const res = makeRes();
    await probe(makeReq({ query: { as: TARGET_USER_ID } }, false), res);
    expect(res.statusCode).toBe(401);
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });
});

describe('withSubjectRoute — guards', () => {
  beforeEach(() => {
    lastSubject = null;
    setAuthUser({ id: PLAIN_USER_ID });
  });

  it('400s a malformed ?as=', async () => {
    const res = makeRes();
    await probe(makeReq({ query: { as: 'not-a-uuid' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: 'invalid_subject' });
  });

  it('403s a non-staff caller trying to inspect someone else', async () => {
    const res = makeRes();
    await probe(makeReq({ query: { as: TARGET_USER_ID } }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'subject_forbidden' });
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('403s a staff caller below the minimum role (caster)', async () => {
    setAuthUser({ id: STAFF_AUTH_USER_ID });
    seedStaff('caster');

    const res = makeRes();
    await probe(makeReq({ query: { as: TARGET_USER_ID } }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'subject_forbidden' });
  });

  it('403s ?as= on a write, even for an admin (inspection is read-only)', async () => {
    setAuthUser({ id: STAFF_AUTH_USER_ID });
    seedStaff('admin');

    const res = makeRes();
    await probe(
      makeReq({ method: 'POST', query: { as: TARGET_USER_ID } }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'subject_read_only' });
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('404s an unknown target', async () => {
    setAuthUser({ id: STAFF_AUTH_USER_ID });
    seedStaff('admin');

    const res = makeRes();
    await probe(makeReq({ query: { as: UNKNOWN_USER_ID } }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ code: 'subject_not_found' });
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });
});

describe('withSubjectRoute — inspection path', () => {
  beforeEach(() => {
    lastSubject = null;
    setAuthUser({ id: STAFF_AUTH_USER_ID });
    seedStaff('admin');
  });

  it('resolves the target + the staff active tenant, and flags the inspection', async () => {
    const res = makeRes();
    await probe(makeReq({ query: { as: TARGET_USER_ID } }), res);

    expect(res.statusCode).toBe(200);
    expect(lastSubject).toMatchObject({
      userId: TARGET_USER_ID,
      callerId: STAFF_AUTH_USER_ID,
      tenantId: TENANT_A,
      isInspection: true,
      staffId: STAFF_ID,
      staffRole: 'admin',
    });
  });

  it('pins Cache-Control to no-store despite the handler asking for max-age', async () => {
    const res = makeRes();
    await probe(makeReq({ query: { as: TARGET_USER_ID } }), res);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });

  it('audits exactly once, with the endpoint path and the staff tenant', async () => {
    const res = makeRes();
    await probe(makeReq({ query: { as: TARGET_USER_ID } }), res);

    expect(res.statusCode).toBe(200);
    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
    expect(logStaffActionMock).toHaveBeenCalledWith({
      staff_id: STAFF_ID,
      action: 'view_player_data',
      entity_type: 'user',
      entity_id: TARGET_USER_ID,
      tenant_id: TENANT_A,
      payload: {
        endpoint: '/api/player/matches',
        email: 'target@example.com',
      },
    });
  });

  it('honours the auditAction override for captain-area endpoints', async () => {
    const res = makeRes();
    await captainProbe(makeReq({ query: { as: TARGET_USER_ID } }), res);

    expect(res.statusCode).toBe(200);
    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
    expect(logStaffActionMock.mock.calls[0][0]).toMatchObject({
      action: 'view_captain_data',
    });
  });

  it('never lets a logging failure break the response', async () => {
    logStaffActionMock.mockRejectedValueOnce(new Error('staff_logs down'));

    const res = makeRes();
    await probe(makeReq({ query: { as: TARGET_USER_ID } }), res);

    expect(res.statusCode).toBe(200);
    expect(lastSubject?.isInspection).toBe(true);
  });
});

/* -----------------------------------------------------------
 * A bis. Act-as (S4) — écritures staff à la place du sujet
 *
 * Deux clés indépendantes : la route doit l'autoriser (`allowActAs`) ET
 * l'appelant doit la demander (header ou `act=1`).
 * ---------------------------------------------------------*/

describe('withSubjectRoute — act-as', () => {
  beforeEach(() => {
    lastSubject = null;
    setAuthUser({ id: STAFF_AUTH_USER_ID });
    seedStaff('admin');
  });

  it('403s a write when the route did NOT opt in, even if asked', async () => {
    const res = makeRes();
    await probe(
      makeReq({ method: 'PATCH', query: { as: TARGET_USER_ID, act: '1' } }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'subject_read_only' });
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('403s a write on an opted-in route when the caller did NOT ask', async () => {
    const res = makeRes();
    await actAsProbe(
      makeReq({ method: 'PATCH', query: { as: TARGET_USER_ID } }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'subject_read_only' });
  });

  it('allows the write when both keys are present (query param)', async () => {
    const res = makeRes();
    await actAsProbe(
      makeReq({ method: 'PATCH', query: { as: TARGET_USER_ID, act: '1' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(lastSubject).toMatchObject({
      userId: TARGET_USER_ID,
      callerId: STAFF_AUTH_USER_ID,
      isInspection: true,
      isActingAs: true,
    });
  });

  it('accepts the header form too', async () => {
    const res = makeRes();
    const req = makeReq({
      method: 'POST',
      query: { as: TARGET_USER_ID },
    });
    req.headers['x-staff-act-as'] = '1';
    await actAsProbe(req, res);
    expect(res.statusCode).toBe(200);
    expect(lastSubject?.isActingAs).toBe(true);
  });

  it('still refuses a non-staff caller', async () => {
    setAuthUser({ id: PLAIN_USER_ID });
    const res = makeRes();
    await actAsProbe(
      makeReq({ method: 'PATCH', query: { as: TARGET_USER_ID, act: '1' } }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'subject_forbidden' });
  });

  it('audits a write as act_as_player, with the HTTP method', async () => {
    const res = makeRes();
    await actAsProbe(
      makeReq({ method: 'PATCH', query: { as: TARGET_USER_ID, act: '1' } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
    expect(logStaffActionMock.mock.calls[0][0]).toMatchObject({
      staff_id: STAFF_ID,
      action: 'act_as_player',
      entity_id: TARGET_USER_ID,
      tenant_id: TENANT_A,
      payload: { method: 'PATCH' },
    });
  });

  it('leaves a GET on the same route a plain consultation', async () => {
    const res = makeRes();
    await actAsProbe(makeReq({ query: { as: TARGET_USER_ID, act: '1' } }), res);
    expect(res.statusCode).toBe(200);
    expect(lastSubject?.isActingAs).toBe(false);
    expect(logStaffActionMock.mock.calls[0][0]).toMatchObject({
      action: 'view_player_data',
    });
  });

  it('never turns a self call into an act-as', async () => {
    setAuthUser({ id: PLAIN_USER_ID });
    const res = makeRes();
    await actAsProbe(
      makeReq({ method: 'PATCH', query: { as: PLAIN_USER_ID, act: '1' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(lastSubject).toMatchObject({
      isInspection: false,
      isActingAs: false,
    });
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });
});

/* -----------------------------------------------------------
 * B. Through a real endpoint
 * ---------------------------------------------------------*/

describe('/api/player/matches — inspected via ?as=', () => {
  beforeEach(() => {
    setAuthUser({ id: STAFF_AUTH_USER_ID });
    seedStaff('admin');
  });

  it("returns the TARGET's team, not the caller's", async () => {
    seedTargetInTenantA();

    const res = makeRes();
    await matchesHandler(makeReq({ query: { as: TARGET_USER_ID } }), res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).team).toMatchObject({
      id: TEAM_A_ID,
      name: 'Phenix',
    });
    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT leak the target's data from another tenant", async () => {
    // Target only plays in TENANT_B; the staff is acting in TENANT_A.
    seedTargetInTenantB();

    const res = makeRes();
    await matchesHandler(makeReq({ query: { as: TARGET_USER_ID } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ team: null, matches: [] });
  });

  it('still serves the caller their own matches when ?as= is absent', async () => {
    store.teams = [
      { id: TEAM_A_ID, tenant_id: TENANT_A, name: 'Phenix' },
    ] as any;
    store.team_members = [
      {
        id: 'tm-staff',
        team_id: TEAM_A_ID,
        tenant_id: TENANT_A,
        user_id: STAFF_AUTH_USER_ID,
        role: 'player',
      },
    ] as any;
    store.matches = [];

    const res = makeRes();
    await matchesHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });
});

/* -----------------------------------------------------------
 * C. Act-as through a real write endpoint
 *
 * La garantie qui compte : l'écriture atterrit sur l'équipe du SUJET, jamais
 * sur celle du staff.
 * ---------------------------------------------------------*/

describe('/api/teams/toggle-joinable — act-as', () => {
  beforeEach(() => {
    setAuthUser({ id: STAFF_AUTH_USER_ID });
    seedStaff('admin');
    // La cible capitaine son équipe ; le staff, lui, en a une AUTRE.
    store.teams = [
      {
        id: TEAM_A_ID,
        tenant_id: TENANT_A,
        name: 'Phenix',
        captain_id: TARGET_USER_ID,
        is_joinable: false,
      },
      {
        id: TEAM_B_ID,
        tenant_id: TENANT_A,
        name: 'Equipe du staff',
        captain_id: STAFF_AUTH_USER_ID,
        is_joinable: false,
      },
    ] as any;
    store.team_members = [
      {
        id: 'tm-target',
        team_id: TEAM_A_ID,
        tenant_id: TENANT_A,
        user_id: TARGET_USER_ID,
        role: 'captain',
        is_captain: true,
      },
      {
        id: 'tm-staff',
        team_id: TEAM_B_ID,
        tenant_id: TENANT_A,
        user_id: STAFF_AUTH_USER_ID,
        role: 'captain',
        is_captain: true,
      },
    ] as any;
  });

  it("flips the SUBJECT's team, not the caller's", async () => {
    const res = makeRes();
    await toggleJoinableHandler(
      makeReq({
        method: 'POST',
        url: '/api/teams/toggle-joinable',
        query: { as: TARGET_USER_ID, act: '1' },
        body: { joinable: true },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).teamId).toBe(TEAM_A_ID);

    const target = (store.teams as any[]).find((t) => t.id === TEAM_A_ID);
    const staffTeam = (store.teams as any[]).find((t) => t.id === TEAM_B_ID);
    expect(target.is_joinable).toBe(true);
    expect(staffTeam.is_joinable).toBe(false);
  });

  it('refuses the same call without the act key', async () => {
    const res = makeRes();
    await toggleJoinableHandler(
      makeReq({
        method: 'POST',
        url: '/api/teams/toggle-joinable',
        query: { as: TARGET_USER_ID },
        body: { joinable: true },
      }),
      res
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'subject_read_only' });
    const target = (store.teams as any[]).find((t) => t.id === TEAM_A_ID);
    expect(target.is_joinable).toBe(false);
  });
});
