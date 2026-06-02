// Unit tests for the 6 caster-app support endpoints added for the Electron
// caster decoupling:
//   - GET  /api/caster/tournaments
//   - GET  /api/caster/tournaments/[id]/matches
//   - GET  /api/caster/matches/[id]
//   - GET  /api/caster/tournaments/[id]/maps
//   - POST /api/twitch/exchange
//   - POST /api/twitch/refresh
//
// The caster routes use supabaseAdmin + resolveTenantId (honors the
// `x-tenant-id` header so the desktop caster can target a specific tenant —
// e.g. the e2e tenant in E2E mode — falling back to DEFAULT_TENANT_ID).
// supabase + rateLimit are auto-mocked by tests/unit/__helpers__/testSetup.ts,
// so we just seed `store.<table>`.
//
// The Twitch routes call the EXTERNAL Twitch token endpoint via global fetch,
// which we mock here, and read TWITCH_CLIENT_ID/SECRET from env.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';

import casterTournamentsHandler from '../../pages/api/caster/tournaments/index';
import casterMatchesHandler from '../../pages/api/caster/tournaments/[id]/matches';
import casterMatchHandler from '../../pages/api/caster/matches/[id]';
import casterMapsHandler from '../../pages/api/caster/tournaments/[id]/maps';
import twitchExchangeHandler from '../../pages/api/twitch/exchange';
import twitchRefreshHandler from '../../pages/api/twitch/refresh';

/* -----------------------------------------------------------
 * Helpers — minimal req/res shims (same shape as apiPublicRoutes.test.ts)
 * ---------------------------------------------------------*/

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'example.com' },
    query: {},
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.end = () => res;
  return res;
}

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_UUID = '550e8400-e29b-41d4-a716-446655440099';
const TENANT_E2E = 'e2e70000-0000-4000-8000-000000000001';
const TENANT_OTHER = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  resetSupabaseMock();
});

/* ===========================================================
 * A1) GET /api/caster/tournaments
 * =========================================================*/

describe('GET /api/caster/tournaments', () => {
  it('returns 200 with tournaments scoped to running/published', async () => {
    store.tournaments = [
      {
        id: 't1',
        name: 'Run',
        slug: 'run',
        game: 'lol',
        status: 'running',
        start_date: '2026-03-01',
        format_type: 'single_elim',
      },
      {
        id: 't2',
        name: 'Pub',
        slug: 'pub',
        game: 'lol',
        status: 'published',
        start_date: '2026-02-01',
        format_type: 'swiss',
      },
      {
        id: 't3',
        name: 'Draft',
        slug: 'draft',
        game: 'lol',
        status: 'draft',
        start_date: '2026-01-01',
        format_type: 'single_elim',
      },
      {
        id: 't4',
        name: 'Arch',
        slug: 'arch',
        game: 'lol',
        status: 'archived',
        start_date: '2026-01-01',
        format_type: 'single_elim',
      },
    ];
    const req = makeReq();
    const res = makeRes();
    await casterTournamentsHandler(req, res);

    expect(res.statusCode).toBe(200);
    const list = (res.body as any).tournaments;
    expect(list.map((t: any) => t.id).sort()).toEqual(['t1', 't2']);
  });

  it('returns an empty list when nothing matches', async () => {
    store.tournaments = [
      { id: 't3', name: 'Draft', status: 'draft', start_date: '2026-01-01' },
    ];
    const req = makeReq();
    const res = makeRes();
    await casterTournamentsHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).tournaments).toEqual([]);
  });

  it('returns 405 + Allow:GET on non-GET', async () => {
    const req = makeReq({ method: 'POST' });
    const res = makeRes();
    await casterTournamentsHandler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET');
  });

  it('scopes the list to the x-tenant-id header when present', async () => {
    store.tournaments = [
      {
        id: 'tA',
        name: 'E2E',
        slug: 'e2e',
        game: 'overwatch',
        status: 'running',
        start_date: '2026-03-01',
        format_type: 'single_elim',
        tenant_id: TENANT_E2E,
      },
      {
        id: 'tB',
        name: 'Other',
        slug: 'other',
        game: 'overwatch',
        status: 'running',
        start_date: '2026-03-01',
        format_type: 'single_elim',
        tenant_id: TENANT_OTHER,
      },
    ];
    const req = makeReq({
      headers: { host: 'example.com', 'x-tenant-id': TENANT_E2E },
    });
    const res = makeRes();
    await casterTournamentsHandler(req, res);

    expect(res.statusCode).toBe(200);
    const list = (res.body as any).tournaments;
    expect(list.map((t: any) => t.id)).toEqual(['tA']);
  });
});

