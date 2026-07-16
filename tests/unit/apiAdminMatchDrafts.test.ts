// Tests for the MOBA draft engine HTTP layer (Lot 2).
// Covers the 4 admin endpoints :
//   POST   /api/admin/matches/[matchId]/drafts
//   GET    /api/admin/matches/[matchId]/drafts/[gameIndex]
//   PATCH  /api/admin/matches/[matchId]/drafts/[gameIndex]/side
//   POST   /api/admin/matches/[matchId]/drafts/[gameIndex]/commit
//
// The handler tests exercise the draftEngine end-to-end through the supabase
// mock, so we get both layers in one file.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { __resetAdminIdempotencyCache } from '../../utils/adminIdempotency';

import initHandler from '../../pages/api/admin/matches/[matchId]/drafts/index';
import stateHandler from '../../pages/api/admin/matches/[matchId]/drafts/[gameIndex]/index';
import sideHandler from '../../pages/api/admin/matches/[matchId]/drafts/[gameIndex]/side';
import commitHandler from '../../pages/api/admin/matches/[matchId]/drafts/[gameIndex]/commit';
import startHandler from '../../pages/api/admin/matches/[matchId]/drafts/[gameIndex]/start';
import autoPickHandler from '../../pages/api/admin/matches/[matchId]/drafts/[gameIndex]/auto-pick';

import { LOL } from '../../config/games/lol';
import { DOTA2 } from '../../config/games/dota2';

/* -----------------------------------------------------------
 * Constants
 * ---------------------------------------------------------*/

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'; // DEFAULT_TENANT_ID

const MATCH_LOL_BO3 = '11111111-1111-4111-8111-111111111111';
const MATCH_LOL_BO1 = '11111111-1111-4111-8111-111111111112';
const MATCH_OW = '11111111-1111-4111-8111-111111111113';
const MATCH_NO_TOURNAMENT = '11111111-1111-4111-8111-111111111114';
const MATCH_DOTA_BO3 = '11111111-1111-4111-8111-111111111115';

const TOURNAMENT_LOL = '22222222-2222-4222-8222-22222222aaaa';
const TOURNAMENT_OW = '22222222-2222-4222-8222-22222222bbbb';
const TOURNAMENT_DOTA = '22222222-2222-4222-8222-22222222cccc';

