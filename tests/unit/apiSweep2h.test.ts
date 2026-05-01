// Sweep 2h: scrapers + remaining 0% admin/public handlers.
//
// Targets:
//  - pages/api/cast-members.ts (public)
//  - pages/api/blizzard-news.ts (scraper, fetch-mocked)
//  - pages/api/blizzard-media.ts (scraper + static fallback)
//  - pages/api/patch-notes.ts (scraper)
//  - pages/api/admin/adherents/[id].ts (CRUD)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  supabaseAdmin,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import publicCastMembersHandler from '../../pages/api/cast-members';
import blizzardNewsHandler from '../../pages/api/blizzard-news';
import blizzardMediaHandler from '../../pages/api/blizzard-media';
import patchNotesHandler from '../../pages/api/patch-notes';
import adherentIdHandler from '../../pages/api/admin/adherents/[id]';

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
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h' },
    query: {},
    body: {},
    ...over,
  };
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
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
});

/* -----------------------------------------------------------
 * /api/cast-members (public)
 * ---------------------------------------------------------*/

describe('/api/cast-members (public)', () => {
  it('405 on POST', async () => {
    const res = makeRes();
    await publicCastMembersHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('GET returns active cast members in camelCase', async () => {
    store.cast_members = [
      {
        id: 'c1',
        name: 'A',
        title: 'Caster',
        description: null,
        image_url: 'https://i.test/a.png',
        twitch_url: 'https://twitch.tv/a',
        city: 'Paris',
        is_active: true,
        is_promo: true,
        sort_order: 0,
      },
      {
        id: 'c-inactive',
        name: 'Inactive',
        is_active: false,
        sort_order: 99,
      },
    ] as any;
    const res = makeRes();
    await publicCastMembersHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const items = (res.body as any).items;
    expect(items.length).toBe(1);
    expect(items[0].imageUrl).toBe('https://i.test/a.png');
    expect(items[0].twitchUrl).toBe('https://twitch.tv/a');
    expect(items[0].isPromo).toBe(true);
    expect(res.headers['Cache-Control']).toContain('s-maxage=900');
  });
});

/* -----------------------------------------------------------
 * /api/blizzard-news (scraper)
 * ---------------------------------------------------------*/

describe('/api/blizzard-news', () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch' as any);
  });

  afterEach(() => {
    fetchSpy?.mockRestore?.();
  });

  it('405 on POST', async () => {
    const res = makeRes();
    await blizzardNewsHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('200 with empty array when scrape fails and DB is empty', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await blizzardNewsHandler(makeReq({ method: 'GET' }), res);
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(200);
    expect((res.body as any).items).toEqual([]);
  });

  it('200 returns DB items when scrape fails but DB has data', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network'));
    store.blizzard_news = [
      {
        id: 'n1',
        title: 'News 1',
        date: '8 janvier 2026',
        link: 'https://overwatch.blizzard.com/news/1',
        image_url: null,
        category: 'Update',
        summary: 'Summary',
      },
    ] as any;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await blizzardNewsHandler(
      makeReq({ method: 'GET', query: { limit: '4' } }),
      res
    );
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(200);
    expect((res.body as any).items.length).toBe(1);
  });

  it('200 with successful scrape (HTML containing /news/ links)', async () => {
    const html = `
      <html><body>
        <div class="Card">
          <a href="/fr-fr/news/24252008/foo">
            <h3>Big patch</h3>
            <span>8 janvier 2026</span>
          </a>
        </div>
      </body></html>`;
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => html,
    } as any);
    const res = makeRes();
    await blizzardNewsHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
  });

  it('handles non-OK fetch response (throws inside scrape)', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => '',
    } as any);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await blizzardNewsHandler(makeReq({ method: 'GET' }), res);
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(200); // graceful — falls back to DB
  });
});

/* -----------------------------------------------------------
 * /api/blizzard-media (scraper + static fallback)
 * ---------------------------------------------------------*/

describe('/api/blizzard-media', () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch' as any);
  });

  afterEach(() => {
    fetchSpy?.mockRestore?.();
  });

  it('405 on POST', async () => {
    const res = makeRes();
    await blizzardMediaHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('200 falls back to static media when scrape fails and DB empty', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = makeRes();
    await blizzardMediaHandler(makeReq({ method: 'GET' }), res);
    consoleSpy.mockRestore();
    consoleLogSpy.mockRestore();
    expect(res.statusCode).toBe(200);
    const items = (res.body as any).items;
    expect(items.length).toBeGreaterThan(0);
    // Comics should be in the static fallback
    expect(items.some((i: any) => i.type === 'comic')).toBe(true);
  });

  it('200 filters by type', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = makeRes();
    await blizzardMediaHandler(
      makeReq({ method: 'GET', query: { type: 'music' } }),
      res
    );
    consoleSpy.mockRestore();
    consoleLogSpy.mockRestore();
    expect(res.statusCode).toBe(200);
    const items = (res.body as any).items;
    expect(items.every((i: any) => i.type === 'music')).toBe(true);
  });

  it('200 prefers DB items when DB has >= 10 entries', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network'));
    store.blizzard_media = Array.from({ length: 12 }, (_, i) => ({
      id: `db-${i}`,
      title: `DB Item ${i}`,
      type: 'comic',
      category: 'BD',
      link: `https://x/${i}`,
      thumbnail_url: null,
      description: '',
      parts: 1,
    })) as any;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await blizzardMediaHandler(makeReq({ method: 'GET' }), res);
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(200);
    const items = (res.body as any).items;
    expect(items[0].id.startsWith('db-')).toBe(true);
  });
});

