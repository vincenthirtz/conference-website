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

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import siteSettingsHandler from '../../pages/api/site-settings';
import announcementsPublicHandler from '../../pages/api/announcements/index';
import toggleJoinableHandler from '../../pages/api/teams/toggle-joinable';
import partnershipRequestsHandler from '../../pages/api/admin/partnership-requests/index';
import supportTicketsHandler from '../../pages/api/admin/support/tickets';

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
});

/* -----------------------------------------------------------
 * /api/site-settings (public)
 * ---------------------------------------------------------*/

describe('GET /api/site-settings', () => {
  it('405 on non-GET', async () => {
    const res = makeRes();
    await siteSettingsHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('returns all settings as a key/value object', async () => {
    store.site_settings = [
      { key: 'maintenance', value: 'on' },
      { key: 'theme', value: 'dark' },
    ] as any;
    const res = makeRes();
    await siteSettingsHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).maintenance).toBe('on');
    expect((res.body as any).theme).toBe('dark');
  });

  it('returns 400 for an invalid key format', async () => {
    const res = makeRes();
    await siteSettingsHandler(
      makeReq({ method: 'GET', query: { key: 'bad-key!' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns the value for a specific valid key', async () => {
    store.site_settings = [
      { key: 'maintenance', value: 'on' },
    ] as any;
    const res = makeRes();
    await siteSettingsHandler(
      makeReq({ method: 'GET', query: { key: 'maintenance' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).key).toBe('maintenance');
    expect((res.body as any).value).toBe('on');
  });

  it('returns null value when key is unknown', async () => {
    store.site_settings = [];
    const res = makeRes();
    await siteSettingsHandler(
      makeReq({ method: 'GET', query: { key: 'nope' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).value).toBeNull();
  });
});

/* -----------------------------------------------------------
 * /api/announcements (public)
 * ---------------------------------------------------------*/

describe('GET /api/announcements', () => {
  it('405 on non-GET', async () => {
    const res = makeRes();
    await announcementsPublicHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('lists active announcements with sanitized URLs', async () => {
    store.announcements = [
      {
        id: 'a1',
        title: 'A',
        message: 'M',
        cta_label: 'Click',
        cta_url: 'https://example.com',
        priority: 1,
        is_active: true,
        starts_at: null,
        ends_at: null,
        created_at: '2026-04-01',
        updated_at: '2026-04-01',
      },
      {
        id: 'a2',
        title: 'Bad',
        message: 'M',
        cta_label: null,
        cta_url: 'javascript:alert(1)',
        priority: 0,
        is_active: true,
        starts_at: null,
        ends_at: null,
        created_at: '2026-04-01',
        updated_at: '2026-04-01',
      },
    ] as any;
    const res = makeRes();
    await announcementsPublicHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const items = (res.body as any).items;
    expect(items).toHaveLength(2);
    const a2 = items.find((x: any) => x.id === 'a2');
    expect(a2.ctaUrl).toBeNull(); // unsafe URL stripped
  });

  it('hides inactive announcements', async () => {
    store.announcements = [
      { id: 'a1', is_active: true, title: 'A', message: 'M', priority: 0, created_at: '2026', updated_at: '2026' },
      { id: 'a2', is_active: false, title: 'B', message: 'M', priority: 0, created_at: '2026', updated_at: '2026' },
    ] as any;
    const res = makeRes();
    await announcementsPublicHandler(makeReq(), res);
    expect((res.body as any).items.map((i: any) => i.id)).toEqual(['a1']);
  });
});

/* -----------------------------------------------------------
 * /api/teams/toggle-joinable
 * ---------------------------------------------------------*/

describe('POST /api/teams/toggle-joinable', () => {
  it('405 on non-POST', async () => {
    setAuthUser({ id: 'user-1' });
    const res = makeRes();
    await toggleJoinableHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(405);
  });

  it('401 without Bearer token', async () => {
    const res = makeRes();
    await toggleJoinableHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('403 when user is not captain of an active team', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [];
    const res = makeRes();
    await toggleJoinableHandler(
      makeReq({ method: 'POST', body: {} }, true),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('200 toggles is_joinable when no body value provided', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 't1', captain_id: 'user-1', is_active: true, is_joinable: false, name: 'A' },
    ] as any;
    const res = makeRes();
    await toggleJoinableHandler(
      makeReq({ method: 'POST', body: {} }, true),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).is_joinable).toBe(true);
    expect((store.teams[0] as any).is_joinable).toBe(true);
  });

  it('200 sets explicit value when body provides one', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [
      { id: 't1', captain_id: 'user-1', is_active: true, is_joinable: true, name: 'A' },
    ] as any;
    const res = makeRes();
    await toggleJoinableHandler(
      makeReq({ method: 'POST', body: { joinable: false } }, true),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).is_joinable).toBe(false);
  });
});

/* -----------------------------------------------------------
 * /api/admin/partnership-requests
 * ---------------------------------------------------------*/

describe('GET /api/admin/partnership-requests', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('admin')] as any;
  });

  it('405 on non-GET', async () => {
    const res = makeRes();
    await partnershipRequestsHandler(
      makeReq({ method: 'POST' }, true),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('200 returns items + counts grouped by status', async () => {
    store.partnership_requests = [
      { id: 'r1', status: 'open', category: 'super', created_at: '2026' },
      { id: 'r2', status: 'open', category: 'major', created_at: '2026' },
      { id: 'r3', status: 'resolved', category: 'cultural', created_at: '2026' },
    ] as any;
    const res = makeRes();
    await partnershipRequestsHandler(makeReq(undefined, true), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.items).toHaveLength(3);
    expect(body.counts.open).toBe(2);
    expect(body.counts.resolved).toBe(1);
  });

  it('filters by status', async () => {
    store.partnership_requests = [
      { id: 'r1', status: 'open', category: 'super', created_at: '2026' },
      { id: 'r2', status: 'resolved', category: 'super', created_at: '2026' },
    ] as any;
    const res = makeRes();
    await partnershipRequestsHandler(
      makeReq({ query: { status: 'resolved' } }, true),
      res
    );
    expect((res.body as any).items.map((i: any) => i.id)).toEqual(['r2']);
  });

  it('filters by category', async () => {
    store.partnership_requests = [
      { id: 'r1', status: 'open', category: 'super', created_at: '2026' },
      { id: 'r2', status: 'open', category: 'major', created_at: '2026' },
    ] as any;
    const res = makeRes();
    await partnershipRequestsHandler(
      makeReq({ query: { category: 'major' } }, true),
      res
    );
    expect((res.body as any).items.map((i: any) => i.id)).toEqual(['r2']);
  });
});

/* -----------------------------------------------------------
 * /api/admin/support/tickets
 * ---------------------------------------------------------*/

describe('GET /api/admin/support/tickets', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('manager')] as any;
  });

  it('405 on non-GET', async () => {
    const res = makeRes();
    await supportTicketsHandler(
      makeReq({ method: 'POST' }, true),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('200 returns tickets with total', async () => {
    store.support_tickets = [
      {
        id: 't1',
        status: 'open',
        severity: 'high',
        category: 'dispute',
        tournament_id: 'tour-1',
        created_at: '2026-04-01',
      },
      {
        id: 't2',
        status: 'resolved',
        severity: 'low',
        category: 'other',
        tournament_id: null,
        created_at: '2026-04-02',
      },
    ] as any;
    const res = makeRes();
    await supportTicketsHandler(makeReq(undefined, true), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).tickets).toHaveLength(2);
    expect((res.body as any).total).toBe(2);
  });

  it('filters by status', async () => {
    store.support_tickets = [
      { id: 't1', status: 'open', severity: 'medium', category: 'other', created_at: '2026' },
      { id: 't2', status: 'closed', severity: 'medium', category: 'other', created_at: '2026' },
    ] as any;
    const res = makeRes();
    await supportTicketsHandler(
      makeReq({ query: { status: 'open' } }, true),
      res
    );
    expect((res.body as any).tickets.map((t: any) => t.id)).toEqual(['t1']);
  });

  it('ignores invalid filter values', async () => {
    store.support_tickets = [
      { id: 't1', status: 'open', severity: 'medium', category: 'other', created_at: '2026' },
    ] as any;
    const res = makeRes();
    await supportTicketsHandler(
      makeReq({ query: { status: 'bogus', severity: 'fake' } }, true),
      res
    );
    expect((res.body as any).tickets).toHaveLength(1);
  });

  it('filters by tournament_id when given', async () => {
    store.support_tickets = [
      { id: 't1', status: 'open', severity: 'low', category: 'other', tournament_id: 'tour-1', created_at: '2026' },
      { id: 't2', status: 'open', severity: 'low', category: 'other', tournament_id: 'tour-2', created_at: '2026' },
    ] as any;
    const res = makeRes();
    await supportTicketsHandler(
      makeReq({ query: { tournament_id: 'tour-2' } }, true),
      res
    );
    expect((res.body as any).tickets.map((t: any) => t.id)).toEqual(['t2']);
  });
});