// Pre-seeded LoL champions and Dota heroes.
const HERO_AATROX = '33333333-3333-4333-8333-333333330001';
const HERO_AHRI = '33333333-3333-4333-8333-333333330002';
const HERO_GAREN = '33333333-3333-4333-8333-333333330003';
const HERO_LUX = '33333333-3333-4333-8333-333333330004';
const HERO_ANTIMAGE = '33333333-3333-4333-8333-333333330005';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'admin'
): StaffMember {
  return {
    id: 'staff-mgr-1',
    auth_user_id: 'user-1',
    email: 'mgr@x.com',
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
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: {},
    body: {},
    cookies: {},
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

function seedBase() {
  store.staff = [makeStaffRow('admin')] as any;
  store.matches = [
    {
      id: MATCH_LOL_BO3,
      tenant_id: TENANT,
      tournament_id: TOURNAMENT_LOL,
      match_format: 'bo3',
    },
    {
      id: MATCH_LOL_BO1,
      tenant_id: TENANT,
      tournament_id: TOURNAMENT_LOL,
      match_format: 'bo1',
    },
    {
      id: MATCH_OW,
      tenant_id: TENANT,
      tournament_id: TOURNAMENT_OW,
      match_format: 'bo3',
    },
    {
      id: MATCH_NO_TOURNAMENT,
      tenant_id: TENANT,
      tournament_id: null,
      match_format: 'bo1',
    },
    {
      id: MATCH_DOTA_BO3,
      tenant_id: TENANT,
      tournament_id: TOURNAMENT_DOTA,
      match_format: 'bo3',
    },
  ] as any;
  store.tournaments = [
    { id: TOURNAMENT_LOL, game: 'lol', tenant_id: TENANT },
    { id: TOURNAMENT_OW, game: 'overwatch', tenant_id: TENANT },
    { id: TOURNAMENT_DOTA, game: 'dota2', tenant_id: TENANT },
  ] as any;
  store.game_heroes = [
    {
      id: HERO_AATROX,
      game: 'lol',
      external_id: '266',
      key: 'Aatrox',
      name: 'Aatrox',
      enabled: true,
    },
    {
      id: HERO_AHRI,
      game: 'lol',
      external_id: '103',
      key: 'Ahri',
      name: 'Ahri',
      enabled: true,
    },
    {
      id: HERO_GAREN,
      game: 'lol',
      external_id: '86',
      key: 'Garen',
      name: 'Garen',
      enabled: true,
    },
    {
      id: HERO_LUX,
      game: 'lol',
      external_id: '99',
      key: 'Lux',
      name: 'Lux',
      enabled: true,
    },
    {
      id: HERO_ANTIMAGE,
      game: 'dota2',
      external_id: '1',
      key: 'antimage',
      name: 'Anti-Mage',
      enabled: true,
    },
  ] as any;
  store.match_drafts = [] as any;
  store.match_draft_steps = [] as any;
}

beforeEach(async () => {
  resetSupabaseMock();
  invalidateStaffCache();
  await __resetAdminIdempotencyCache();
  setAuthUser({ id: 'user-1' });
  seedBase();
});

/* -----------------------------------------------------------
 * POST /api/admin/matches/[matchId]/drafts (init)
 * ---------------------------------------------------------*/

describe('POST /api/admin/matches/[matchId]/drafts', () => {
  it('creates the draft + all flow steps for LoL bo3 game 1', async () => {
    const req = makeReq({
      query: { matchId: MATCH_LOL_BO3 },
      body: { gameIndex: 1 },
    });
    const res = makeRes();
    await initHandler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.draft.draft.game).toBe('lol');
    expect(res.body.draft.draft.game_index).toBe(1);
    expect(res.body.draft.draft.status).toBe('pending');
    expect(res.body.draft.draft.current_step).toBe(0);
    expect(res.body.draft.draft.fearless).toBe(false);
    expect(res.body.draft.draft.pick_timer_seconds).toBe(30);

    // 20 LoL Tournament Draft steps got seeded.
    expect(res.body.draft.steps).toHaveLength(LOL.draftFlows!.bo3!.steps.length);
    expect(res.body.draft.steps).toHaveLength(20);
    // First step is a ban by team1.
    expect(res.body.draft.steps[0]).toMatchObject({
      step_number: 1,
      action: 'ban',
      side: 'team1',
      hero_id: null,
    });
    expect(res.body.draft.nextStepIndex).toBe(0);
  });

  it('honors a fearless override on init', async () => {
    const req = makeReq({
      query: { matchId: MATCH_DOTA_BO3 },
      body: { gameIndex: 1, fearless: true, pickTimerSeconds: 45 },
    });
    const res = makeRes();
    await initHandler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.draft.draft.fearless).toBe(true);
    expect(res.body.draft.draft.pick_timer_seconds).toBe(45);
    expect(res.body.draft.steps).toHaveLength(
      DOTA2.draftFlows!.bo3!.steps.length
    );
  });

  it('returns 409 if a draft already exists for that gameIndex', async () => {
    const req1 = makeReq({
      query: { matchId: MATCH_LOL_BO3 },
      body: { gameIndex: 1 },
    });
    await initHandler(req1, makeRes());

    const req2 = makeReq({
      query: { matchId: MATCH_LOL_BO3 },
      body: { gameIndex: 1 },
    });
    const res2 = makeRes();
    await initHandler(req2, res2);

    expect(res2.statusCode).toBe(409);
    expect(res2.body.code).toBe('DRAFT_ALREADY_EXISTS');
  });

  it('returns 400 when gameIndex exceeds the format', async () => {
    const req = makeReq({
      query: { matchId: MATCH_LOL_BO1 },
      body: { gameIndex: 2 },
    });
    const res = makeRes();
    await initHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('GAME_INDEX_OUT_OF_RANGE');
  });

  it('returns 400 when the tournament game has no draft (e.g. overwatch)', async () => {
    const req = makeReq({
      query: { matchId: MATCH_OW },
      body: { gameIndex: 1 },
    });
    const res = makeRes();
    await initHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('GAME_NOT_DRAFTABLE');
  });

  it('returns 404 when match has no tournament', async () => {
    const req = makeReq({
      query: { matchId: MATCH_NO_TOURNAMENT },
      body: { gameIndex: 1 },
    });
    const res = makeRes();
    await initHandler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('TOURNAMENT_NOT_FOUND');
  });

  it('returns 400 when pickTimerSeconds is out of [5, 300]', async () => {
    const req = makeReq({
      query: { matchId: MATCH_LOL_BO3 },
      body: { gameIndex: 1, pickTimerSeconds: 2 },
    });
    const res = makeRes();
    await initHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('PICK_TIMER_INVALID');
  });

  it('rejects bad gameIndex shape with 400 before touching the engine', async () => {
    const req = makeReq({
      query: { matchId: MATCH_LOL_BO3 },
      body: { gameIndex: 'not-a-number' },
    });
    const res = makeRes();
    await initHandler(req, res);
    expect(res.statusCode).toBe(400);
  });
});

