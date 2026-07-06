import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

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
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import announcementByIdHandler from '../../pages/api/admin/announcements/[id]';
import partnerByIdHandler from '../../pages/api/admin/partners/[id]';
// news/[id] re-imported lazily inside its describe block to isolate any module
// load issue from other handlers.

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

function makeReq(over: Partial<any> = {}, includeAuth = true): any {
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
    ended: false,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => ((res.ended = true), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  // ISR on-demand (utilisé par admin/news sur PUT/DELETE).
  res.revalidated = [] as string[];
  res.revalidate = async (path: string) => {
    res.revalidated.push(path);
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
});

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

/* -----------------------------------------------------------
 * /api/admin/announcements/[id]
 * ---------------------------------------------------------*/

describe('/api/admin/announcements/[id]', () => {
  it('returns 400 for an invalid id', async () => {
    const res = makeRes();
    await announcementByIdHandler(
      makeReq({ method: 'GET', query: { id: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 200 returns the row when found', async () => {
    store.announcements = [
      { id: VALID_UUID, title: 'A', message: 'M', is_active: true },
    ] as any;
    const res = makeRes();
    await announcementByIdHandler(
      makeReq({ method: 'GET', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).title).toBe('A');
  });

  it('GET 404 when row is missing', async () => {
    store.announcements = [];
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await announcementByIdHandler(
      makeReq({ method: 'GET', query: { id: VALID_UUID } }),
      res
    );
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(404);
  });

  it('PATCH 200 updates trimmed fields and sanitized URL', async () => {
    store.announcements = [
      {
        id: VALID_UUID,
        title: 'old',
        message: 'm',
        is_active: false,
        priority: 0,
        cta_url: null,
      },
    ] as any;
    const res = makeRes();
    await announcementByIdHandler(
      makeReq({
        method: 'PATCH',
        query: { id: VALID_UUID },
        body: {
          title: '  new title  ',
          message: '  new msg  ',
          isActive: true,
          ctaUrl: 'javascript:alert(1)',
          startsAt: '2026-04-01T10:00:00Z',
          endsAt: 'not-a-date',
          priority: 5,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const a = (store.announcements as any)[0];
    expect(a.title).toBe('new title');
    expect(a.is_active).toBe(true);
    expect(a.cta_url).toBeNull();
    expect(a.starts_at).toMatch(/2026-04-01/);
    expect(a.ends_at).toBeNull();
    expect(a.priority).toBe(5);
  });

  it('DELETE 204 removes the row', async () => {
    store.announcements = [{ id: VALID_UUID }] as any;
    const res = makeRes();
    await announcementByIdHandler(
      makeReq({ method: 'DELETE', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(204);
    expect(store.announcements.length).toBe(0);
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await announcementByIdHandler(
      makeReq({ method: 'POST', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/admin/partners/[id]
 * ---------------------------------------------------------*/

describe('/api/admin/partners/[id]', () => {
  it('returns 400 for invalid id', async () => {
    const res = makeRes();
    await partnerByIdHandler(
      makeReq({ method: 'GET', query: { id: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 404 when partner not found', async () => {
    store.partners = [];
    const res = makeRes();
    await partnerByIdHandler(
      makeReq({ method: 'GET', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('GET 200 returns the partner', async () => {
    store.partners = [
      { id: VALID_UUID, name: 'Alpha', category: 'super' },
    ] as any;
    const res = makeRes();
    await partnerByIdHandler(
      makeReq({ method: 'GET', query: { id: VALID_UUID } }),
      res
    );
    expect((res.body as any).name).toBe('Alpha');
  });

  it('PATCH 400 when no fields provided', async () => {
    store.partners = [{ id: VALID_UUID, name: 'A' }] as any;
    const res = makeRes();
    await partnerByIdHandler(
      makeReq({ method: 'PATCH', query: { id: VALID_UUID }, body: {} }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 400 when category invalid', async () => {
    store.partners = [{ id: VALID_UUID, name: 'A' }] as any;
    const res = makeRes();
    await partnerByIdHandler(
      makeReq({
        method: 'PATCH',
        query: { id: VALID_UUID },
        body: { category: 'bogus' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 200 updates fields and logs action', async () => {
    store.partners = [
      { id: VALID_UUID, name: 'old', category: 'major' },
    ] as any;
    const res = makeRes();
    await partnerByIdHandler(
      makeReq({
        method: 'PATCH',
        query: { id: VALID_UUID },
        body: {
          name: 'new',
          logoUrl: 'https://example.com/logo.png',
          isActive: true,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.partners[0] as any).name).toBe('new');
    expect((store.partners[0] as any).logo_url).toBe(
      'https://example.com/logo.png'
    );
    expect(logStaffActionMock).toHaveBeenCalled();
  });

  it('DELETE 404 when partner not found', async () => {
    store.partners = [];
    const res = makeRes();
    await partnerByIdHandler(
      makeReq({ method: 'DELETE', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('DELETE 200 removes and logs', async () => {
    store.partners = [{ id: VALID_UUID, name: 'Alpha' }] as any;
    const res = makeRes();
    await partnerByIdHandler(
      makeReq({ method: 'DELETE', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.partners.length).toBe(0);
    expect(logStaffActionMock).toHaveBeenCalled();
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await partnerByIdHandler(
      makeReq({ method: 'POST', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/admin/news/[id]  (note: PUT, not PATCH)
 * ---------------------------------------------------------*/

describe('/api/admin/news/[id]', () => {
  // Resolved lazily so that a possible failure to import this module won't
  // break the whole suite at load time.
  let newsByIdHandler: any;
  beforeEach(async () => {
    const mod = await import('../../pages/api/admin/news/[id]');
    newsByIdHandler = mod.default;
  });

  it('returns 400 for invalid id', async () => {
    const res = makeRes();
    await newsByIdHandler(
      makeReq({ method: 'GET', query: { id: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 404 when news missing', async () => {
    store.news = [];
    const res = makeRes();
    await newsByIdHandler(
      makeReq({ method: 'GET', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('GET 200 returns the article', async () => {
    store.news = [
      { id: VALID_UUID, title: 'T', content: 'C', tag: 'general' },
    ] as any;
    const res = makeRes();
    await newsByIdHandler(
      makeReq({ method: 'GET', query: { id: VALID_UUID } }),
      res
    );
    expect((res.body as any).title).toBe('T');
  });

  it('PUT 400 when title or content missing', async () => {
    const res = makeRes();
    await newsByIdHandler(
      makeReq({
        method: 'PUT',
        query: { id: VALID_UUID },
        body: { title: 'only' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 200 updates news, slugifying title and preserving published_at', async () => {
    const oldPub = '2026-04-01T10:00:00.000Z';
    store.news = [
      {
        id: VALID_UUID,
        title: 'Old',
        content: 'old body',
        tag: 'general',
        status: 'published',
        published_at: oldPub,
      },
    ] as any;
    const res = makeRes();
    await newsByIdHandler(
      makeReq({
        method: 'PUT',
        query: { id: VALID_UUID },
        body: {
          title: 'New Headline!',
          content: 'New body',
          status: 'published',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const n = (store.news as any)[0];
    expect(n.title).toBe('New Headline!');
    expect(n.slug).toBe('new-headline');
    // published_at preserved when no override is given
    expect(n.published_at).toBe(oldPub);
  });

  it('PUT moves status from published → draft and keeps the published_at value', async () => {
    const oldPub = '2026-04-01T10:00:00.000Z';
    store.news = [
      {
        id: VALID_UUID,
        title: 'X',
        content: 'X',
        tag: 'general',
        status: 'published',
        published_at: oldPub,
      },
    ] as any;
    const res = makeRes();
    await newsByIdHandler(
      makeReq({
        method: 'PUT',
        query: { id: VALID_UUID },
        body: {
          title: 'X',
          content: 'X',
          status: 'draft',
        },
      }),
      res
    );
    const n = (store.news as any)[0];
    expect(n.status).toBe('draft');
    expect(n.published_at).toBe(oldPub);
  });

  it('DELETE 204 removes', async () => {
    store.news = [{ id: VALID_UUID, title: 'X', content: 'X' }] as any;
    const res = makeRes();
    await newsByIdHandler(
      makeReq({ method: 'DELETE', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(204);
    expect(store.news.length).toBe(0);
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await newsByIdHandler(
      makeReq({ method: 'PATCH', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('PUT 200 publishes news with explicit publishedAt', async () => {
    store.news = [
      {
        id: VALID_UUID,
        title: 'Old',
        content: 'X',
        slug: 'old',
        tag: 'general',
        status: 'draft',
        published_at: null,
      },
    ] as any;
    const res = makeRes();
    await newsByIdHandler(
      makeReq({
        method: 'PUT',
        query: { id: VALID_UUID },
        body: {
          title: 'Now',
          content: 'X',
          status: 'published',
          publishedAt: '2026-04-01T12:00:00Z',
          tag: 'tournaments',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.news[0] as any).published_at).toBe(
      '2026-04-01T12:00:00.000Z'
    );
    expect((store.news[0] as any).tag).toBe('tournaments');
  });

  it('PUT 200 first-time publish without publishedAt uses current time', async () => {
    store.news = [
      {
        id: VALID_UUID,
        title: 'X',
        content: 'X',
        status: 'draft',
        published_at: null,
        tag: 'general',
      },
    ] as any;
    const res = makeRes();
    await newsByIdHandler(
      makeReq({
        method: 'PUT',
        query: { id: VALID_UUID },
        body: {
          title: 'X',
          content: 'X',
          status: 'published',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.news[0] as any).published_at).toBeTruthy();
  });

  it('PUT keeps tag from existing record when none provided', async () => {
    store.news = [
      {
        id: VALID_UUID,
        title: 'X',
        content: 'X',
        status: 'draft',
        published_at: null,
        tag: 'community',
      },
    ] as any;
    const res = makeRes();
    await newsByIdHandler(
      makeReq({
        method: 'PUT',
        query: { id: VALID_UUID },
        body: { title: 'X', content: 'X', status: 'draft' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.news[0] as any).tag).toBe('community');
  });

  it('PUT slug derived from explicit slug field if provided', async () => {
    store.news = [
      { id: VALID_UUID, title: 'X', content: 'X', status: 'draft', tag: 'g' },
    ] as any;
    const res = makeRes();
    await newsByIdHandler(
      makeReq({
        method: 'PUT',
        query: { id: VALID_UUID },
        body: {
          title: 'Some Title',
          content: 'X',
          slug: 'My Custom Slug',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.news[0] as any).slug).toBe('my-custom-slug');
  });
});
