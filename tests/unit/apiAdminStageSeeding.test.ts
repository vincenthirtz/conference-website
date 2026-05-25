import { describe, it, expect, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import previewHandler from '../../pages/api/admin/stages/[stageId]/seeding-preview';
import autoSeedHandler from '../../pages/api/admin/stages/[stageId]/auto-seed';
import manualSeedHandler from '../../pages/api/admin/stages/[stageId]/manual-seed';

function makeStaffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'manager',
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

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: freshBearer() },
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

const TID = '550e8400-e29b-41d4-a716-446655440000';
const SRC_STAGE = '11111111-1111-1111-1111-111111111111';
const TGT_STAGE = '22222222-2222-2222-2222-222222222222';
const M1 = '33333333-3333-3333-3333-333333333331';
const M2 = '33333333-3333-3333-3333-333333333332';
const T1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const T2 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
const T3 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3';
const T4 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4';

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow()] as any;

  store.tournaments = [{ id: TID, name: 'Cup', status: 'running' }] as any;
  store.tournament_stages = [
    {
      id: SRC_STAGE,
      tournament_id: TID,
      name: 'Phase 1 – Swiss',
      stage_type: 'swiss',
      order_index: 0,
    },
    {
      id: TGT_STAGE,
      tournament_id: TID,
      name: 'Bracket',
      stage_type: 'bracket',
      order_index: 1,
    },
  ] as any;
  store.teams = [
    { id: T1, name: 'Alpha', short_name: 'AL', logo_url: null },
    { id: T2, name: 'Bravo', short_name: 'BR', logo_url: null },
    { id: T3, name: 'Charlie', short_name: 'CH', logo_url: null },
    { id: T4, name: 'Delta', short_name: 'DE', logo_url: null },
  ] as any;
  store.stage_teams = [
    { stage_id: TGT_STAGE, team_id: T1, seed: 1, is_substitute: false },
    { stage_id: TGT_STAGE, team_id: T2, seed: 2, is_substitute: false },
    { stage_id: TGT_STAGE, team_id: T3, seed: 3, is_substitute: false },
    { stage_id: TGT_STAGE, team_id: T4, seed: 4, is_substitute: false },
  ] as any;
  store.matches = [
    {
      id: M1,
      stage_id: TGT_STAGE,
      tournament_id: TID,
      round_number: 1,
      team1_id: null,
      team2_id: null,
      status: 'pending',
      created_at: '2026-05-01T00:00:00Z',
    },
    {
      id: M2,
      stage_id: TGT_STAGE,
      tournament_id: TID,
      round_number: 1,
      team1_id: null,
      team2_id: null,
      status: 'pending',
      created_at: '2026-05-02T00:00:00Z',
    },
  ] as any;
});

/* ===========================================================================
 * seeding-preview
 * =========================================================================*/

describe('GET /api/admin/stages/[stageId]/seeding-preview', () => {
  it('400 when stageId is invalid', async () => {
    const res = makeRes();
    await previewHandler(makeReq({ query: { stageId: 'bogus' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('405 on non-GET', async () => {
    const res = makeRes();
    await previewHandler(
      makeReq({ method: 'POST', query: { stageId: TGT_STAGE } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('404 when stage missing', async () => {
    store.tournament_stages = [];
    const res = makeRes();
    await previewHandler(makeReq({ query: { stageId: TGT_STAGE } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('400 when stage is not a bracket', async () => {
    const res = makeRes();
    await previewHandler(makeReq({ query: { stageId: SRC_STAGE } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('200 returns lock=false when no round-1 match is started', async () => {
    const res = makeRes();
    await previewHandler(makeReq({ query: { stageId: TGT_STAGE } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.lock.locked).toBe(false);
    expect(body.bracketSize).toBe(4);
    // 2 matches × 2 slots = 4 current slots (vides ici)
    expect(body.current).toHaveLength(4);
    // sources : 1 stage source (swiss)
    expect(body.sources).toHaveLength(1);
  });

  it('200 returns lock=true when a round-1 match is ongoing', async () => {
    (store.matches as any[])[0].status = 'ongoing';
    const res = makeRes();
    await previewHandler(makeReq({ query: { stageId: TGT_STAGE } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.lock.locked).toBe(true);
    expect(body.lock.lockedMatchCount).toBe(1);
  });
});

/* ===========================================================================
 * auto-seed lock guard
 * =========================================================================*/

describe('POST /api/admin/stages/[stageId]/auto-seed lock guard', () => {
  it('409 when a round-1 match is finished', async () => {
    (store.matches as any[])[0].status = 'finished';
    const res = makeRes();
    await autoSeedHandler(
      makeReq({
        method: 'POST',
        query: { stageId: TGT_STAGE },
        body: { sourceStageId: SRC_STAGE, seedingPattern: 'standard' },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).error).toMatch(/déjà joué/);
  });

  it('409 when ongoing', async () => {
    (store.matches as any[])[1].status = 'ongoing';
    const res = makeRes();
    await autoSeedHandler(
      makeReq({
        method: 'POST',
        query: { stageId: TGT_STAGE },
        body: { sourceStageId: SRC_STAGE, seedingPattern: 'standard' },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
  });

  it('walkover also triggers the lock', async () => {
    (store.matches as any[])[0].status = 'walkover';
    const res = makeRes();
    await autoSeedHandler(
      makeReq({
        method: 'POST',
        query: { stageId: TGT_STAGE },
        body: { sourceStageId: SRC_STAGE, seedingPattern: 'standard' },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
  });
});

/* ===========================================================================
 * manual-seed lock guard
 * =========================================================================*/

describe('POST /api/admin/stages/[stageId]/manual-seed lock guard', () => {
  it('409 when a target round-1 match is finished', async () => {
    (store.matches as any[])[0].status = 'finished';
    const res = makeRes();
    await manualSeedHandler(
      makeReq({
        method: 'POST',
        query: { stageId: TGT_STAGE },
        body: {
          replaceExisting: true,
          assignments: [{ matchId: M1, slot: 1, teamId: T1 }],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('STAGE_LOCKED');
  });

  it('200 when no round-1 match started (happy path)', async () => {
    const res = makeRes();
    await manualSeedHandler(
      makeReq({
        method: 'POST',
        query: { stageId: TGT_STAGE },
        body: {
          replaceExisting: true,
          assignments: [
            { matchId: M1, slot: 1, teamId: T1 },
            { matchId: M1, slot: 2, teamId: T2 },
            { matchId: M2, slot: 1, teamId: T3 },
            { matchId: M2, slot: 2, teamId: T4 },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).seeded).toHaveLength(4);
  });
});