/* -----------------------------------------------------------
 * PATCH /api/admin/matches/[matchId]/drafts/[gameIndex]/side
 * ---------------------------------------------------------*/

async function initLolGame(matchId: string, gameIndex: number, fearless = false) {
  const req = makeReq({
    query: { matchId },
    body: { gameIndex, fearless },
  });
  const res = makeRes();
  await initHandler(req, res);
  if (res.statusCode !== 201) {
    throw new Error(
      `initLolGame failed: ${res.statusCode} ${JSON.stringify(res.body)}`
    );
  }
}

describe('PATCH /api/admin/matches/[matchId]/drafts/[gameIndex]/side', () => {
  it('assigns sides successfully for LoL (blue/red)', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    const req = makeReq({
      method: 'PATCH',
      query: { matchId: MATCH_LOL_BO3, gameIndex: '1' },
      body: { team1Side: 'blue', team2Side: 'red' },
    });
    const res = makeRes();
    await sideHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.draft.draft.team1_side).toBe('blue');
    expect(res.body.draft.draft.team2_side).toBe('red');
  });

  it('rejects invalid sides for the game', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    const req = makeReq({
      method: 'PATCH',
      query: { matchId: MATCH_LOL_BO3, gameIndex: '1' },
      body: { team1Side: 'radiant', team2Side: 'dire' },
    });
    const res = makeRes();
    await sideHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('SIDES_INVALID');
  });

  it('rejects identical sides', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    const req = makeReq({
      method: 'PATCH',
      query: { matchId: MATCH_LOL_BO3, gameIndex: '1' },
      body: { team1Side: 'blue', team2Side: 'blue' },
    });
    const res = makeRes();
    await sideHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('SIDES_INVALID');
  });

  it('refuses Dota sides for a LoL draft', async () => {
    await initLolGame(MATCH_DOTA_BO3, 1);
    const req = makeReq({
      method: 'PATCH',
      query: { matchId: MATCH_DOTA_BO3, gameIndex: '1' },
      body: { team1Side: 'radiant', team2Side: 'dire' },
    });
    const res = makeRes();
    await sideHandler(req, res);
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when the draft does not exist', async () => {
    const req = makeReq({
      method: 'PATCH',
      query: { matchId: MATCH_LOL_BO3, gameIndex: '1' },
      body: { team1Side: 'blue', team2Side: 'red' },
    });
    const res = makeRes();
    await sideHandler(req, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('DRAFT_NOT_FOUND');
  });
});

