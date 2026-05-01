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

const { sendWelcomeEmail, notifyAnnouncement } = vi.hoisted(() => ({
  sendWelcomeEmail: vi.fn(async () => undefined),
  notifyAnnouncement: vi.fn(async () => undefined),
}));

vi.mock('@/utils/email', () => ({ sendWelcomeEmail }));
vi.mock('@/utils/discord', () => ({ notifyAnnouncement }));

const { authCreateUser } = vi.hoisted(() => ({
  authCreateUser: vi.fn(async (input: any) => ({
    data: { user: { id: 'user-new', email: input.email } },
    error: null as any,
  })),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  supabaseAdmin,
} from './__helpers__/supabaseMock';

// `withStaffRoute` reads supabaseAdmin.auth.admin.createUser — extend the mock.
(supabaseAdmin.auth.admin as any).createUser = authCreateUser;

import { invalidateStaffCache } from '../../utils/staff';

import adminUsersHandler from '../../pages/api/admin/users/index';
import adminCastMembersHandler from '../../pages/api/admin/cast-members/index';
import adminAnnouncementsHandler from '../../pages/api/admin/announcements/index';
import publicTeamsHandler from '../../pages/api/teams/index';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'admin'
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

// staff.ts caches token→user resolutions for 60s in a module-level Map. Use a
// fresh token per request so each test sees a cache miss and reads the live
// _authUser state.
let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

/** Build a request that passes the CSRF check (Bearer token short-circuits it) */
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

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  sendWelcomeEmail.mockClear();
  notifyAnnouncement.mockClear();
  authCreateUser.mockClear();
  // Default: an admin user is signed in and corresponds to staff row.
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
});

/* -----------------------------------------------------------
 * /api/admin/users — POST creates a Supabase user
 * ---------------------------------------------------------*/

