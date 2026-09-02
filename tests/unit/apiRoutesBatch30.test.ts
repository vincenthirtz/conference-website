import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import bracketHandler from '../../pages/api/admin/tournament/[id]/bracket';
import statsHandler from '../../pages/api/admin/tournament/[id]/stats';
import recycleBinHandler from '../../pages/api/admin/recycle-bin';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'admin'
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

function makeReq(over: Partial<any> = {}, includeAuth = true): any {
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
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
});

const TID = '550e8400-e29b-41d4-a716-446655440000';

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/bracket
 * ---------------------------------------------------------*/

describe('POST /api/admin/tournament/[id]/bracket', () => {
  it('400 on invalid id', async () => {
    const res = makeRes();
    await bracketHandler(
      makeReq({
        method: 'POST',
        query: { id: 'bogus' },
        body: { action: 'generate', size: 4 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('405 on non-POST', async () => {
    const res = makeRes();
    await bracketHandler(makeReq({ method: 'GET', query: { id: TID } }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 with unknown action', async () => {
    const res = makeRes();
    await bracketHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { action: 'fly-to-mars' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('generate 400 with invalid size', async () => {
    const res = makeRes();
    await bracketHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { action: 'generate', size: 5 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('generate creates a single-elimination bracket with size=4', async () => {
    store.matches = [];
    const res = makeRes();
    await bracketHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { action: 'generate', size: 4, bestOf: 3 },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const body = res.body as any;
    // Size 4 → 2 semifinals + 1 final = 3 matches
    expect(body.match_count).toBe(3);
    expect((store.matches as any).length).toBe(3);
    // Final has round_name "Finale"
    const finale = (store.matches as any).find(
      (m: any) => m.round_name === 'Finale'
    );
    expect(finale).toBeTruthy();
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('generate 200 with size=8 produces 7 matches', async () => {
    store.matches = [];
    const res = makeRes();
    await bracketHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          action: 'generate',
          size: 8,
          bestOf: 5,
          startDate: '2026-04-01T10:00:00Z',
          intervalMinutes: 30,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).match_count).toBe(7);
  });
});

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/stats
 * ---------------------------------------------------------*/

describe('GET /api/admin/tournament/[id]/stats', () => {
  it('400 on invalid id', async () => {
    const res = makeRes();
    await statsHandler(makeReq({ method: 'GET', query: { id: 'bogus' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('405 on non-GET', async () => {
    const res = makeRes();
    await statsHandler(makeReq({ method: 'POST', query: { id: TID } }), res);
    expect(res.statusCode).toBe(405);
  });

  it('404 when tournament missing', async () => {
    store.tournaments = [];
    const res = makeRes();
    await statsHandler(makeReq({ method: 'GET', query: { id: TID } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('200 returns stats with empty matches and teams', async () => {
    store.tournaments = [{ id: TID, name: 'Cup', slug: 'cup' }] as any;
    store.matches = [];
    store.tournament_teams = [];
    store.games = [];
    const res = makeRes();
    await statsHandler(makeReq({ method: 'GET', query: { id: TID } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.overview.totalMatches).toBe(0);
    expect(body.overview.totalTeams).toBe(0);
  });

  it('200 returns stats with bye matches excluded', async () => {
    store.tournaments = [{ id: TID, name: 'Cup', slug: 'cup' }] as any;
    store.matches = [
      {
        id: 'mb',
        tournament_id: TID,
        stage_id: 's1',
        status: 'finished',
        is_bye: true,
        team1_id: 't1',
        team2_id: null,
      },
      {
        id: 'm1',
        tournament_id: TID,
        stage_id: 's1',
        status: 'finished',
        is_bye: false,
        team1_id: 't1',
        team2_id: 't2',
        team1_score: 2,
        team2_score: 1,
        winner_team_id: 't1',
        round_number: 1,
      },
    ] as any;
    store.tournament_teams = [
      {
        tournament_id: TID,
        team: { id: 't1', name: 'A', short_name: 'A', logo_url: null },
      },
      {
        tournament_id: TID,
        team: { id: 't2', name: 'B', short_name: 'B', logo_url: null },
      },
    ] as any;
    store.games = [];
    const res = makeRes();
    await statsHandler(makeReq({ method: 'GET', query: { id: TID } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    // Only the non-bye match counts
    expect(body.overview.totalMatches).toBe(1);
  });

  it('200 returns global stats', async () => {
    store.tournaments = [{ id: TID, name: 'Cup', slug: 'cup' }] as any;
    store.matches = [
      {
        id: 'm1',
        tournament_id: TID,
        stage_id: 's1',
        status: 'finished',
        is_bye: false,
        team1_id: 't1',
        team2_id: 't2',
        team1_score: 2,
        team2_score: 1,
        winner_team_id: 't1',
        round_number: 1,
        stage: { name: 'Group' },
      },
      {
        id: 'm2',
        tournament_id: TID,
        stage_id: 's1',
        status: 'pending',
        is_bye: false,
        team1_id: 't1',
        team2_id: 't3',
        round_number: 2,
        stage: { name: 'Group' },
      },
    ] as any;
    store.tournament_teams = [
      {
        tournament_id: TID,
        team: { id: 't1', name: 'Alpha', short_name: 'A', logo_url: null },
      },
      {
        tournament_id: TID,
        team: { id: 't2', name: 'Beta', short_name: 'B', logo_url: null },
      },
    ] as any;
    store.games = [
      {
        match_id: 'm1',
        map_name: 'Lijiang',
        team1_score: 3,
        team2_score: 1,
        is_tiebreaker: false,
        went_overtime: false,
      },
    ] as any;

    const res = makeRes();
    await statsHandler(makeReq({ method: 'GET', query: { id: TID } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    // Body shape varies; just ensure it returned a non-error JSON object.
    expect(typeof body).toBe('object');
    expect(body).not.toHaveProperty('error');
  });
});

/* -----------------------------------------------------------
 * /api/admin/recycle-bin (PATCH restore path)
 * ---------------------------------------------------------*/

describe('PATCH /api/admin/recycle-bin', () => {
  it('400 when id or type missing', async () => {
    const res = makeRes();
    await recycleBinHandler(makeReq({ method: 'PATCH', body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('400 with unknown type', async () => {
    const res = makeRes();
    await recycleBinHandler(
      makeReq({
        method: 'PATCH',
        body: { id: 'x', type: 'bogus' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('restores a soft-deleted stage', async () => {
    store.tournament_stages = [
      {
        id: 's-soft',
        name: 'Soft',
        deleted_at: '2026-04-01',
        is_active: false,
        is_public: false,
        tournament_id: 'tour-1',
      },
    ] as any;
    const res = makeRes();
    await recycleBinHandler(
      makeReq({
        method: 'PATCH',
        body: { id: 's-soft', type: 'stage' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.tournament_stages[0] as any).deleted_at).toBeNull();
  });

  it('restores a soft-deleted team', async () => {
    store.teams = [
      {
        id: 't-soft',
        name: 'Soft',
        deleted_at: '2026-04-01',
        is_active: false,
      },
    ] as any;
    const res = makeRes();
    await recycleBinHandler(
      makeReq({
        method: 'PATCH',
        body: { id: 't-soft', type: 'team' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.teams[0] as any).deleted_at).toBeNull();
    expect((store.teams[0] as any).is_active).toBe(true);
  });

  it('returns 405 on POST', async () => {
    const res = makeRes();
    await recycleBinHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('PATCH restores a soft-deleted match', async () => {
    store.matches = [
      {
        id: 'm-soft',
        tournament_id: 'tour-1',
        status: 'cancelled',
        deleted_at: '2026-04-01',
      },
    ] as any;
    const res = makeRes();
    await recycleBinHandler(
      makeReq({
        method: 'PATCH',
        body: { id: 'm-soft', type: 'match' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const m = (store.matches as any)[0];
    expect(m.status).toBe('pending');
    expect(m.deleted_at).toBeNull();
  });

  it('PATCH restores a soft-deleted partner', async () => {
    store.partners = [
      { id: 'p-soft', name: 'Sponsor', deleted_at: '2026-04-01' },
    ] as any;
    const res = makeRes();
    await recycleBinHandler(
      makeReq({
        method: 'PATCH',
        body: { id: 'p-soft', type: 'partner' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('PATCH restores a soft-deleted cast_member', async () => {
    store.cast_members = [
      { id: 'cm-soft', display_name: 'Caster', deleted_at: '2026-04-01' },
    ] as any;
    const res = makeRes();
    await recycleBinHandler(
      makeReq({
        method: 'PATCH',
        body: { id: 'cm-soft', type: 'cast_member' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('PATCH restores a soft-deleted adherent', async () => {
    store.adherents = [
      { id: 'ad-soft', first_name: 'A', deleted_at: '2026-04-01' },
    ] as any;
    const res = makeRes();
    await recycleBinHandler(
      makeReq({
        method: 'PATCH',
        body: { id: 'ad-soft', type: 'adherent' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('GET lists soft-deleted matches with team labels', async () => {
    store.matches = [
      {
        id: 'm-soft',
        tournament_id: 'tour-1',
        round_number: 1,
        team1_id: 't1',
        team2_id: 't2',
        deleted_at: '2026-04-01',
      },
    ] as any;
    store.teams = [
      { id: 't1', name: 'Alpha' },
      { id: 't2', name: 'Beta' },
    ] as any;
    const res = makeRes();
    await recycleBinHandler(
      makeReq({ method: 'GET', query: { type: 'match' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.items.length).toBe(1);
    expect(body.items[0].type).toBe('match');
    expect(body.items[0].name).toContain('Alpha');
  });

  it('GET lists soft-deleted partners, cast_members, adherents', async () => {
    store.partners = [
      { id: 'p1', name: 'Sponsor', deleted_at: '2026-04-01' },
    ] as any;
    store.cast_members = [
      { id: 'cm1', display_name: 'Caster', deleted_at: '2026-04-01' },
    ] as any;
    store.adherents = [
      {
        id: 'ad1',
        first_name: 'A',
        last_name: 'B',
        deleted_at: '2026-04-01',
      },
    ] as any;
    const res = makeRes();
    await recycleBinHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const types = ((res.body as any).items as any[]).map((i) => i.type);
    expect(types).toContain('partner');
    expect(types).toContain('cast_member');
    expect(types).toContain('adherent');
  });
});