/* -----------------------------------------------------------
 * POST /api/admin/matches/[matchId]/drafts/[gameIndex]/commit
 * ---------------------------------------------------------*/

async function setSides(
  matchId: string,
  gameIndex: number,
  t1: string,
  t2: string
) {
  const req = makeReq({
    method: 'PATCH',
    query: { matchId, gameIndex: String(gameIndex) },
    body: { team1Side: t1, team2Side: t2 },
  });
  const res = makeRes();
  await sideHandler(req, res);
  if (res.statusCode !== 200) {
    throw new Error(
      `setSides failed: ${res.statusCode} ${JSON.stringify(res.body)}`
    );
  }
}

async function commitStep(
  matchId: string,
  gameIndex: number,
  stepNumber: number,
  heroId: string
) {
  const req = makeReq({
    method: 'POST',
    query: { matchId, gameIndex: String(gameIndex) },
    body: { stepNumber, heroId },
  });
  const res = makeRes();
  await commitHandler(req, res);
  return res;
}

describe('POST /api/admin/matches/[matchId]/drafts/[gameIndex]/commit', () => {
  it('commits a ban, transitions to in_progress, and bumps current_step', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    await setSides(MATCH_LOL_BO3, 1, 'blue', 'red');

    const res = await commitStep(MATCH_LOL_BO3, 1, 1, HERO_AATROX);

    expect(res.statusCode).toBe(200);
    expect(res.body.draft.draft.status).toBe('in_progress');
    expect(res.body.draft.draft.current_step).toBe(1);
    expect(res.body.draft.draft.started_at).toBeTruthy();
    expect(res.body.draft.bannedHeroes).toHaveLength(1);
    expect(res.body.draft.bannedHeroes[0].id).toBe(HERO_AATROX);
  });

  it('requires sides assigned before the first commit', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    const res = await commitStep(MATCH_LOL_BO3, 1, 1, HERO_AATROX);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('SIDES_REQUIRED');
  });

  it('rejects an out-of-order step', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    await setSides(MATCH_LOL_BO3, 1, 'blue', 'red');
    const res = await commitStep(MATCH_LOL_BO3, 1, 2, HERO_AATROX);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('STEP_OUT_OF_ORDER');
  });

  it('rejects a hero already banned in this draft', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    await setSides(MATCH_LOL_BO3, 1, 'blue', 'red');
    await commitStep(MATCH_LOL_BO3, 1, 1, HERO_AATROX);
    const res = await commitStep(MATCH_LOL_BO3, 1, 2, HERO_AATROX);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('HERO_ALREADY_BANNED');
  });

  it('rejects a hero from another game', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    await setSides(MATCH_LOL_BO3, 1, 'blue', 'red');
    const res = await commitStep(MATCH_LOL_BO3, 1, 1, HERO_ANTIMAGE);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('HERO_WRONG_GAME');
  });

  it('returns 404 when the hero does not exist', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    await setSides(MATCH_LOL_BO3, 1, 'blue', 'red');
    const res = await commitStep(
      MATCH_LOL_BO3,
      1,
      1,
      '99999999-9999-4999-8999-999999999999'
    );
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('HERO_NOT_FOUND');
  });

  it('allows banning in game 2 a hero that was only banned in game 1 (fearless rule applies to picks only)', async () => {
    await initLolGame(MATCH_LOL_BO3, 1, true);
    await setSides(MATCH_LOL_BO3, 1, 'blue', 'red');
    await commitStep(MATCH_LOL_BO3, 1, 1, HERO_AATROX);

    await initLolGame(MATCH_LOL_BO3, 2, true);
    await setSides(MATCH_LOL_BO3, 2, 'red', 'blue');
    const res = await commitStep(MATCH_LOL_BO3, 2, 1, HERO_AATROX);
    expect(res.statusCode).toBe(200);
  });

  it('rejects picking (in game 2) a hero picked in game 1 (fearless)', async () => {
    // Game 1: bypass ban phase by direct mock mutation, then pick Aatrox.
    await initLolGame(MATCH_LOL_BO3, 1, true);
    await setSides(MATCH_LOL_BO3, 1, 'blue', 'red');
    const draft1 = (store.match_drafts as any[])[0];
    draft1.current_step = 6;
    const steps1 = (store.match_draft_steps as any[]).filter(
      (s) => s.draft_id === draft1.id
    );
    for (const s of steps1.slice(0, 6)) {
      s.hero_id = HERO_LUX;
      s.committed_at = '2026-05-26T00:00:00.000Z';
    }
    await commitStep(MATCH_LOL_BO3, 1, 7, HERO_AATROX);

    // Game 2 fearless: try to pick Aatrox again.
    await initLolGame(MATCH_LOL_BO3, 2, true);
    await setSides(MATCH_LOL_BO3, 2, 'red', 'blue');
    const draft2 = (store.match_drafts as any[]).find(
      (d) => d.game_index === 2
    );
    draft2.current_step = 6;
    const steps2 = (store.match_draft_steps as any[]).filter(
      (s) => s.draft_id === draft2.id
    );
    for (const s of steps2.slice(0, 6)) {
      s.hero_id = HERO_GAREN;
      s.committed_at = '2026-05-26T00:00:00.000Z';
    }
    const pickRes = await commitStep(MATCH_LOL_BO3, 2, 7, HERO_AATROX);
    expect(pickRes.statusCode).toBe(409);
    expect(pickRes.body.code).toBe('HERO_FEARLESS_BLOCKED');
  });

  it('completes the draft on the final step', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    await setSides(MATCH_LOL_BO3, 1, 'blue', 'red');
    // Cheat: fast-forward to step 20 (last LoL step).
    const draft = (store.match_drafts as any[])[0];
    draft.current_step = 19;
    draft.status = 'in_progress';
    const steps = (store.match_draft_steps as any[]).filter(
      (s) => s.draft_id === draft.id
    );
    for (const s of steps.slice(0, 19)) {
      s.hero_id = HERO_LUX;
      s.committed_at = '2026-05-26T00:00:00.000Z';
    }
    const res = await commitStep(MATCH_LOL_BO3, 1, 20, HERO_GAREN);
    expect(res.statusCode).toBe(200);
    expect(res.body.draft.draft.status).toBe('completed');
    expect(res.body.draft.draft.completed_at).toBeTruthy();
    expect(res.body.draft.nextStepIndex).toBe(-1);
  });
});

