// tests/unit/adminUserProfile.test.ts
//
// GET /api/admin/users/[userId]/profile — identité d'une cible pour les vues
// d'inspection admin (S3 de docs/PLAN-espace-unifie.md).
//
// Remplace adminPlayerView.test.ts / adminCaptainView.test.ts : les deux
// endpoints-miroirs qu'ils couvraient ont été supprimés, les données d'espace
// joueur passant désormais par les vrais endpoints /api/player/* + `?as=`
// (couverts par subjectResolution.test.ts).
//
// Couverture : 405, 400, 404, happy path, scoping tenant de l'équipe, audit.

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

import handler from '../../pages/api/admin/users/[userId]/profile';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const STAFF_AUTH_USER_ID = 'user-admin-1';
const TARGET_USER_ID = '33333333-3333-4333-8333-333333333333';
const UNKNOWN_USER_ID = '44444444-4444-4444-8444-444444444444';
const TEAM_ID = '55555555-5555-4555-8555-555555555555';

let _bearer = 0;
function makeReq(over: Partial<any> = {}): any {
  _bearer += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${_bearer}` },
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

function seedStaff(role: 'owner' | 'admin' | 'caster' = 'admin') {
  store.staff = [
    {
      id: STAFF_ID,
      auth_user_id: STAFF_AUTH_USER_ID,
      email: 'admin@example.com',
      role,
      display_name: 'Adminette',
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
      is_pole_admin: false,
    } as StaffMember,
  ] as any;
  store.tenants = [
    { id: TENANT_A, slug: 'alpha', name: 'Alpha', is_active: true },
    { id: TENANT_B, slug: 'beta', name: 'Beta', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: STAFF_ID, role },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  setAuthUser({ id: STAFF_AUTH_USER_ID });
  seedStaff('admin');
  setAdminUser(TARGET_USER_ID, 'target@example.com', {
    user_metadata: {
      display_name: 'PlayerOne',
      battle_tag: 'PlayerOne#1234',
      avatar_url: 'https://cdn.example/avatar.png',
      role: 'player',
    },
    created_at: '2026-02-02T00:00:00.000Z',
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/admin/users/[userId]/profile', () => {
  it('rejects non-GET', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400s a malformed userId', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { userId: 'nope' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('404s an unknown user', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { userId: UNKNOWN_USER_ID } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('returns the auth identity of the target', async () => {
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).user).toMatchObject({
      id: TARGET_USER_ID,
      email: 'target@example.com',
      displayName: 'PlayerOne',
      battleTag: 'PlayerOne#1234',
      role: 'player',
    });
    // Décrit quelqu'un d'autre : jamais mis en cache.
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });

  it("returns the target's team when it lives in the staff's active tenant", async () => {
    store.team_members = [
      {
        id: 'tm-1',
        team_id: TEAM_ID,
        tenant_id: TENANT_A,
        user_id: TARGET_USER_ID,
        role: 'captain',
      },
    ] as any;
    store.teams = [{ id: TEAM_ID, tenant_id: TENANT_A, name: 'Phenix' }] as any;

    const res = makeRes();
    await handler(makeReq(), res);
    expect((res.body as any).team).toMatchObject({
      id: TEAM_ID,
      name: 'Phenix',
      role: 'captain',
    });
  });

  it('does NOT surface a team from another tenant', async () => {
    store.team_members = [
      {
        id: 'tm-2',
        team_id: TEAM_ID,
        tenant_id: TENANT_B,
        user_id: TARGET_USER_ID,
        role: 'player',
      },
    ] as any;
    store.teams = [
      { id: TEAM_ID, tenant_id: TENANT_B, name: 'Ailleurs' },
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).team).toBeNull();
  });

  it('audits the consultation once', async () => {
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
    expect(logStaffActionMock.mock.calls[0][0]).toMatchObject({
      staff_id: STAFF_ID,
      action: 'view_player_data',
      entity_type: 'user',
      entity_id: TARGET_USER_ID,
      tenant_id: TENANT_A,
    });
  });
});