/* ===========================================================
 * A2) GET /api/caster/tournaments/[id]/matches
 * =========================================================*/

describe('GET /api/caster/tournaments/[id]/matches', () => {
  it('returns 400 on an invalid UUID', async () => {
    const req = makeReq({ query: { id: 'not-a-uuid' } });
    const res = makeRes();
    await casterMatchesHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/Invalid tournament id/);
  });

  it('returns 400 on a missing id', async () => {
    const req = makeReq({ query: {} });
    const res = makeRes();
    await casterMatchesHandler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 on an array id', async () => {
    const req = makeReq({ query: { id: ['x', 'y'] } });
    const res = makeRes();
    await casterMatchesHandler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 with matches scoped to the tournament + valid statuses', async () => {
    store.matches = [
      {
        id: 'm1',
        tournament_id: VALID_UUID,
        status: 'pending',
        scheduled_at: '2026-03-01',
      },
      {
        id: 'm2',
        tournament_id: VALID_UUID,
        status: 'ongoing',
        scheduled_at: '2026-03-02',
      },
      {
        id: 'm3',
        tournament_id: VALID_UUID,
        status: 'finished',
        scheduled_at: '2026-03-03',
      },
      {
        id: 'm4',
        tournament_id: VALID_UUID,
        status: 'cancelled',
        scheduled_at: '2026-03-04',
      },
      {
        id: 'm5',
        tournament_id: OTHER_UUID,
        status: 'pending',
        scheduled_at: '2026-03-05',
      },
    ];
    const req = makeReq({ query: { id: VALID_UUID } });
    const res = makeRes();
    await casterMatchesHandler(req, res);

    expect(res.statusCode).toBe(200);
    const list = (res.body as any).matches;
    expect(list.map((m: any) => m.id).sort()).toEqual(['m1', 'm2', 'm3']);
  });

  it('returns an empty list when no match matches', async () => {
    store.matches = [];
    const req = makeReq({ query: { id: VALID_UUID } });
    const res = makeRes();
    await casterMatchesHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).matches).toEqual([]);
  });

  it('returns 405 + Allow:GET on non-GET', async () => {
    const req = makeReq({ method: 'DELETE', query: { id: VALID_UUID } });
    const res = makeRes();
    await casterMatchesHandler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET');
  });
});

/* ===========================================================
 * A3) GET /api/caster/matches/[id]
 * =========================================================*/

describe('GET /api/caster/matches/[id]', () => {
  it('returns 400 on an invalid UUID', async () => {
    const req = makeReq({ query: { id: 'nope' } });
    const res = makeRes();
    await casterMatchHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/Invalid match id/);
  });

  it('returns 404 when the match does not resolve', async () => {
    store.matches = [];
    store.games = [];
    const req = makeReq({ query: { id: VALID_UUID } });
    const res = makeRes();
    await casterMatchHandler(req, res);
    expect(res.statusCode).toBe(404);
    expect((res.body as any).error).toMatch(/not found/i);
  });

  it('returns 200 with the match + its games', async () => {
    store.matches = [
      {
        id: VALID_UUID,
        status: 'ongoing',
        best_of: 3,
        scheduled_at: '2026-03-01',
      },
    ];
    store.games = [
      {
        id: 'g1',
        match_id: VALID_UUID,
        map_name: 'Bind',
        map_order: 1,
        team1_score: 13,
        team2_score: 7,
      },
      {
        id: 'g2',
        match_id: VALID_UUID,
        map_name: 'Haven',
        map_order: 2,
        team1_score: 9,
        team2_score: 13,
      },
      { id: 'g3', match_id: OTHER_UUID, map_name: 'Split', map_order: 1 },
    ];
    const req = makeReq({ query: { id: VALID_UUID } });
    const res = makeRes();
    await casterMatchHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).match.id).toBe(VALID_UUID);
    const games = (res.body as any).games;
    expect(games.map((g: any) => g.id).sort()).toEqual(['g1', 'g2']);
  });

  it('returns 200 with an empty games array when the match has none', async () => {
    store.matches = [{ id: VALID_UUID, status: 'pending' }];
    store.games = [];
    const req = makeReq({ query: { id: VALID_UUID } });
    const res = makeRes();
    await casterMatchHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).games).toEqual([]);
  });

  it('returns 405 + Allow:GET on non-GET', async () => {
    const req = makeReq({ method: 'POST', query: { id: VALID_UUID } });
    const res = makeRes();
    await casterMatchHandler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET');
  });
});