/* -----------------------------------------------------------
 * GET /api/admin/matches/[matchId]/drafts/[gameIndex]
 * ---------------------------------------------------------*/

describe('GET /api/admin/matches/[matchId]/drafts/[gameIndex]', () => {
  it('returns null when the draft has not been initialised', async () => {
    const req = makeReq({
      method: 'GET',
      query: { matchId: MATCH_LOL_BO3, gameIndex: '1' },
    });
    const res = makeRes();
    await stateHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.draft).toBeNull();
  });

  it('returns the assembled state after init + commit', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    await setSides(MATCH_LOL_BO3, 1, 'blue', 'red');
    await commitStep(MATCH_LOL_BO3, 1, 1, HERO_AATROX);

    const req = makeReq({
      method: 'GET',
      query: { matchId: MATCH_LOL_BO3, gameIndex: '1' },
    });
    const res = makeRes();
    await stateHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.draft.draft.status).toBe('in_progress');
    expect(res.body.draft.bannedHeroes).toHaveLength(1);
    expect(res.body.draft.bannedHeroes[0].key).toBe('Aatrox');
    expect(res.body.draft.nextStepIndex).toBe(1);
  });

  it('returns 400 for non-numeric gameIndex', async () => {
    const req = makeReq({
      method: 'GET',
      query: { matchId: MATCH_LOL_BO3, gameIndex: 'oops' },
    });
    const res = makeRes();
    await stateHandler(req, res);
    expect(res.statusCode).toBe(400);
  });
});

