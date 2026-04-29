import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

vi.mock('@/utils/rateLimit', () => ({
  applyRateLimit: () => false,
  getClientIp: () => '127.0.0.1',
}));

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';

import captchaHandler from '../../pages/api/captcha';
import teamByIdHandler from '../../pages/api/teams/[id]';
import partnersHandler from '../../pages/api/partners/index';
import tournamentsHandler from '../../pages/api/tournaments/index';

/* -----------------------------------------------------------
 * Helpers — minimal req/res shims
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

beforeEach(() => {
  resetSupabaseMock();
});

/* -----------------------------------------------------------
 * /api/captcha
 * ---------------------------------------------------------*/

describe('GET /api/captcha', () => {
  it('returns a token + question on GET', async () => {
    const req = makeReq();
    const res = makeRes();
    await captchaHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(typeof (res.body as any).token).toBe('string');
    expect(typeof (res.body as any).question).toBe('string');
  });

  it('sets Cache-Control: no-store', async () => {
    const req = makeReq();
    const res = makeRes();
    await captchaHandler(req, res);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('rejects non-GET methods with 405', async () => {
    const req = makeReq({ method: 'POST' });
    const res = makeRes();
    await captchaHandler(req, res);
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/teams/[id]
 * ---------------------------------------------------------*/

describe('GET /api/teams/[id]', () => {
  const validUuid = '550e8400-e29b-41d4-a716-446655440000';

  it('returns the team when found', async () => {
    store.teams = [{ id: validUuid, name: 'Alpha' }];
    const req = makeReq({ query: { id: validUuid } });
    const res = makeRes();
    await teamByIdHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).team.name).toBe('Alpha');
  });

  it('rejects an invalid UUID with 400', async () => {
    const req = makeReq({ query: { id: 'not-a-uuid' } });
    const res = makeRes();
    await teamByIdHandler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects a missing id with 400', async () => {
    const req = makeReq({ query: {} });
    const res = makeRes();
    await teamByIdHandler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects an array id with 400', async () => {
    const req = makeReq({ query: { id: [validUuid, validUuid] } });
    const res = makeRes();
    await teamByIdHandler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when no team matches', async () => {
    store.teams = [];
    const req = makeReq({ query: { id: validUuid } });
    const res = makeRes();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await teamByIdHandler(req, res);
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(404);
  });

  it('rejects non-GET methods with 405', async () => {
    const req = makeReq({ method: 'POST', query: { id: validUuid } });
    const res = makeRes();
    await teamByIdHandler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it('sets a public Cache-Control header on success', async () => {
    store.teams = [{ id: validUuid, name: 'Alpha' }];
    const req = makeReq({ query: { id: validUuid } });
    const res = makeRes();
    await teamByIdHandler(req, res);
    expect(res.headers['Cache-Control']).toContain('public');
  });
});

/* -----------------------------------------------------------
 * /api/partners
 * ---------------------------------------------------------*/

describe('GET /api/partners', () => {
  it('returns active partners', async () => {
    store.partners = [
      { id: 'p1', name: 'Alpha', is_active: true, category: 'sponsor' },
      { id: 'p2', name: 'Beta', is_active: false, category: 'sponsor' },
    ];
    const req = makeReq();
    const res = makeRes();
    await partnersHandler(req, res);
    expect(res.statusCode).toBe(200);
    const items = (res.body as any).items;
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Alpha');
  });

  it('filters by category when provided', async () => {
    store.partners = [
      { id: 'p1', name: 'Alpha', is_active: true, category: 'sponsor' },
      { id: 'p2', name: 'Beta', is_active: true, category: 'media' },
    ];
    const req = makeReq({ query: { category: 'media' } });
    const res = makeRes();
    await partnersHandler(req, res);
    const items = (res.body as any).items;
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Beta');
  });

  it('returns 405 on non-GET methods', async () => {
    const req = makeReq({ method: 'PUT' });
    const res = makeRes();
    await partnersHandler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET');
  });

  it('returns an empty list when there are no active partners', async () => {
    store.partners = [];
    const req = makeReq();
    const res = makeRes();
    await partnersHandler(req, res);
    expect((res.body as any).items).toEqual([]);
  });
});

/* -----------------------------------------------------------
 * /api/tournaments
 * ---------------------------------------------------------*/

describe('GET /api/tournaments', () => {
  const tid = '550e8400-e29b-41d4-a716-446655440001';

  function seedTournament(over: Partial<Record<string, unknown>> = {}) {
    return {
      id: tid,
      name: 'T',
      slug: null,
      short_name: null,
      game: null,
      status: 'published',
      format: null,
      start_date: null,
      end_date: null,
      max_teams: null,
      logo_url: null,
      banner_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
      ...over,
    };
  }

  it('lists visible tournaments', async () => {
    store.tournaments = [
      seedTournament({ id: 'a', status: 'published' }),
      seedTournament({ id: 'b', status: 'archived' }), // hidden
      seedTournament({ id: 'c', status: 'running' }),
    ];
    store.tournament_teams = [];

    const req = makeReq();
    const res = makeRes();
    await tournamentsHandler(req, res);

    expect(res.statusCode).toBe(200);
    const list = (res.body as any).tournaments;
    expect(list.map((t: any) => t.id).sort()).toEqual(['a', 'c']);
  });

  it('filters by status when given a valid status param', async () => {
    store.tournaments = [
      seedTournament({ id: 'a', status: 'published' }),
      seedTournament({ id: 'b', status: 'running' }),
    ];
    store.tournament_teams = [];

    const req = makeReq({ query: { status: 'running' } });
    const res = makeRes();
    await tournamentsHandler(req, res);
    const list = (res.body as any).tournaments;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('b');
  });

  it('ignores an unknown status param', async () => {
    store.tournaments = [
      seedTournament({ id: 'a', status: 'published' }),
      seedTournament({ id: 'b', status: 'running' }),
    ];
    store.tournament_teams = [];
    const req = makeReq({ query: { status: 'bogus' } });
    const res = makeRes();
    await tournamentsHandler(req, res);
    expect((res.body as any).tournaments).toHaveLength(2);
  });

  it('returns a single tournament when filtered by id (skips status filter)', async () => {
    store.tournaments = [
      seedTournament({ id: tid, status: 'archived' }), // hidden by status, but id-targeted should bypass
    ];
    store.tournament_teams = [];
    const req = makeReq({ query: { id: tid } });
    const res = makeRes();
    await tournamentsHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).tournaments).toHaveLength(1);
  });

  it('enriches results with team_count', async () => {
    store.tournaments = [seedTournament({ id: tid })];
    store.tournament_teams = [
      { tournament_id: tid, team_id: 't1' },
      { tournament_id: tid, team_id: 't2' },
      { tournament_id: tid, team_id: 't3' },
    ];

    const req = makeReq();
    const res = makeRes();
    await tournamentsHandler(req, res);
    const list = (res.body as any).tournaments;
    expect(list[0].team_count).toBe(3);
  });

  it('returns 405 on non-GET methods', async () => {
    const req = makeReq({ method: 'POST' });
    const res = makeRes();
    await tournamentsHandler(req, res);
    expect(res.statusCode).toBe(405);
  });
});
