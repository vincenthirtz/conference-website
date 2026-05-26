// Tests for POST /api/bot/v1/matches/[matchId]/drafts (Lot 6).
// Bot-initiated draft init that wraps the Lot 2 engine + resolves the
// two captains' Discord IDs.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import botDraftInitHandler from '../../pages/api/bot/v1/matches/[matchId]/drafts';

const CONFERENCE_TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

const MATCH = '11111111-1111-4111-8111-111111111111';
const MATCH_OW = '11111111-1111-4111-8111-111111111112';
const TOURN_LOL = '22222222-2222-4222-8222-22222222aaaa';
const TOURN_OW = '22222222-2222-4222-8222-22222222bbbb';
const TEAM_1 = '550e8400-e29b-41d4-a716-446655440b01';
const TEAM_2 = '550e8400-e29b-41d4-a716-446655440b02';
const CAPTAIN_1 = '66666666-6666-4666-8666-666666666601';
const CAPTAIN_2 = '66666666-6666-4666-8666-666666666602';
const DISCORD_1 = '100000000000000001';
const DISCORD_2 = '100000000000000002';

function makeBotReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: {
      host: 'h',
      'x-api-key': 'test-key',
      'x-tenant-id': CONFERENCE_TENANT,
    },
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

function seed() {
  store.tenants = [{ id: CONFERENCE_TENANT }] as any;
  store.matches = [
    {
      id: MATCH,
      tenant_id: CONFERENCE_TENANT,
      tournament_id: TOURN_LOL,
      match_format: 'bo3',
      team1_id: TEAM_1,
      team2_id: TEAM_2,
    },
    {
      id: MATCH_OW,
      tenant_id: CONFERENCE_TENANT,
      tournament_id: TOURN_OW,
      match_format: 'bo3',
      team1_id: TEAM_1,
      team2_id: TEAM_2,
    },
  ] as any;
  store.tournaments = [
    { id: TOURN_LOL, game: 'lol', tenant_id: CONFERENCE_TENANT },
    { id: TOURN_OW, game: 'overwatch', tenant_id: CONFERENCE_TENANT },
  ] as any;
  store.teams = [
    {
      id: TEAM_1,
      tenant_id: CONFERENCE_TENANT,
      name: 'Phoenix',
      captain_id: CAPTAIN_1,
    },
    {
      id: TEAM_2,
      tenant_id: CONFERENCE_TENANT,
      name: 'Dragons',
      captain_id: CAPTAIN_2,
    },
  ] as any;
  store.user_discord_links = [
    { auth_user_id: CAPTAIN_1, discord_user_id: DISCORD_1 },
    // CAPTAIN_2 intentionally unlinked → discordUserId should be null.
  ] as any;
  store.match_drafts = [] as any;
  store.match_draft_steps = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  process.env.BOT_API_KEY = 'test-key';
  seed();
});

afterEach(() => {
  delete process.env.BOT_API_KEY;
});

describe('POST /api/bot/v1/matches/[matchId]/drafts', () => {
  it('401 without api key', async () => {
    const res = makeRes();
    await botDraftInitHandler(
      makeBotReq({ headers: { host: 'h' }, query: { matchId: MATCH }, body: { gameIndex: 1 } }),
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('creates the draft and returns captains with Discord IDs', async () => {
    const req = makeBotReq({
      query: { matchId: MATCH },
      body: { gameIndex: 1 },
    });
    const res = makeRes();
    await botDraftInitHandler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.draft.draft.game).toBe('lol');
    expect(res.body.draft.draft.game_index).toBe(1);
    expect(res.body.captains).toHaveLength(2);
    const cap1 = res.body.captains.find((c: any) => c.teamSlot === 1);
    const cap2 = res.body.captains.find((c: any) => c.teamSlot === 2);
    expect(cap1).toMatchObject({
      teamId: TEAM_1,
      teamName: 'Phoenix',
      authUserId: CAPTAIN_1,
      discordUserId: DISCORD_1,
    });
    expect(cap2).toMatchObject({
      teamId: TEAM_2,
      teamName: 'Dragons',
      authUserId: CAPTAIN_2,
      discordUserId: null, // unlinked
    });
  });

  it('honors a fearless override', async () => {
    const req = makeBotReq({
      query: { matchId: MATCH },
      body: { gameIndex: 1, fearless: true },
    });
    const res = makeRes();
    await botDraftInitHandler(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.draft.draft.fearless).toBe(true);
  });

  it('returns 400 when the tournament game has no draft phase', async () => {
    const req = makeBotReq({
      query: { matchId: MATCH_OW },
      body: { gameIndex: 1 },
    });
    const res = makeRes();
    await botDraftInitHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('GAME_NOT_DRAFTABLE');
  });

  it('returns 409 when the draft already exists', async () => {
    const req1 = makeBotReq({
      query: { matchId: MATCH },
      body: { gameIndex: 1 },
    });
    await botDraftInitHandler(req1, makeRes());

    const req2 = makeBotReq({
      query: { matchId: MATCH },
      body: { gameIndex: 1 },
    });
    const res2 = makeRes();
    await botDraftInitHandler(req2, res2);
    expect(res2.statusCode).toBe(409);
    expect(res2.body.code).toBe('DRAFT_ALREADY_EXISTS');
  });

  it('returns 400 for non-integer gameIndex', async () => {
    const req = makeBotReq({
      query: { matchId: MATCH },
      body: { gameIndex: 'oops' },
    });
    const res = makeRes();
    await botDraftInitHandler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for an invalid matchId', async () => {
    const req = makeBotReq({
      query: { matchId: 'not-a-uuid' },
      body: { gameIndex: 1 },
    });
    const res = makeRes();
    await botDraftInitHandler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects non-POST methods', async () => {
    const req = makeBotReq({
      method: 'GET',
      query: { matchId: MATCH },
      body: { gameIndex: 1 },
    });
    const res = makeRes();
    await botDraftInitHandler(req, res);
    expect(res.statusCode).toBe(405);
  });
});