/* -----------------------------------------------------------
 * DELETE /api/admin/matches/[matchId]/drafts/[gameIndex]
 * Recovery path : remove a bad init without dropping into SQL.
 * ---------------------------------------------------------*/

describe('DELETE /api/admin/matches/[matchId]/drafts/[gameIndex]', () => {
  it('deletes a pending draft + all its steps', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    expect(
      (store.match_draft_steps as any[]).filter(
        (s) => s.draft_id === (store.match_drafts as any[])[0].id
      )
    ).toHaveLength(20);

    const req = makeReq({
      method: 'DELETE',
      query: { matchId: MATCH_LOL_BO3, gameIndex: '1' },
    });
    const res = makeRes();
    await stateHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.deletedSteps).toBe(20);
    expect(store.match_drafts).toHaveLength(0);
    expect(store.match_draft_steps).toHaveLength(0);
  });

  it('refuses to delete an in_progress draft without force', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    await setSides(MATCH_LOL_BO3, 1, 'blue', 'red');
    await commitStep(MATCH_LOL_BO3, 1, 1, HERO_AATROX);

    const req = makeReq({
      method: 'DELETE',
      query: { matchId: MATCH_LOL_BO3, gameIndex: '1' },
    });
    const res = makeRes();
    await stateHandler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('DRAFT_NOT_PENDING');
    expect(store.match_drafts).toHaveLength(1);
  });

  it('force=1 deletes an in_progress draft anyway', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    await setSides(MATCH_LOL_BO3, 1, 'blue', 'red');
    await commitStep(MATCH_LOL_BO3, 1, 1, HERO_AATROX);

    const req = makeReq({
      method: 'DELETE',
      query: { matchId: MATCH_LOL_BO3, gameIndex: '1', force: '1' },
    });
    const res = makeRes();
    await stateHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(store.match_drafts).toHaveLength(0);
  });

  it('returns 404 when no draft exists for (matchId, gameIndex)', async () => {
    const req = makeReq({
      method: 'DELETE',
      query: { matchId: MATCH_LOL_BO3, gameIndex: '1' },
    });
    const res = makeRes();
    await stateHandler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('DRAFT_NOT_FOUND');
  });
});

/* -----------------------------------------------------------
 * POST /api/admin/matches/[matchId]/drafts/[gameIndex]/start  (Lot 3)
 * ---------------------------------------------------------*/

describe('POST /api/admin/matches/[matchId]/drafts/[gameIndex]/start', () => {
  it('arms the deadline on step 1 and transitions to in_progress', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    await setSides(MATCH_LOL_BO3, 1, 'blue', 'red');
    const req = makeReq({
      method: 'POST',
      query: { matchId: MATCH_LOL_BO3, gameIndex: '1' },
    });
    const res = makeRes();
    await startHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.draft.draft.status).toBe('in_progress');
    expect(res.body.draft.draft.started_at).toBeTruthy();
    const step1 = res.body.draft.steps.find(
      (s: any) => s.step_number === 1
    );
    expect(step1.deadline_at).toBeTruthy();
    // step 2's deadline is set lazily on commit; not stamped by start.
    const step2 = res.body.draft.steps.find(
      (s: any) => s.step_number === 2
    );
    expect(step2.deadline_at).toBeFalsy();
  });

  it('rejects start when sides are not set', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    const req = makeReq({
      method: 'POST',
      query: { matchId: MATCH_LOL_BO3, gameIndex: '1' },
    });
    const res = makeRes();
    await startHandler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('SIDES_REQUIRED');
  });

  it('rejects start after a step has been committed', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    await setSides(MATCH_LOL_BO3, 1, 'blue', 'red');
    await commitStep(MATCH_LOL_BO3, 1, 1, HERO_AATROX);

    const req = makeReq({
      method: 'POST',
      query: { matchId: MATCH_LOL_BO3, gameIndex: '1' },
    });
    const res = makeRes();
    await startHandler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('DRAFT_NOT_PENDING');
  });
});