/* ===========================================================
 * A4) GET /api/caster/tournaments/[id]/maps
 * =========================================================*/

describe('GET /api/caster/tournaments/[id]/maps', () => {
  it('returns 400 on an invalid UUID', async () => {
    const req = makeReq({ query: { id: 'bad' } });
    const res = makeRes();
    await casterMapsHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/Invalid tournament id/);
  });

  it('returns 200 with only enabled maps for the tournament', async () => {
    store.tournament_maps = [
      {
        id: 'mp1',
        tournament_id: VALID_UUID,
        map_name: 'Ascent',
        map_type: 'standard',
        image_url: null,
        enabled: true,
      },
      {
        id: 'mp2',
        tournament_id: VALID_UUID,
        map_name: 'Bind',
        map_type: 'standard',
        image_url: null,
        enabled: false,
      },
      {
        id: 'mp3',
        tournament_id: OTHER_UUID,
        map_name: 'Haven',
        map_type: 'standard',
        image_url: null,
        enabled: true,
      },
    ];
    const req = makeReq({ query: { id: VALID_UUID } });
    const res = makeRes();
    await casterMapsHandler(req, res);

    expect(res.statusCode).toBe(200);
    const maps = (res.body as any).maps;
    expect(maps.map((m: any) => m.id)).toEqual(['mp1']);
  });

  it('returns an empty list when there are no enabled maps', async () => {
    store.tournament_maps = [];
    const req = makeReq({ query: { id: VALID_UUID } });
    const res = makeRes();
    await casterMapsHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).maps).toEqual([]);
  });

  it('returns 405 + Allow:GET on non-GET', async () => {
    const req = makeReq({ method: 'PUT', query: { id: VALID_UUID } });
    const res = makeRes();
    await casterMapsHandler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET');
  });
});

/* ===========================================================
 * B5) POST /api/twitch/exchange
 * =========================================================*/

const OK_TOKEN = {
  access_token: 'acc-123',
  refresh_token: 'ref-456',
  expires_in: 14000,
  scope: ['user:read'],
  token_type: 'bearer',
};

describe('POST /api/twitch/exchange', () => {
  let fetchSpy: any;
  const ORIG_ENV = { ...process.env };

  beforeEach(() => {
    process.env.TWITCH_CLIENT_ID = 'cid';
    process.env.TWITCH_CLIENT_SECRET = 'csecret';
    fetchSpy = vi.spyOn(globalThis, 'fetch' as any);
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
    fetchSpy?.mockRestore?.();
  });

  it('returns 405 + Allow:POST on non-POST', async () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await twitchExchangeHandler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('POST');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_CODE when code missing/empty', async () => {
    const req = makeReq({
      method: 'POST',
      body: { code: '   ', redirectUri: 'https://app.example/cb' },
    });
    const res = makeRes();
    await twitchExchangeHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_CODE');
  });

  it('returns 400 INVALID_REDIRECT_URI when redirectUri missing or not a URL', async () => {
    const req = makeReq({
      method: 'POST',
      body: { code: 'abc', redirectUri: 'not a url' },
    });
    const res = makeRes();
    await twitchExchangeHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_REDIRECT_URI');
  });

  it('returns 500 TWITCH_NOT_CONFIGURED when creds absent', async () => {
    delete process.env.TWITCH_CLIENT_ID;
    delete process.env.TWITCH_CLIENT_SECRET;
    const req = makeReq({
      method: 'POST',
      body: { code: 'abc', redirectUri: 'https://app.example/cb' },
    });
    const res = makeRes();
    await twitchExchangeHandler(req, res);
    expect(res.statusCode).toBe(500);
    expect((res.body as any).code).toBe('TWITCH_NOT_CONFIGURED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 200 passthrough when Twitch responds OK + uses authorization_code grant + never leaks secret', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => OK_TOKEN,
    } as any);

    const req = makeReq({
      method: 'POST',
      body: { code: 'the-code', redirectUri: 'https://app.example/cb' },
    });
    const res = makeRes();
    await twitchExchangeHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      access_token: 'acc-123',
      refresh_token: 'ref-456',
      expires_in: 14000,
      scope: ['user:read'],
      token_type: 'bearer',
    });

    // The request to Twitch used grant_type=authorization_code.
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://id.twitch.tv/oauth2/token');
    expect(String(init.body)).toContain('grant_type=authorization_code');
    expect(String(init.body)).toContain('code=the-code');

    // The secret is never present in the JSON response surface.
    expect(JSON.stringify(res.body)).not.toContain('csecret');
  });

  it('returns 502 TWITCH_EXCHANGE_FAILED on a non-OK Twitch response', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    } as any);

    const req = makeReq({
      method: 'POST',
      body: { code: 'bad', redirectUri: 'https://app.example/cb' },
    });
    const res = makeRes();
    await twitchExchangeHandler(req, res);
    expect(res.statusCode).toBe(502);
    expect((res.body as any).code).toBe('TWITCH_EXCHANGE_FAILED');
    expect(JSON.stringify(res.body)).not.toContain('csecret');
  });

  it('returns 502 TWITCH_EXCHANGE_FAILED when fetch throws', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    const req = makeReq({
      method: 'POST',
      body: { code: 'abc', redirectUri: 'https://app.example/cb' },
    });
    const res = makeRes();
    await twitchExchangeHandler(req, res);
    expect(res.statusCode).toBe(502);
    expect((res.body as any).code).toBe('TWITCH_EXCHANGE_FAILED');
  });
});

