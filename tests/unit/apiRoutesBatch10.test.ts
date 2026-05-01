import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

// twitch/live captures TWITCH_CLIENT_ID/SECRET at module load. vi.hoisted
// runs before any import, so set env vars there.
vi.hoisted(() => {
  process.env.TWITCH_CLIENT_ID = 'cid';
  process.env.TWITCH_CLIENT_SECRET = 'csecret';
});

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});
vi.mock('../../utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

vi.mock('@/utils/rateLimit', () => ({
  applyRateLimit: () => false,
  getClientIp: () => '127.0.0.1',
}));

const {
  sendWelcomeEmail,
  sendTournamentNotificationEmail,
  logStaffActionMock,
} = vi.hoisted(() => ({
  sendWelcomeEmail: vi.fn(async () => undefined),
  sendTournamentNotificationEmail: vi.fn(async () => ({
    success: true as const,
  })),
  logStaffActionMock: vi.fn(async () => undefined),
}));

vi.mock('@/utils/email', () => ({
  sendWelcomeEmail,
  sendTournamentNotificationEmail,
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
  setCreateUserResult,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import publicNewsHandler from '../../pages/api/news/index';
import statsMapsHandler from '../../pages/api/admin/stats/maps';
import notifyCaptainsHandler from '../../pages/api/admin/tournaments/notify-captains';
import twitchLiveHandler from '../../pages/api/twitch/live';
import {
  listUsersEmailMap,
  findOrCreateUserByEmail,
} from '../../utils/find-or-create-user';

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
    endBody: undefined as unknown,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = (b?: unknown) => ((res.endBody = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  sendWelcomeEmail.mockClear();
  sendTournamentNotificationEmail.mockClear();
  logStaffActionMock.mockClear();
});

const TID = '550e8400-e29b-41d4-a716-446655440000';

/* -----------------------------------------------------------
 * /api/news (public list)
 * ---------------------------------------------------------*/

describe('GET /api/news', () => {
  it('405 on non-GET', async () => {
    const res = makeRes();
    await publicNewsHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('200 lists published news with mapped fields', async () => {
    store.news = [
      {
        id: 'n1',
        title: 'Hello',
        slug: 'hello',
        tag: 'general',
        excerpt: 'short',
        content: 'body',
        image_url: null,
        published_at: '2026-04-01T10:00:00Z',
        created_at: '2026-04-01T09:00:00Z',
        updated_at: '2026-04-01T09:30:00Z',
        status: 'published',
        news_comments: [{ count: 3 }],
      },
      {
        id: 'n2',
        title: 'Draft',
        slug: 'draft',
        tag: 'general',
        excerpt: null,
        content: 'body',
        image_url: null,
        published_at: null,
        created_at: '2026-04-01',
        updated_at: '2026-04-01',
        status: 'draft',
        news_comments: [],
      },
    ] as any;

    const res = makeRes();
    await publicNewsHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const items = (res.body as any).items;
    // Only the published one is returned
    expect(items.map((i: any) => i.id)).toEqual(['n1']);
    expect(items[0].commentsCount).toBe(3);
    expect(items[0].imageUrl).toBeNull();
  });

  it('filters by tag (after slugification)', async () => {
    store.news = [
      {
        id: 'n1',
        slug: 'a',
        tag: 'esport-news',
        status: 'published',
        published_at: '2026-04-01',
        created_at: '2026',
        updated_at: '2026',
      },
      {
        id: 'n2',
        slug: 'b',
        tag: 'general',
        status: 'published',
        published_at: '2026-04-01',
        created_at: '2026',
        updated_at: '2026',
      },
    ] as any;
    const res = makeRes();
    await publicNewsHandler(
      makeReq({ method: 'GET', query: { tag: 'Esport News' } }),
      res
    );
    expect((res.body as any).items.map((i: any) => i.id)).toEqual(['n1']);
  });

  it('returns empty list when no news matches', async () => {
    store.news = [];
    const res = makeRes();
    await publicNewsHandler(makeReq({ method: 'GET' }), res);
    expect((res.body as any).items).toEqual([]);
  });
});

/* -----------------------------------------------------------
 * /api/admin/stats/maps
 * ---------------------------------------------------------*/

describe('GET /api/admin/stats/maps', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('manager')] as any;
  });

  function seedMaps() {
    store.map_stats_view = [
      {
        map_name: 'Lijiang',
        games_played: 4,
        wins_team1: 3,
        wins_team2: 1,
        total_rounds: 16,
      },
      {
        map_name: 'Hanamura',
        games_played: 2,
        wins_team1: 1,
        wins_team2: 1,
        total_rounds: 8,
      },
    ] as any;
  }

  it('returns 405 on non-GET', async () => {
    const res = makeRes();
    await statsMapsHandler(makeReq({ method: 'POST' }, true), res);
    expect(res.statusCode).toBe(405);
  });

  it('200 returns transformed map stats', async () => {
    seedMaps();
    const res = makeRes();
    await statsMapsHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(200);
    const stats = (res.body as any).stats;
    expect(stats).toHaveLength(2);
    const lijiang = stats.find((s: any) => s.map_name === 'Lijiang');
    expect(lijiang.matches_played).toBe(4);
    expect(lijiang.match_winrate_attack).toBeCloseTo(0.75);
    expect(lijiang.avg_total_rounds).toBeCloseTo(4);
  });

  it('?minMatches=3 filters out maps below threshold', async () => {
    seedMaps();
    const res = makeRes();
    await statsMapsHandler(
      makeReq({ method: 'GET', query: { minMatches: '3' } }, true),
      res
    );
    expect((res.body as any).stats.map((s: any) => s.map_name)).toEqual([
      'Lijiang',
    ]);
  });

  it('exports CSV when ?export=csv', async () => {
    seedMaps();
    const res = makeRes();
    await statsMapsHandler(
      makeReq({ method: 'GET', query: { export: 'csv' } }, true),
      res
    );
    expect(res.headers['Content-Type']).toMatch(/text\/csv/);
    expect(typeof res.endBody).toBe('string');
    expect(res.endBody as string).toContain('map_name');
  });

  it('search filters by map name (ilike)', async () => {
    seedMaps();
    const res = makeRes();
    await statsMapsHandler(
      makeReq({ method: 'GET', query: { search: 'lijiang' } }, true),
      res
    );
    expect((res.body as any).stats.map((s: any) => s.map_name)).toEqual([
      'Lijiang',
    ]);
  });
});

/* -----------------------------------------------------------
 * /api/admin/tournaments/notify-captains
 * ---------------------------------------------------------*/

describe('POST /api/admin/tournaments/notify-captains', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('manager')] as any;
  });

  it('405 on non-POST', async () => {
    const res = makeRes();
    await notifyCaptainsHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 when tournamentId missing or invalid', async () => {
    const res = makeRes();
    await notifyCaptainsHandler(
      makeReq({ method: 'POST', body: { tournamentId: 'bogus' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when tournament not found', async () => {
    store.tournaments = [];
    const res = makeRes();
    await notifyCaptainsHandler(
      makeReq({ method: 'POST', body: { tournamentId: TID } }, true),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('200 with notified=0 when no active teams have captains', async () => {
    store.tournaments = [
      { id: TID, name: 'Cup', slug: 'cup', start_date: null, status: 'open' },
    ] as any;
    store.teams = [
      { id: 't1', name: 'Alpha', captain_id: null, is_active: true },
    ] as any;
    const res = makeRes();
    await notifyCaptainsHandler(
      makeReq({ method: 'POST', body: { tournamentId: TID } }, true),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).notified).toBe(0);
  });

  it('200 sends email + insert demande for each captain', async () => {
    store.tournaments = [
      {
        id: TID,
        name: 'Cup',
        slug: 'cup',
        start_date: '2026-05-01',
        status: 'open',
      },
    ] as any;
    store.teams = [
      { id: 't1', name: 'Alpha', captain_id: 'cap-1', is_active: true },
      { id: 't2', name: 'Beta', captain_id: 'cap-2', is_active: true },
    ] as any;
    setAdminUser('cap-1', 'a@a.com');
    setAdminUser('cap-2', 'b@b.com');
    store.demandes = [];

    const res = makeRes();
    await notifyCaptainsHandler(
      makeReq({ method: 'POST', body: { tournamentId: TID } }, true),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.notified).toBe(2);
    expect(body.emailsSent).toBe(2);
    expect(body.messagesSent).toBe(2);
    expect(sendTournamentNotificationEmail).toHaveBeenCalledTimes(2);
    expect(store.demandes.length).toBe(2);
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('reports email error when sender fails', async () => {
    sendTournamentNotificationEmail.mockResolvedValueOnce({
      success: false,
      error: 'smtp down',
    } as any);
    store.tournaments = [
      { id: TID, name: 'Cup', slug: 'cup', start_date: null, status: 'open' },
    ] as any;
    store.teams = [
      { id: 't1', name: 'Alpha', captain_id: 'cap-1', is_active: true },
    ] as any;
    setAdminUser('cap-1', 'a@a.com');
    store.demandes = [];

    const res = makeRes();
    await notifyCaptainsHandler(
      makeReq({ method: 'POST', body: { tournamentId: TID } }, true),
      res
    );
    const body = res.body as any;
    expect(body.emailsSent).toBe(0);
    expect(body.errors?.length).toBeGreaterThan(0);
  });
});

/* -----------------------------------------------------------
 * /api/twitch/live — uses fetch
 * ---------------------------------------------------------*/

describe('GET /api/twitch/live', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('405 on non-GET', async () => {
    const res = makeRes();
    await twitchLiveHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 when channels query param is missing', async () => {
    const res = makeRes();
    await twitchLiveHandler(makeReq({ method: 'GET', query: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('200 marks live and offline channels from Twitch response', async () => {
    globalThis.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.startsWith('https://id.twitch.tv/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'tok',
            expires_in: 3600,
          }),
        } as any;
      }
      // streams endpoint
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              user_login: 'foo',
              title: 'Live now',
              viewer_count: 42,
            },
          ],
        }),
      } as any;
    }) as any;

    const res = makeRes();
    await twitchLiveHandler(
      makeReq({
        method: 'GET',
        query: { channels: 'foo,bar' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const statuses = (res.body as any).statuses;
    expect(statuses.foo).toEqual({
      live: true,
      title: 'Live now',
      viewer_count: 42,
    });
    expect(statuses.bar).toEqual({ live: false });
  });

  it('returns 500 on fetch error', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as any;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await twitchLiveHandler(
      makeReq({ method: 'GET', query: { channels: 'foo' } }),
      res
    );
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(500);
  });
});

/* -----------------------------------------------------------
 * utils/find-or-create-user
 * ---------------------------------------------------------*/

describe('find-or-create-user', () => {
  it('listUsersEmailMap returns a Map keyed by lowercase email', async () => {
    setAuthListUsers([
      { id: 'u1', email: 'A@Example.com' },
      { id: 'u2', email: 'b@example.com' },
      { id: 'u3', email: null }, // skipped
    ]);
    const map = await listUsersEmailMap();
    expect(map.get('a@example.com')).toBe('u1');
    expect(map.get('b@example.com')).toBe('u2');
    expect(map.size).toBe(2);
  });

  it('findOrCreateUserByEmail returns existing id when found', async () => {
    const map = new Map([['known@example.com', 'u-existing']]);
    const out = await findOrCreateUserByEmail(
      ' Known@Example.com ',
      'player',
      map
    );
    expect(out.userId).toBe('u-existing');
    expect(out.created).toBe(false);
  });

  it('findOrCreateUserByEmail creates a new user when not found', async () => {
    setCreateUserResult({
      data: { user: { id: 'new-user', email: 'new@example.com' } },
      error: null,
    });
    const map = new Map<string, string>();
    const out = await findOrCreateUserByEmail('new@example.com', 'admin', map);
    expect(out.userId).toBe('new-user');
    expect(out.created).toBe(true);
    expect(map.get('new@example.com')).toBe('new-user');
    // Welcome email is fire-and-forget
    await new Promise((r) => setImmediate(r));
    expect(sendWelcomeEmail).toHaveBeenCalledOnce();
  });

  it('findOrCreateUserByEmail throws when createUser fails', async () => {
    setCreateUserResult({
      data: { user: null },
      error: { message: 'duplicate' },
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      findOrCreateUserByEmail('x@y.com', 'player', new Map())
    ).rejects.toThrow(/duplicate/);
    consoleSpy.mockRestore();
  });

  it('throws when email is empty', async () => {
    await expect(
      findOrCreateUserByEmail('   ', 'player', new Map())
    ).rejects.toThrow(/Email is required/);
  });
});