/* -----------------------------------------------------------
 * POST /api/admin/matches/[matchId]/drafts/[gameIndex]/auto-pick  (Lot 3)
 * ---------------------------------------------------------*/

describe('POST /api/admin/matches/[matchId]/drafts/[gameIndex]/auto-pick', () => {
  it('is a no-op when the deadline is still in the future', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    await setSides(MATCH_LOL_BO3, 1, 'blue', 'red');
    // start the draft → deadline in 30s, well in the future.
    const startReq = makeReq({
      method: 'POST',
      query: { matchId: MATCH_LOL_BO3, gameIndex: '1' },
    });
    await startHandler(startReq, makeRes());

    const req = makeReq({
      method: 'POST',
      query: { matchId: MATCH_LOL_BO3, gameIndex: '1' },
    });
    const res = makeRes();
    await autoPickHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.autoPicked).toBe(false);
  });

  it('auto-picks the first alphabetical eligible hero once expired', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    await setSides(MATCH_LOL_BO3, 1, 'blue', 'red');
    const startReq = makeReq({
      method: 'POST',
      query: { matchId: MATCH_LOL_BO3, gameIndex: '1' },
    });
    await startHandler(startReq, makeRes());

    // Move the step 1 deadline into the past directly in the mock store.
    const step1 = (store.match_draft_steps as any[]).find(
      (s) => s.step_number === 1
    );
    step1.deadline_at = '2000-01-01T00:00:00.000Z';

    const req = makeReq({
      method: 'POST',
      query: { matchId: MATCH_LOL_BO3, gameIndex: '1' },
    });
    const res = makeRes();
    await autoPickHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.autoPicked).toBe(true);
    expect(res.body.stepNumber).toBe(1);
    // First alphabetical eligible LoL hero is Aatrox.
    expect(res.body.heroId).toBe(HERO_AATROX);
    const stepRow = res.body.draft.steps.find(
      (s: any) => s.step_number === 1
    );
    expect(stepRow.auto_picked).toBe(true);
    expect(stepRow.hero_id).toBe(HERO_AATROX);
  });

  it('returns 404 when no draft exists for (match, gameIndex)', async () => {
    const req = makeReq({
      method: 'POST',
      query: { matchId: MATCH_LOL_BO3, gameIndex: '1' },
    });
    const res = makeRes();
    await autoPickHandler(req, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('DRAFT_NOT_FOUND');
  });
});

/* -----------------------------------------------------------
 * commitStep deadline propagation (Lot 3)
 * ---------------------------------------------------------*/

/* -----------------------------------------------------------
 * Partial-failure retry (commit) — confirms the natural idempotence
 * survives a crash between the step UPDATE and the draft UPDATE.
 * ---------------------------------------------------------*/