/* -----------------------------------------------------------
 * /api/patch-notes (scraper)
 * ---------------------------------------------------------*/

describe('/api/patch-notes', () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch' as any);
  });

  afterEach(() => {
    fetchSpy?.mockRestore?.();
  });

  it('405 on POST', async () => {
    const res = makeRes();
    await patchNotesHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('200 with empty array when scrape fails and DB empty', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await patchNotesHandler(makeReq({ method: 'GET' }), res);
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(200);
    expect((res.body as any).items).toEqual([]);
  });

  it('200 returns DB items', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network'));
    store.patch_notes = [
      {
        id: 'p1',
        title: 'Patch 1',
        date: '8 janvier 2026',
        link: 'https://overwatch.blizzard.com/patch/1',
        summary: 'desc',
        heroes: [],
      },
    ] as any;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await patchNotesHandler(makeReq({ method: 'GET' }), res);
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(200);
    expect((res.body as any).items.length).toBe(1);
  });

  it('handles non-OK scrape response gracefully', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      text: async () => '',
    } as any);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await patchNotesHandler(makeReq({ method: 'GET' }), res);
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(200);
  });
});

/* -----------------------------------------------------------
 * /api/admin/adherents/[id]
 * ---------------------------------------------------------*/

describe('/api/admin/adherents/[id]', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('admin')] as any;
  });

  it('400 on invalid id', async () => {
    const res = makeRes();
    await adherentIdHandler(
      makeAuthedReq({ method: 'GET', query: { id: 'bad' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 on GET when adherent missing', async () => {
    const res = makeRes();
    await adherentIdHandler(
      makeAuthedReq({ method: 'GET', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('GET returns adherent + payments', async () => {
    store.adherents = [
      {
        id: VALID_UUID,
        first_name: 'Alice',
        last_name: 'A',
        email: 'a@x.com',
      },
    ] as any;
    store.adherent_payments = [
      { adherent_id: VALID_UUID, year: 2026, amount: 25 },
    ] as any;
    const res = makeRes();
    await adherentIdHandler(
      makeAuthedReq({ method: 'GET', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).first_name).toBe('Alice');
    expect((res.body as any).payments.length).toBe(1);
  });

  it('PATCH 400 when no fields provided', async () => {
    const res = makeRes();
    await adherentIdHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { id: VALID_UUID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 400 when email already used by another adherent', async () => {
    store.adherents = [
      { id: VALID_UUID, email: 'old@x.com', first_name: 'X', last_name: 'Y' },
      {
        id: 'other-uuid',
        email: 'taken@x.com',
        first_name: 'O',
        last_name: 'P',
      },
    ] as any;
    const res = makeRes();
    await adherentIdHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { id: VALID_UUID },
        body: { email: 'taken@x.com' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 200 updates the adherent (with stubbed update chain)', async () => {
    store.adherents = [
      {
        id: VALID_UUID,
        first_name: 'Old',
        last_name: 'Name',
        email: 'old@x.com',
      },
    ] as any;
    const updatedRow = {
      id: VALID_UUID,
      first_name: 'New',
      last_name: 'Name',
      email: 'old@x.com',
    };
    const originalFrom = supabaseAdmin.from;
    (supabaseAdmin as any).from = (table: string) => {
      if (table === 'adherents') {
        // Match the entire chain we use
        const builder = originalFrom(table);
        // Override update().eq().select().single() to succeed
        (builder as any).update = () => ({
          eq: () => ({
            select: () => ({
              single: async () => ({ data: updatedRow, error: null }),
            }),
          }),
        });
        return builder;
      }
      return originalFrom(table);
    };
    try {
      const res = makeRes();
      await adherentIdHandler(
        makeAuthedReq({
          method: 'PATCH',
          query: { id: VALID_UUID },
          body: {
            firstName: 'New',
            phone: '+33...',
            paymentStatus: 'paid',
            paymentAmount: 25,
            isActive: true,
          },
        }),
        res
      );
      expect(res.statusCode).toBe(200);
      expect((res.body as any).first_name).toBe('New');
      expect((store.staff_logs as any[]).length).toBe(1);
    } finally {
      (supabaseAdmin as any).from = originalFrom;
    }
  });

  it('DELETE 404 when adherent missing', async () => {
    const res = makeRes();
    await adherentIdHandler(
      makeAuthedReq({ method: 'DELETE', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('DELETE removes the adherent', async () => {
    store.adherents = [
      {
        id: VALID_UUID,
        first_name: 'X',
        last_name: 'Y',
        email: 'x@y.com',
      },
    ] as any;
    const res = makeRes();
    await adherentIdHandler(
      makeAuthedReq({ method: 'DELETE', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.adherents as any[]).length).toBe(0);
  });

  it('405 on POST', async () => {
    const res = makeRes();
    await adherentIdHandler(
      makeAuthedReq({ method: 'POST', query: { id: VALID_UUID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});
