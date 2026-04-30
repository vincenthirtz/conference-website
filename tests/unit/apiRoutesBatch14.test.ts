import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

vi.mock('@/utils/rateLimit', () => ({
  applyRateLimit: () => false,
  getClientIp: () => '127.0.0.1',
}));

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: logStaffActionMock,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAuthListUsers,
  setAdminUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import meHandler from '../../pages/api/admin/me';
import usersSearchHandler from '../../pages/api/admin/users/search';
import demandesJoinHandler from '../../pages/api/demandes/join';
import adherentsHandler from '../../pages/api/admin/adherents/index';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'manager'
): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

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
  invalidateStaffCache();
  logStaffActionMock.mockClear();
});

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

/* -----------------------------------------------------------
 * /api/admin/me — bespoke auth (Bearer + staff lookup)
 * ---------------------------------------------------------*/

describe('/api/admin/me', () => {
  it('401 without Bearer token', async () => {
    const res = makeRes();
    await meHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('401 when token does not resolve to a user', async () => {
    setAuthUser(null);
    const res = makeRes();
    await meHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(401);
  });

  it('GET 200 returns the staff row for the user', async () => {
    setAuthUser({ id: 'user-1', email: 'me@example.com' });
    store.staff = [makeStaffRow('admin')] as any;
    const res = makeRes();
    await meHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).role).toBe('admin');
    expect(res.headers['Cache-Control']).toMatch(/no-store/);
  });

  it('GET falls back to "captain" virtual role when not staff but is captain of a team', async () => {
    setAuthUser({
      id: 'user-2',
      email: 'cap@example.com',
      user_metadata: { display_name: 'Cappy' },
      created_at: '2026-01-01',
    });
    store.staff = [];
    store.teams = [
      { id: 'team-1', name: 'Alpha', captain_id: 'user-2' },
    ] as any;
    const res = makeRes();
    await meHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).role).toBe('captain');
    expect((res.body as any).id).toBe('team-1');
  });

  it('GET 403 when neither staff nor captain', async () => {
    setAuthUser({ id: 'user-3' });
    store.staff = [];
    store.teams = [];
    const res = makeRes();
    await meHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(403);
  });

  it('PATCH 400 when no fields to update', async () => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('admin')] as any;
    const res = makeRes();
    await meHandler(
      makeReq({ method: 'PATCH', body: {} }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 200 updates display_name and avatar_url', async () => {
    setAuthUser({ id: 'user-1' });
    store.staff = [
      makeStaffRow('admin'),
    ] as any;
    const res = makeRes();
    await meHandler(
      makeReq(
        {
          method: 'PATCH',
          body: { displayName: '  Boss  ', avatarUrl: 'https://x/y.png' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.staff[0] as any).display_name).toBe('Boss');
    expect((store.staff[0] as any).avatar_url).toBe('https://x/y.png');
  });

  it('returns 405 on unsupported method', async () => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('admin')] as any;
    const res = makeRes();
    await meHandler(makeReq({ method: 'DELETE' }, true), res);
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/admin/users/search
 * ---------------------------------------------------------*/

describe('GET /api/admin/users/search', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('manager')] as any;
  });

  it('405 on non-GET', async () => {
    const res = makeRes();
    await usersSearchHandler(makeReq({ method: 'POST' }, true), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 when query too short', async () => {
    const res = makeRes();
    await usersSearchHandler(
      makeReq({ method: 'GET', query: { q: 'a' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when query too long', async () => {
    const res = makeRes();
    await usersSearchHandler(
      makeReq({ method: 'GET', query: { q: 'a'.repeat(101) } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 finds players by email substring', async () => {
    setAuthListUsers([
      {
        id: 'u1',
        email: 'alice.smith@example.com',
      } as any,
      {
        id: 'u2',
        email: 'bob@example.com',
      } as any,
    ]);
    store.team_members = [];
    store.profiles = [];
    const res = makeRes();
    await usersSearchHandler(
      makeReq({ method: 'GET', query: { q: 'alice' } }, true),
      res
    );
    expect(res.statusCode).toBe(200);
    const players = (res.body as any).players;
    expect(players.map((p: any) => p.id)).toEqual(['u1']);
    expect(players[0].email).toBe('alice.smith@example.com');
  });

  it('200 finds players by battle_tag in team_members', async () => {
    setAuthListUsers([]);
    store.team_members = [
      {
        user_id: 'u-bt',
        battle_tag: 'Mercy#1234',
        team: { id: 't1', name: 'Alpha' },
      },
    ] as any;
    store.profiles = [];
    setAdminUser('u-bt', 'mercy@example.com');

    const res = makeRes();
    await usersSearchHandler(
      makeReq({ method: 'GET', query: { q: 'mercy' } }, true),
      res
    );
    const players = (res.body as any).players;
    expect(players.length).toBeGreaterThan(0);
    const found = players.find((p: any) => p.id === 'u-bt');
    expect(found.battle_tag).toBe('Mercy#1234');
    expect(found.team_name).toBe('Alpha');
    expect(found.email).toBe('mercy@example.com');
  });

  it('200 deduplicates candidates across sources', async () => {
    setAuthListUsers([
      { id: 'shared', email: 'shared@example.com' } as any,
    ]);
    store.team_members = [
      {
        user_id: 'shared',
        battle_tag: 'Tag#0001',
        team: { id: 't1', name: 'Alpha' },
      },
    ] as any;
    store.profiles = [];

    const res = makeRes();
    await usersSearchHandler(
      makeReq({ method: 'GET', query: { q: 'shared' } }, true),
      res
    );
    const players = (res.body as any).players;
    const sharedCount = players.filter((p: any) => p.id === 'shared').length;
    expect(sharedCount).toBe(1);
  });

  it('200 with empty results when no source matches', async () => {
    setAuthListUsers([]);
    store.team_members = [];
    store.profiles = [];
    const res = makeRes();
    await usersSearchHandler(
      makeReq({ method: 'GET', query: { q: 'unmatched' } }, true),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).players).toEqual([]);
  });
});

/* -----------------------------------------------------------
 * /api/demandes/join
 * ---------------------------------------------------------*/

describe('/api/demandes/join', () => {
  it('401 without token', async () => {
    const res = makeRes();
    await demandesJoinHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('GET 200 returns own join demandes', async () => {
    setAuthUser({ id: 'user-1' });
    store.demandes = [
      {
        id: 'd1',
        user_id: 'user-1',
        type: 'join',
        status: 'pending',
        created_at: '2026',
      },
      {
        id: 'd2',
        user_id: 'user-1',
        type: 'captain_request',
        status: 'pending',
        created_at: '2026',
      },
      {
        id: 'd3',
        user_id: 'other',
        type: 'join',
        status: 'pending',
        created_at: '2026',
      },
    ] as any;
    const res = makeRes();
    await demandesJoinHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).demandes.map((d: any) => d.id)).toEqual(['d1']);
  });

  it('POST 400 when teamId missing', async () => {
    setAuthUser({ id: 'user-1' });
    const res = makeRes();
    await demandesJoinHandler(
      makeReq({ method: 'POST', body: {} }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when message too long', async () => {
    setAuthUser({ id: 'user-1' });
    const res = makeRes();
    await demandesJoinHandler(
      makeReq(
        {
          method: 'POST',
          body: { teamId: 'team-x', message: 'x'.repeat(1001) },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when team does not exist', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [];
    const res = makeRes();
    await demandesJoinHandler(
      makeReq(
        { method: 'POST', body: { teamId: 'unknown' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when team is not joinable', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      {
        id: 'team-1',
        name: 'Closed',
        is_active: true,
        is_joinable: false,
      },
    ] as any;
    const res = makeRes();
    await demandesJoinHandler(
      makeReq(
        { method: 'POST', body: { teamId: 'team-1' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when user is already member of a team', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', name: 'Open', is_active: true, is_joinable: true },
    ] as any;
    store.team_members = [
      { id: 'tm1', user_id: 'user-1', team_id: 'team-other' },
    ] as any;
    const res = makeRes();
    await demandesJoinHandler(
      makeReq(
        { method: 'POST', body: { teamId: 'team-1' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when an existing pending demande for the same team', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', name: 'Open', is_active: true, is_joinable: true },
    ] as any;
    store.team_members = [];
    store.demandes = [
      {
        id: 'existing',
        user_id: 'user-1',
        type: 'join',
        status: 'pending',
        team_id: 'team-1',
      },
    ] as any;
    const res = makeRes();
    await demandesJoinHandler(
      makeReq({ method: 'POST', body: { teamId: 'team-1' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).existingDemandeId).toBe('existing');
  });

  it('POST 201 creates a join demande with desired_role default to player', async () => {
    setAuthUser({
      id: 'user-1',
      email: 'me@me.com',
      user_metadata: { display_name: 'Me' },
    });
    store.teams = [
      { id: 'team-1', name: 'Open', is_active: true, is_joinable: true },
    ] as any;
    store.team_members = [];
    store.demandes = [];
    const res = makeRes();
    await demandesJoinHandler(
      makeReq(
        { method: 'POST', body: { teamId: 'team-1' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((store.demandes as any)[0].payload.desired_role).toBe('player');
  });

  it('POST 201 normalizes desiredRole to substitute', async () => {
    setAuthUser({ id: 'user-1', email: 'me@me.com', user_metadata: {} });
    store.teams = [
      { id: 'team-1', name: 'Open', is_active: true, is_joinable: true },
    ] as any;
    store.team_members = [];
    store.demandes = [];
    const res = makeRes();
    await demandesJoinHandler(
      makeReq(
        {
          method: 'POST',
          body: { teamId: 'team-1', desiredRole: 'substitute' },
        },
        true
      ),
      res
    );
    expect((store.demandes as any)[0].payload.desired_role).toBe('substitute');
  });
});

/* -----------------------------------------------------------
 * /api/admin/adherents
 * ---------------------------------------------------------*/

describe('/api/admin/adherents', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('admin')] as any;
  });

  it('GET 200 lists adherents with stats', async () => {
    store.adherents = [
      {
        id: 'a1',
        first_name: 'A',
        last_name: 'Smith',
        email: 'a@a.com',
        is_active: true,
        payment_status: 'paid',
        current_year: new Date().getFullYear(),
      },
      {
        id: 'a2',
        first_name: 'B',
        last_name: 'Jones',
        email: 'b@b.com',
        is_active: true,
        payment_status: 'pending',
        current_year: new Date().getFullYear(),
      },
    ] as any;
    const res = makeRes();
    await adherentsHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.items).toHaveLength(2);
    expect(body.stats.total).toBe(2);
    expect(body.stats.paid).toBe(1);
    expect(body.stats.pending).toBe(1);
  });

  it('GET filters by paymentStatus', async () => {
    store.adherents = [
      {
        id: 'a1',
        first_name: 'A',
        last_name: 'A',
        email: 'a@a.com',
        is_active: true,
        payment_status: 'paid',
        current_year: 2026,
      },
      {
        id: 'a2',
        first_name: 'B',
        last_name: 'B',
        email: 'b@b.com',
        is_active: true,
        payment_status: 'pending',
        current_year: 2026,
      },
    ] as any;
    const res = makeRes();
    await adherentsHandler(
      makeReq(
        { method: 'GET', query: { paymentStatus: 'paid' } },
        true
      ),
      res
    );
    expect((res.body as any).items.map((i: any) => i.id)).toEqual(['a1']);
  });

  it('POST 400 when required fields missing', async () => {
    const res = makeRes();
    await adherentsHandler(
      makeReq(
        { method: 'POST', body: { firstName: 'X' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when email already exists', async () => {
    store.adherents = [
      { id: 'a1', email: 'taken@example.com' },
    ] as any;
    const res = makeRes();
    await adherentsHandler(
      makeReq(
        {
          method: 'POST',
          body: {
            firstName: 'A',
            lastName: 'B',
            email: 'TAKEN@example.com', // case-insensitive lookup
          },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 201 creates with sensible defaults and logs', async () => {
    store.adherents = [];
    const res = makeRes();
    await adherentsHandler(
      makeReq(
        {
          method: 'POST',
          body: {
            firstName: ' Alice ',
            lastName: ' Doe ',
            email: 'Alice@Example.com',
            paymentAmount: 50,
          },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(201);
    const inserted = (store.adherents as any)[0];
    expect(inserted.first_name).toBe('Alice');
    expect(inserted.email).toBe('alice@example.com');
    expect(inserted.country).toBe('France');
    expect(inserted.role).toBe('member');
    expect(inserted.payment_status).toBe('pending');
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await adherentsHandler(makeReq({ method: 'PATCH' }, true), res);
    expect(res.statusCode).toBe(405);
  });

  it('GET filters by paymentStatus, year, role, active', async () => {
    store.adherents = [
      {
        id: 'a1',
        first_name: 'A',
        last_name: 'B',
        email: 'a@b.com',
        payment_status: 'paid',
        current_year: 2026,
        role: 'member',
        is_active: true,
      },
      {
        id: 'a2',
        first_name: 'C',
        last_name: 'D',
        email: 'c@d.com',
        payment_status: 'pending',
        current_year: 2025,
        role: 'volunteer',
        is_active: false,
      },
    ] as any;
    const res = makeRes();
    await adherentsHandler(
      makeReq(
        {
          method: 'GET',
          query: {
            paymentStatus: 'paid',
            year: '2026',
            role: 'member',
            active: 'true',
            search: 'a',
          },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('GET filters with active=false', async () => {
    store.adherents = [
      {
        id: 'a1',
        first_name: 'A',
        last_name: 'B',
        email: 'a@b.com',
        is_active: false,
      },
    ] as any;
    const res = makeRes();
    await adherentsHandler(
      makeReq({ method: 'GET', query: { active: 'false' } }, true),
      res
    );
    expect(res.statusCode).toBe(200);
  });
});
