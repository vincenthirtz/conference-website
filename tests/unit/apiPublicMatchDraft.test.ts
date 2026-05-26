// Tests for GET /api/matches/[matchId]/drafts/[gameIndex] — the public
// spectator endpoint (Lot 5). No auth required ; tenant resolved
// implicitly from the match row.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import publicDraftHandler from '../../pages/api/matches/[matchId]/drafts/[gameIndex]';
import { LOL } from '../../config/games/lol';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const MATCH = '11111111-1111-4111-8111-111111111111';
const TOURN = '22222222-2222-4222-8222-22222222aaaa';
const DRAFT = '44444444-4444-4444-4444-444444444401';
const HERO_AATROX = '33333333-3333-4333-8333-333333330001';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h' },
    query: {},
    body: {},
    cookies: {},
    socket: { remoteAddress: '127.0.0.1' },
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

const TEAM_1 = '550e8400-e29b-41d4-a716-446655440b01';
const TEAM_2 = '550e8400-e29b-41d4-a716-446655440b02';

beforeEach(() => {
  resetSupabaseMock();
  store.matches = [
    {
      id: MATCH,
      tenant_id: TENANT,
      tournament_id: TOURN,
      match_format: 'bo1',
      team1_id: TEAM_1,
      team2_id: TEAM_2,
    },
  ] as any;
  store.tournaments = [{ id: TOURN, game: 'lol', tenant_id: TENANT }] as any;
  store.teams = [
    { id: TEAM_1, name: 'Phoenix', tenant_id: TENANT },
    { id: TEAM_2, name: 'Dragons', tenant_id: TENANT },
  ] as any;
  store.game_heroes = [
    {
      id: HERO_AATROX,
      game: 'lol',
      external_id: '266',
      key: 'Aatrox',
      name: 'Aatrox',
      enabled: true,
      image_url: 'https://ddragon/.../Aatrox_0.jpg',
      icon_url: 'https://ddragon/.../Aatrox.png',
    },
  ] as any;
  store.match_drafts = [
    {
      id: DRAFT,
      match_id: MATCH,
      game_index: 1,
      game: 'lol',
      tenant_id: TENANT,
      status: 'in_progress',
      current_step: 1,
      team1_side: 'blue',
      team2_side: 'red',
      fearless: false,
      pick_timer_seconds: 30,
    },
  ] as any;
  // Seed only step 1 as committed; the remaining 19 stay null (engine
  // assembles the DraftState by walking the flow definition).
  store.match_draft_steps = LOL.draftFlows!.bo1!.steps.map((s, idx) => ({
    id: `step-${idx + 1}`,
    draft_id: DRAFT,
    step_number: s.step_number,
    phase: s.phase,
    action: s.action,
    side: s.side,
    hero_id: s.step_number === 1 ? HERO_AATROX : null,
    auto_picked: false,
    deadline_at: null,
    committed_at: s.step_number === 1 ? '2026-05-26T00:00:00.000Z' : null,
  })) as any;
});

describe('GET /api/matches/[matchId]/drafts/[gameIndex]', () => {
  it('returns the assembled DraftState + team names without auth', async () => {
    const req = makeReq({
      query: { matchId: MATCH, gameIndex: '1' },
    });
    const res = makeRes();
    await publicDraftHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.draft.draft.id).toBe(DRAFT);
    expect(res.body.draft.draft.status).toBe('in_progress');
    expect(res.body.draft.bannedHeroes).toHaveLength(1);
    expect(res.body.draft.bannedHeroes[0].id).toBe(HERO_AATROX);
    expect(res.body.teams).toEqual({
      team1Name: 'Phoenix',
      team2Name: 'Dragons',
    });
    expect(res.headers['Cache-Control']).toMatch(/s-maxage=5/);
  });

  it('returns 404 when the match does not exist', async () => {
    store.matches = [] as any;
    const req = makeReq({
      query: { matchId: MATCH, gameIndex: '1' },
    });
    const res = makeRes();
    await publicDraftHandler(req, res);

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for a non-UUID matchId', async () => {
    const req = makeReq({
      query: { matchId: 'not-a-uuid', gameIndex: '1' },
    });
    const res = makeRes();
    await publicDraftHandler(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for non-numeric gameIndex', async () => {
    const req = makeReq({
      query: { matchId: MATCH, gameIndex: 'oops' },
    });
    const res = makeRes();
    await publicDraftHandler(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('returns 200 with null draft when no draft has been initialised', async () => {
    store.match_drafts = [] as any;
    store.match_draft_steps = [] as any;
    const req = makeReq({
      query: { matchId: MATCH, gameIndex: '1' },
    });
    const res = makeRes();
    await publicDraftHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.draft).toBeNull();
  });

  it('rejects non-GET methods', async () => {
    const req = makeReq({
      method: 'POST',
      query: { matchId: MATCH, gameIndex: '1' },
    });
    const res = makeRes();
    await publicDraftHandler(req, res);

    expect(res.statusCode).toBe(405);
  });
});
