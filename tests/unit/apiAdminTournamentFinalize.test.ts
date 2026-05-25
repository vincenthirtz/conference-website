import { describe, it, expect, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import previewHandler from '../../pages/api/admin/tournament/[id]/podium-preview';
import finalizeHandler from '../../pages/api/admin/tournament/[id]/finalize';

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

function makeReq(over: Partial<any> = {}): any {
  const headers: Record<string, string> = {
    host: 'h',
    authorization: freshBearer(),
  };
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
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const TID = '550e8400-e29b-41d4-a716-446655440000';
const T1 = '11111111-1111-1111-1111-111111111111';
const T2 = '22222222-2222-2222-2222-222222222222';
const T3 = '33333333-3333-3333-3333-333333333333';
const T4 = '44444444-4444-4444-4444-444444444444';

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('manager')] as any;
  // baseline : 4 teams registered, running tournament
  store.tournaments = [
    { id: TID, name: 'Cup 2026', status: 'running',  },
  ] as any;
  store.tournament_teams = [
    { tournament_id: TID, team_id: T1 },
    { tournament_id: TID, team_id: T2 },
    { tournament_id: TID, team_id: T3 },
    { tournament_id: TID, team_id: T4 },
  ] as any;
  store.teams = [
    { id: T1, name: 'Alpha', short_name: 'AL', logo_url: null, slug: 'alpha' },
    { id: T2, name: 'Bravo', short_name: 'BR', logo_url: null, slug: 'bravo' },
    { id: T3, name: 'Charlie', short_name: 'CH', logo_url: null, slug: 'ch' },
    { id: T4, name: 'Delta', short_name: 'DE', logo_url: null, slug: 'de' },
  ] as any;
  store.tournament_stages = [];
  store.matches = [];
  store.final_rankings = [];
});

/* ------------------------------------------------------------
 * podium-preview
 * ----------------------------------------------------------*/

