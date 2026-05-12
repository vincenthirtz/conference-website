// tests/unit/apiBotTeamsList.test.ts
// Tests pour les endpoints bot teams en lecture :
//   - GET /api/bot/teams (liste avec filtres)
//   - GET /api/bot/teams/[teamId] (par UUID ou slug)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import botTeamsHandler from '../../pages/api/bot/v1/teams/index';
import botTeamIdHandler from '../../pages/api/bot/v1/teams/[teamId]';

const TEAM_A = '550e8400-e29b-41d4-a716-446655440b01';
const TEAM_B = '550e8400-e29b-41d4-a716-446655440b02';

function makeBotReq(over: Partial<any> = {}, method = 'GET'): any {
  return {
    method,
    headers: { host: 'h', 'x-api-key': 'test-key' },
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
  process.env.BOT_API_KEY = 'test-key';
  store.teams = [
    {
      id: TEAM_A,
      name: 'Phoenix',
      slug: 'phoenix',
      short_name: 'PHX',
      country: 'FR',
      is_active: true,
      is_joinable: true,
      captain_id: 'user-1',
    },
    {
      id: TEAM_B,
      name: 'Dragons',
      slug: 'dragons',
      short_name: 'DRG',
      country: 'BE',
      is_active: false,
      is_joinable: false,
      captain_id: 'user-2',
    },
  ] as any;
});

afterEach(() => {
  delete process.env.BOT_API_KEY;
});

/* GET /api/bot/teams */

describe('GET /api/bot/teams', () => {
  it('401 without api key', async () => {
    const res = makeRes();
    await botTeamsHandler({ ...makeBotReq(), headers: { host: 'h' } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns active teams by default', async () => {
    const res = makeRes();
    await botTeamsHandler(makeBotReq(), res);
    expect(res.statusCode).toBe(200);
    const teams = (res.body as any).teams;
    expect(teams).toHaveLength(1);
    expect(teams[0].slug).toBe('phoenix');
  });

  it('isActive=false returns inactive teams', async () => {
    const res = makeRes();
    await botTeamsHandler(makeBotReq({ query: { isActive: 'false' } }), res);
    expect(res.statusCode).toBe(200);
    const teams = (res.body as any).teams;
    expect(teams).toHaveLength(1);
    expect(teams[0].slug).toBe('dragons');
  });

  it('filters by country', async () => {
    const res = makeRes();
    await botTeamsHandler(
      makeBotReq({ query: { country: 'BE', isActive: 'false' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).teams).toHaveLength(1);
  });

  it('respects limit', async () => {
    const res = makeRes();
    await botTeamsHandler(
      makeBotReq({ query: { limit: '1', isActive: 'false' } }),
      res
    );
    expect((res.body as any).teams).toHaveLength(1);
  });
});

/* GET /api/bot/teams/[teamId] */

describe('GET /api/bot/teams/[teamId]', () => {
  it('400 when teamId missing', async () => {
    const res = makeRes();
    await botTeamIdHandler(makeBotReq({ query: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('resolves a team by UUID', async () => {
    const res = makeRes();
    await botTeamIdHandler(makeBotReq({ query: { teamId: TEAM_A } }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).team.slug).toBe('phoenix');
  });

  it('resolves a team by slug', async () => {
    const res = makeRes();
    await botTeamIdHandler(makeBotReq({ query: { teamId: 'phoenix' } }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).team.id).toBe(TEAM_A);
  });

  it('404 when not found', async () => {
    const res = makeRes();
    await botTeamIdHandler(makeBotReq({ query: { teamId: 'nope' } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('includes members when requested', async () => {
    store.team_members = [
      {
        id: 'tm1',
        team_id: TEAM_A,
        user_id: 'user-1',
        role: 'captain',
        is_substitute: false,
      },
    ] as any;
    const res = makeRes();
    await botTeamIdHandler(
      makeBotReq({ query: { teamId: 'phoenix', includeMembers: '1' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).members).toHaveLength(1);
  });

  it('omits members by default', async () => {
    store.team_members = [
      {
        id: 'tm1',
        team_id: TEAM_A,
        user_id: 'user-1',
        role: 'captain',
        is_substitute: false,
      },
    ] as any;
    const res = makeRes();
    await botTeamIdHandler(makeBotReq({ query: { teamId: 'phoenix' } }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).members).toHaveLength(0);
  });
});