/* ===========================================================
 * B6) POST /api/twitch/refresh
 * =========================================================*/

describe('POST /api/twitch/refresh', () => {
  let fetchSpy: any;
  const ORIG_ENV = { ...process.env };

  beforeEach(() => {
    process.env.TWITCH_CLIENT_ID = 'cid';
    process.env.TWITCH_CLIENT_SECRET = 'csecret';
    fetchSpy = vi.spyOn(globalThis, 'fetch' as any);
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
    fetchSpy?.mockRestore?.();
  });

  it('returns 405 + Allow:POST on non-POST', async () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await twitchRefreshHandler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('POST');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_REFRESH_TOKEN when refresh_token missing', async () => {
    const req = makeReq({ method: 'POST', body: {} });
    const res = makeRes();
    await twitchRefreshHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('returns 500 TWITCH_NOT_CONFIGURED when creds absent', async () => {
    delete process.env.TWITCH_CLIENT_ID;
    delete process.env.TWITCH_CLIENT_SECRET;
    const req = makeReq({ method: 'POST', body: { refresh_token: 'r' } });
    const res = makeRes();
    await twitchRefreshHandler(req, res);
    expect(res.statusCode).toBe(500);
    expect((res.body as any).code).toBe('TWITCH_NOT_CONFIGURED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 200 passthrough on OK + uses refresh_token grant + never leaks secret', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => OK_TOKEN,
    } as any);

    const req = makeReq({
      method: 'POST',
      body: { refresh_token: 'ref-456' },
    });
    const res = makeRes();
    await twitchRefreshHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      access_token: 'acc-123',
      refresh_token: 'ref-456',
      expires_in: 14000,
      scope: ['user:read'],
      token_type: 'bearer',
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://id.twitch.tv/oauth2/token');
    expect(String(init.body)).toContain('grant_type=refresh_token');
    expect(String(init.body)).toContain('refresh_token=ref-456');
    expect(JSON.stringify(res.body)).not.toContain('csecret');
  });

  it('returns 502 TWITCH_REFRESH_FAILED on a non-OK Twitch response', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'invalid_grant' }),
    } as any);

    const req = makeReq({ method: 'POST', body: { refresh_token: 'stale' } });
    const res = makeRes();
    await twitchRefreshHandler(req, res);
    expect(res.statusCode).toBe(502);
    expect((res.body as any).code).toBe('TWITCH_REFRESH_FAILED');
  });

  it('returns 502 TWITCH_REFRESH_FAILED when fetch throws', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('boom'));
    const req = makeReq({ method: 'POST', body: { refresh_token: 'r' } });
    const res = makeRes();
    await twitchRefreshHandler(req, res);
    expect(res.statusCode).toBe(502);
    expect((res.body as any).code).toBe('TWITCH_REFRESH_FAILED');
  });
});