describe('GET /api/admin/tournament/[id]/podium-preview', () => {
  it('400 when id is invalid', async () => {
    const res = makeRes();
    await previewHandler(makeReq({ query: { id: 'bogus' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('405 on non-GET', async () => {
    const res = makeRes();
    await previewHandler(makeReq({ method: 'POST', query: { id: TID } }), res);
    expect(res.statusCode).toBe(405);
  });

  it('404 when tournament missing', async () => {
    store.tournaments = [];
    const res = makeRes();
    await previewHandler(makeReq({ query: { id: TID } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('200 with all candidates and no proposal when no bracket', async () => {
    const res = makeRes();
    await previewHandler(makeReq({ query: { id: TID } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.tournament.id).toBe(TID);
    expect(body.candidates).toHaveLength(4);
    // Pas de stage bracket -> aucune proposition
    expect(body.candidates.every((c: any) => c.proposed_rank === null)).toBe(
      true
    );
    expect(body.existing).toHaveLength(0);
  });

  it('200 returns existing rankings when already finalized', async () => {
    store.final_rankings = [
      {
        team_id: T1,
        rank: 1,
        prize: '1500€',
        notes: null,
        frozen_at: '2026-05-25T00:00:00Z',
        tournament_id: TID,
      },
      {
        team_id: T2,
        rank: 2,
        prize: '500€',
        notes: null,
        frozen_at: '2026-05-25T00:00:00Z',
        tournament_id: TID,
      },
    ] as any;
    const res = makeRes();
    await previewHandler(makeReq({ query: { id: TID } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.existing).toHaveLength(2);
    expect(body.existing[0].rank).toBe(1);
  });
});

/* ------------------------------------------------------------
 * finalize — validation
 * ----------------------------------------------------------*/

describe('POST /api/admin/tournament/[id]/finalize — validation', () => {
  it('405 on non-POST', async () => {
    const res = makeRes();
    await finalizeHandler(
      makeReq({ method: 'GET', query: { id: TID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('400 invalid UUID', async () => {
    const res = makeRes();
    await finalizeHandler(
      makeReq({
        method: 'POST',
        query: { id: 'bogus' },
        body: { rankings: [{ team_id: T1, rank: 1 }] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 empty rankings', async () => {
    const res = makeRes();
    await finalizeHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { rankings: [] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/non-empty/);
  });

  it('400 duplicate team_id in rankings', async () => {
    const res = makeRes();
    await finalizeHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          rankings: [
            { team_id: T1, rank: 1 },
            { team_id: T1, rank: 2 },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/Duplicate team_id/);
  });

  it('400 duplicate rank', async () => {
    const res = makeRes();
    await finalizeHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          rankings: [
            { team_id: T1, rank: 1 },
            { team_id: T2, rank: 1 },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/Duplicate rank/);
  });

  it('400 non-consecutive ranks (gap)', async () => {
    const res = makeRes();
    await finalizeHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          rankings: [
            { team_id: T1, rank: 1 },
            { team_id: T2, rank: 3 },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/consecutive/);
  });

  it('400 ranks not starting at 1', async () => {
    const res = makeRes();
    await finalizeHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          rankings: [
            { team_id: T1, rank: 2 },
            { team_id: T2, rank: 3 },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when tournament missing', async () => {
    store.tournaments = [];
    const res = makeRes();
    await finalizeHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { rankings: [{ team_id: T1, rank: 1 }] },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('409 when tournament status is not running', async () => {
    store.tournaments = [
      { id: TID, name: 'Cup', status: 'draft',  },
    ] as any;
    const res = makeRes();
    await finalizeHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { rankings: [{ team_id: T1, rank: 1 }] },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
  });

  it('400 when a team_id is not registered in this tournament', async () => {
    const FOREIGN = '99999999-9999-9999-9999-999999999999';
    const res = makeRes();
    await finalizeHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { rankings: [{ team_id: FOREIGN, rank: 1 }] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/not registered/);
  });
});

/* ------------------------------------------------------------
 * finalize — happy path + idempotency
 * ----------------------------------------------------------*/

describe('POST /api/admin/tournament/[id]/finalize — apply', () => {
  it('happy path : inserts rankings + flips status to completed + logs', async () => {
    const res = makeRes();
    await finalizeHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          rankings: [
            { team_id: T1, rank: 1, prize: '1500€' },
            { team_id: T2, rank: 2, prize: '500€' },
          ],
        },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.success).toBe(true);
    expect(body.tournament.status).toBe('completed');
    expect(body.already_finalized).toBe(false);

    expect(store.final_rankings).toHaveLength(2);
    expect((store.final_rankings as any[])[0].tournament_id).toBe(TID);
    expect((store.tournaments as any[])[0].status).toBe('completed');

    const log = (store.staff_logs as any[]).find(
      (l) => l.action === 'finalize_tournament'
    );
    expect(log).toBeDefined();
    expect(log.tournament_id).toBe(TID);
  });

  it('idempotent : second call with same payload returns already_finalized=true and does not duplicate rows', async () => {
    // First call
    const res1 = makeRes();
    await finalizeHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          rankings: [
            { team_id: T1, rank: 1 },
            { team_id: T2, rank: 2 },
          ],
        },
      }),
      res1
    );
    expect(res1.statusCode).toBe(200);
    expect((store.final_rankings as any[]).length).toBe(2);

    // Second call (same payload)
    const res2 = makeRes();
    await finalizeHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          rankings: [
            { team_id: T1, rank: 1 },
            { team_id: T2, rank: 2 },
          ],
        },
      }),
      res2
    );
    expect(res2.statusCode).toBe(200);
    expect((res2.body as any).already_finalized).toBe(true);
    // Pas de doublons
    expect((store.final_rankings as any[]).length).toBe(2);
  });

  it('409 when re-finalizing with a different payload without force', async () => {
    // Seed an already-finalized tournament
    store.tournaments = [
      { id: TID, name: 'Cup', status: 'completed',  },
    ] as any;
    store.final_rankings = [
      { tournament_id: TID, team_id: T1, rank: 1, prize: null, notes: null },
      { tournament_id: TID, team_id: T2, rank: 2, prize: null, notes: null },
    ] as any;

    const res = makeRes();
    await finalizeHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          rankings: [
            { team_id: T2, rank: 1 }, // swapped !
            { team_id: T1, rank: 2 },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).error).toMatch(/already finalized/);
  });

  it('force=true overwrites existing rankings and logs unfinalize + finalize', async () => {
    store.tournaments = [
      { id: TID, name: 'Cup', status: 'completed',  },
    ] as any;
    store.final_rankings = [
      { tournament_id: TID, team_id: T1, rank: 1, prize: null, notes: null },
      { tournament_id: TID, team_id: T2, rank: 2, prize: null, notes: null },
    ] as any;

    const res = makeRes();
    await finalizeHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          force: true,
          rankings: [
            { team_id: T2, rank: 1 },
            { team_id: T1, rank: 2 },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).success).toBe(true);
    // New rankings replaced the old ones
    expect((store.final_rankings as any[]).length).toBe(2);
    const rankedT2 = (store.final_rankings as any[]).find(
      (r) => r.team_id === T2
    );
    expect(rankedT2.rank).toBe(1);

    const logs = (store.staff_logs as any[]).filter(
      (l) =>
        l.action === 'unfinalize_tournament' ||
        l.action === 'finalize_tournament'
    );
    expect(logs.map((l) => l.action).sort()).toEqual([
      'finalize_tournament',
      'unfinalize_tournament',
    ]);
  });
});