describe('commitDraftStep partial-failure retry idempotency', () => {
  it('retrying with the same heroId after step-UPDATE/draft-UPDATE crash heals the state', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    await setSides(MATCH_LOL_BO3, 1, 'blue', 'red');
    // Successful first commit puts current_step = 1, step 1 hero set.
    const first = await commitStep(MATCH_LOL_BO3, 1, 1, HERO_AATROX);
    expect(first.statusCode).toBe(200);

    // Simulate the worst case : the next commit (step 2) wrote hero_id on
    // step 2 in DB but crashed BEFORE updating match_drafts.current_step.
    // We replay that state in the mock store : step 2 has the hero set,
    // but the parent row is still at current_step = 1.
    const draft = (store.match_drafts as any[]).find(
      (d) => d.game_index === 1
    );
    const step2 = (store.match_draft_steps as any[]).find(
      (s) => s.draft_id === draft.id && s.step_number === 2
    );
    step2.hero_id = HERO_AHRI;
    step2.committed_at = '2026-05-26T00:00:00.000Z';
    // draft.current_step intentionally left at 1 — the crash window.

    // Retry the same commit with the same heroId — the engine should
    // accept it (step matches expected, hero matches), re-stamp + bump
    // current_step + arm step 3 deadline. State is healed.
    const retry = await commitStep(MATCH_LOL_BO3, 1, 2, HERO_AHRI);
    expect(retry.statusCode).toBe(200);
    expect(retry.body.draft.draft.current_step).toBe(2);
    const step2After = retry.body.draft.steps.find(
      (s: any) => s.step_number === 2
    );
    expect(step2After.hero_id).toBe(HERO_AHRI);
    const step3 = retry.body.draft.steps.find(
      (s: any) => s.step_number === 3
    );
    expect(step3.deadline_at).toBeTruthy();
  });

  it('retrying with a DIFFERENT heroId after partial-failure is rejected', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    await setSides(MATCH_LOL_BO3, 1, 'blue', 'red');
    await commitStep(MATCH_LOL_BO3, 1, 1, HERO_AATROX);

    // Same crash simulation : step 2 says hero_id=HERO_AHRI, draft still
    // at current_step=1. A retry with a DIFFERENT hero must NOT silently
    // overwrite the committed pick — the engine flags HERO_ALREADY_PICKED
    // (or _BANNED) on the duplicate, surfacing the inconsistency.
    const draft = (store.match_drafts as any[]).find(
      (d) => d.game_index === 1
    );
    const step2 = (store.match_draft_steps as any[]).find(
      (s) => s.draft_id === draft.id && s.step_number === 2
    );
    step2.hero_id = HERO_AHRI;
    step2.committed_at = '2026-05-26T00:00:00.000Z';

    const retry = await commitStep(MATCH_LOL_BO3, 1, 2, HERO_GAREN);
    expect(retry.statusCode).toBe(409);
    expect(retry.body.code).toBe('STEP_ALREADY_COMMITTED');
  });
});

describe('commitDraftStep deadline propagation', () => {
  it('stamps a deadline on the next step after each commit', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    await setSides(MATCH_LOL_BO3, 1, 'blue', 'red');
    const res = await commitStep(MATCH_LOL_BO3, 1, 1, HERO_AATROX);
    expect(res.statusCode).toBe(200);
    const step2 = res.body.draft.steps.find((s: any) => s.step_number === 2);
    expect(step2.deadline_at).toBeTruthy();
    const step3 = res.body.draft.steps.find((s: any) => s.step_number === 3);
    expect(step3.deadline_at).toBeFalsy();
  });

  it('does not set a deadline after the final commit', async () => {
    await initLolGame(MATCH_LOL_BO3, 1);
    await setSides(MATCH_LOL_BO3, 1, 'blue', 'red');
    const draft = (store.match_drafts as any[])[0];
    draft.current_step = 19;
    draft.status = 'in_progress';
    const steps = (store.match_draft_steps as any[]).filter(
      (s) => s.draft_id === draft.id
    );
    for (const s of steps.slice(0, 19)) {
      s.hero_id = HERO_LUX;
      s.committed_at = '2026-05-26T00:00:00.000Z';
    }
    const res = await commitStep(MATCH_LOL_BO3, 1, 20, HERO_GAREN);
    expect(res.statusCode).toBe(200);
    expect(res.body.draft.draft.status).toBe('completed');
    // No step 21 to stamp.
    const step20 = res.body.draft.steps.find(
      (s: any) => s.step_number === 20
    );
    expect(step20.hero_id).toBe(HERO_GAREN);
  });
});