describe('POST /api/admin/users', () => {
  it('returns 401 when unauthenticated', async () => {
    setAuthUser(null);
    const res = makeRes();
    await adminUsersHandler(
      makeAuthedReq({ method: 'POST', body: { email: 'x@y.com' } }),
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when role is below admin', async () => {
    store.staff = [makeStaffRow('caster')] as any;
    const res = makeRes();
    await adminUsersHandler(
      makeAuthedReq({ method: 'POST', body: { email: 'x@y.com' } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('returns 405 on non-POST', async () => {
    const res = makeRes();
    await adminUsersHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 when email is missing', async () => {
    const res = makeRes();
    await adminUsersHandler(makeAuthedReq({ method: 'POST', body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('creates a user, sends welcome email, and returns 201', async () => {
    const res = makeRes();
    await adminUsersHandler(
      makeAuthedReq({
        method: 'POST',
        body: { email: 'new@example.com', display_name: 'Newbie' },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    expect(authCreateUser).toHaveBeenCalledOnce();
    const args = authCreateUser.mock.calls[0][0] as any;
    expect(args.email).toBe('new@example.com');
    expect(args.email_confirm).toBe(true);
    expect(args.user_metadata.display_name).toBe('Newbie');

    expect(sendWelcomeEmail).toHaveBeenCalledWith(
      'new@example.com',
      expect.any(String)
    );
    expect((res.body as any).passwordSentByEmail).toBe(true);
  });

  it('reports passwordSentByEmail=false when the welcome email fails', async () => {
    sendWelcomeEmail.mockRejectedValueOnce(new Error('smtp down'));
    const res = makeRes();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await adminUsersHandler(
      makeAuthedReq({
        method: 'POST',
        body: { email: 'new@example.com' },
      }),
      res
    );

    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(201);
    expect((res.body as any).passwordSentByEmail).toBe(false);
  });

  it('returns 500 when createUser fails', async () => {
    authCreateUser.mockResolvedValueOnce({
      data: { user: null as any },
      error: { message: 'duplicate' } as any,
    });
    const res = makeRes();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await adminUsersHandler(
      makeAuthedReq({
        method: 'POST',
        body: { email: 'dup@example.com' },
      }),
      res
    );

    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(500);
  });
});

/* -----------------------------------------------------------
 * /api/admin/cast-members — GET + POST
 * ---------------------------------------------------------*/

describe('/api/admin/cast-members', () => {
  it('GET returns active items by default', async () => {
    store.cast_members = [
      { id: 'c1', name: 'A', is_active: true, sort_order: 1 },
      { id: 'c2', name: 'B', is_active: false, sort_order: 2 },
    ] as any;

    const res = makeRes();
    await adminCastMembersHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const items = (res.body as any).items;
    expect(items.map((i: any) => i.id)).toEqual(['c1']);
  });

  it('GET ?includeInactive=true returns inactive too', async () => {
    store.cast_members = [
      { id: 'c1', name: 'A', is_active: true, sort_order: 1 },
      { id: 'c2', name: 'B', is_active: false, sort_order: 2 },
    ] as any;

    const res = makeRes();
    await adminCastMembersHandler(
      makeAuthedReq({ method: 'GET', query: { includeInactive: 'true' } }),
      res
    );
    const items = (res.body as any).items;
    expect(items.map((i: any) => i.id).sort()).toEqual(['c1', 'c2']);
  });

  it('POST 400 when name is missing', async () => {
    const res = makeRes();
    await adminCastMembersHandler(
      makeAuthedReq({ method: 'POST', body: {} }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST creates a cast member with auto sort_order', async () => {
    store.cast_members = [
      { id: 'c1', name: 'A', is_active: true, sort_order: 5 },
    ] as any;

    const res = makeRes();
    await adminCastMembersHandler(
      makeAuthedReq({
        method: 'POST',
        body: {
          name: '  New Cast  ',
          twitchUrl: 'https://twitch.tv/new',
          imageUrl: 'javascript:alert(1)', // sanitized -> null
        },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    const inserted = (store.cast_members as any).find(
      (c: any) => c.name === 'New Cast'
    );
    expect(inserted).toBeTruthy();
    expect(inserted.twitch_url).toBe('https://twitch.tv/new');
    expect(inserted.image_url).toBeNull();
    expect(inserted.sort_order).toBe(6); // 5 + 1
  });

  it('returns 405 on unsupported methods', async () => {
    const res = makeRes();
    await adminCastMembersHandler(makeAuthedReq({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET,POST');
  });
});

/* -----------------------------------------------------------
 * /api/admin/announcements — GET + POST + Discord ping
 * ---------------------------------------------------------*/

describe('/api/admin/announcements', () => {
  it('GET 200 lists active announcements', async () => {
    store.announcements = [
      { id: 'a1', title: 'Ann', is_active: true, message: 'hello' },
    ] as any;
    const res = makeRes();
    await adminAnnouncementsHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).items).toHaveLength(1);
  });

  it('POST 400 when title or message is missing', async () => {
    const res = makeRes();
    await adminAnnouncementsHandler(
      makeAuthedReq({ method: 'POST', body: { title: 'only-title' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 201 creates announcement and triggers Discord when active', async () => {
    const res = makeRes();
    await adminAnnouncementsHandler(
      makeAuthedReq({
        method: 'POST',
        body: {
          title: 'Hello',
          message: 'World',
          ctaUrl: 'https://example.com',
          isActive: true,
        },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    await new Promise((r) => setImmediate(r));
    expect(notifyAnnouncement).toHaveBeenCalledOnce();
  });

  it('POST does NOT trigger Discord for inactive announcements', async () => {
    const res = makeRes();
    await adminAnnouncementsHandler(
      makeAuthedReq({
        method: 'POST',
        body: { title: 'Hi', message: 'Quiet', isActive: false },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    await new Promise((r) => setImmediate(r));
    expect(notifyAnnouncement).not.toHaveBeenCalled();
  });

  it('POST sanitizes invalid CTA url to null', async () => {
    const res = makeRes();
    await adminAnnouncementsHandler(
      makeAuthedReq({
        method: 'POST',
        body: {
          title: 'A',
          message: 'B',
          ctaUrl: 'javascript:alert(1)',
        },
      }),
      res
    );
    const inserted = (store.announcements as any)[0];
    expect(inserted.cta_url).toBeNull();
  });

  it('POST parses startsAt / endsAt to ISO and ignores garbage dates', async () => {
    const res = makeRes();
    await adminAnnouncementsHandler(
      makeAuthedReq({
        method: 'POST',
        body: {
          title: 'A',
          message: 'B',
          startsAt: '2026-04-01T10:00:00Z',
          endsAt: 'not-a-date',
        },
      }),
      res
    );
    const inserted = (store.announcements as any)[0];
    expect(inserted.starts_at).toMatch(/2026-04-01/);
    expect(inserted.ends_at).toBeNull();
  });
});

/* -----------------------------------------------------------
 * /api/teams — public listing
 * ---------------------------------------------------------*/

describe('GET /api/teams (public)', () => {
  it('returns 405 on non-GET', async () => {
    const res = makeRes();
    await publicTeamsHandler(makeAuthedReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('lists all teams when no filters', async () => {
    store.teams = [
      { id: 't1', name: 'Alpha', is_joinable: true },
      { id: 't2', name: 'Beta', is_joinable: false },
    ] as any;
    const res = makeRes();
    await publicTeamsHandler(makeAuthedReq(), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).teams).toHaveLength(2);
  });

  it('filters by joinable=1', async () => {
    store.teams = [
      { id: 't1', name: 'Alpha', is_joinable: true },
      { id: 't2', name: 'Beta', is_joinable: false },
    ] as any;
    const res = makeRes();
    await publicTeamsHandler(makeAuthedReq({ query: { joinable: '1' } }), res);
    const teams = (res.body as any).teams;
    expect(teams).toHaveLength(1);
    expect(teams[0].id).toBe('t1');
  });

  it('filters by country', async () => {
    store.teams = [
      { id: 't1', name: 'Alpha', country: 'FR' },
      { id: 't2', name: 'Beta', country: 'BE' },
    ] as any;
    const res = makeRes();
    await publicTeamsHandler(makeAuthedReq({ query: { country: 'FR' } }), res);
    const teams = (res.body as any).teams;
    expect(teams).toHaveLength(1);
    expect(teams[0].id).toBe('t1');
  });

  it('exposes total count when present', async () => {
    store.teams = [
      { id: 't1', name: 'Alpha' },
      { id: 't2', name: 'Beta' },
    ] as any;
    const res = makeRes();
    await publicTeamsHandler(makeAuthedReq(), res);
    expect((res.body as any).total).toBe(2);
  });

  it('flattens team_members count into member_count', async () => {
    store.teams = [
      { id: 't1', name: 'Alpha', team_members: [{ count: 5 }] },
    ] as any;
    const res = makeRes();
    await publicTeamsHandler(makeAuthedReq(), res);
    expect((res.body as any).teams[0].member_count).toBe(5);
  });
});
