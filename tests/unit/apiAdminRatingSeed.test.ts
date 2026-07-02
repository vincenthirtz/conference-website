import { describe, it, expect, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import previewHandler from '../../pages/api/admin/stages/[stageId]/rating-seeding-preview';
import seedHandler from '../../pages/api/admin/stages/[stageId]/rating-seed';

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
const TGT_STAGE = '22222222-2222-2222-2222-222222222222';
const M1 = '33333333-3333-3333-3333-333333333331';
const M2 = '33333333-3333-3333-3333-333333333332';
const T1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const T2 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';

function seedBracketStage() {
  store.tournaments = [{ id: TID, name: 'Cup', status: 'running' }] as any;
  store.tournament_stages = [
    {
      id: TGT_STAGE,
      tournament_id: TID,
      name: 'Bracket',
      stage_type: 'bracket',
      order_index: 0,
    },
  ] as any;
  store.teams = [
    { id: T1, name: 'Alpha', short_name: 'AL', logo_url: null },
    { id: T2, name: 'Bravo', short_name: 'BR', logo_url: null },
  ] as any;
  store.stage_teams = [
    { stage_id: TGT_STAGE, team_id: T1, seed: 0, is_substitute: false },
    { stage_id: TGT_STAGE, team_id: T2, seed: 0, is_substitute: false },
  ] as any;
  store.team_ratings = [
    { team_id: T1, rating: 1400, rd: 60, games_played: 12 },
    { team_id: T2, rating: 1700, rd: 50, games_played: 20 },
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
      is_bye: false,
      created_at: '2026-05-01T00:00:00Z',
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow()] as any;
  seedBracketStage();
});

/* ===========================================================================
 * rating-seeding-preview
 * =========================================================================*/

describe('GET /api/admin/stages/[stageId]/rating-seeding-preview', () => {
  it('400 when stageId invalid', async () => {
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

  it('400 when no teams are registered in the stage', async () => {
    store.stage_teams = [];
    const res = makeRes();
    await previewHandler(makeReq({ query: { stageId: TGT_STAGE } }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/Aucune équipe/);
  });

  it('happy path: breakdown sorted by rating desc, ranks distinct', async () => {
    const res = makeRes();
    await previewHandler(
      makeReq({ query: { stageId: TGT_STAGE, method: 'rating' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.method).toBe('rating');
    expect(body.bracketMatchCount).toBe(1);
    expect(body.lock.locked).toBe(false);
    // Higher rating (Bravo 1700) ranks first.
    expect(body.breakdown).toHaveLength(2);
    expect(body.breakdown[0].teamId).toBe(T2);
    expect(body.breakdown[0].rank).toBe(1);
    expect(body.breakdown[0].teamName).toBe('Bravo');
    expect(body.breakdown[1].teamId).toBe(T1);
    expect(body.breakdown[1].rank).toBe(2);
    // Proposed places both teams into the single round-1 match.
    expect(body.proposed).toHaveLength(2);
  });

  it('lock=true when a round-1 match is finished (does not block preview)', async () => {
    (store.matches as any[])[0].status = 'finished';
    const res = makeRes();
    await previewHandler(makeReq({ query: { stageId: TGT_STAGE } }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).lock.locked).toBe(true);
  });
});

/* ===========================================================================
 * rating-seed (apply)
 * =========================================================================*/

describe('POST /api/admin/stages/[stageId]/rating-seed', () => {
  it('409 when a round-1 match is finished (lock guard)', async () => {
    (store.matches as any[])[0].status = 'finished';
    const res = makeRes();
    await seedHandler(
      makeReq({ method: 'POST', query: { stageId: TGT_STAGE }, body: {} }),
      res
    );
    expect(res.statusCode).toBe(409);
  });

  it('200 writes slots and updates stage_teams seed', async () => {
    const res = makeRes();
    await seedHandler(
      makeReq({
        method: 'POST',
        query: { stageId: TGT_STAGE },
        body: { method: 'rating', pattern: 'standard' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.seeded).toHaveLength(2);
    expect(body.totalMatches).toBe(1);
    // Slots written on the round-1 match.
    const m1 = (store.matches as any[]).find((m) => m.id === M1);
    expect([m1.team1_id, m1.team2_id].sort()).toEqual([T1, T2].sort());
    // Top seed (Bravo) got seed=1 in stage_teams.
    const st2 = (store.stage_teams as any[]).find((r) => r.team_id === T2);
    expect(st2.seed).toBe(1);
  });
});
