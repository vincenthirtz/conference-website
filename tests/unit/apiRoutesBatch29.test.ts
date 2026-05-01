import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

vi.mock('@/utils/rateLimit', () => ({
  applyRateLimit: () => false,
  getClientIp: () => '127.0.0.1',
}));

const { logStaffActionMock, notifyVetoStep } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
  notifyVetoStep: vi.fn(async () => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));
vi.mock('@/utils/discord', () => ({ notifyVetoStep }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import groupsHandler from '../../pages/api/admin/stages/[stageId]/groups';
import recycleBinHandler from '../../pages/api/admin/recycle-bin';
import vetoHandler from '../../pages/api/admin/matches/[matchId]/veto';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

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
  notifyVetoStep.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
});

const STAGE_ID = '550e8400-e29b-41d4-a716-446655440000';
const M_ID = '550e8400-e29b-41d4-a716-446655440001';

/* -----------------------------------------------------------
 * /api/admin/stages/[stageId]/groups
 * ---------------------------------------------------------*/

describe('/api/admin/stages/[stageId]/groups', () => {
  it('400 on invalid stageId', async () => {
    const res = makeRes();
    await groupsHandler(
      makeReq({ method: 'GET', query: { stageId: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 404 when stage missing', async () => {
    store.tournament_stages = [];
    const res = makeRes();
    await groupsHandler(
      makeReq({ method: 'GET', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('GET 400 when stage not group/round_robin', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, stage_type: 'bracket', settings: {} },
    ] as any;
    const res = makeRes();
    await groupsHandler(
      makeReq({ method: 'GET', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 200 returns groups + unassigned', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        stage_type: 'group',
        tournament_id: 'tour-1',
        settings: { group_assignments: { A: ['t1', 't2'] } },
      },
    ] as any;
    store.stage_teams = [
      {
        stage_id: STAGE_ID,
        team_id: 't1',
        seed: 1,
        team: { id: 't1', name: 'Alpha', short_name: 'A', logo_url: null },
      },
      {
        stage_id: STAGE_ID,
        team_id: 't2',
        seed: 2,
        team: { id: 't2', name: 'Beta', short_name: 'B', logo_url: null },
      },
      {
        stage_id: STAGE_ID,
        team_id: 't3',
        seed: 3,
        team: { id: 't3', name: 'Gamma', short_name: null, logo_url: null },
      },
    ] as any;
    const res = makeRes();
    await groupsHandler(
      makeReq({ method: 'GET', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.groups.A).toHaveLength(2);
    expect(body.unassigned).toHaveLength(1);
    expect(body.unassigned[0].teamId).toBe('t3');
  });

  it('PUT 400 when assignments not an array', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, stage_type: 'group', settings: {} },
    ] as any;
    const res = makeRes();
    await groupsHandler(
      makeReq({
        method: 'PUT',
        query: { stageId: STAGE_ID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 200 saves assignments and updates settings', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        stage_type: 'group',
        tournament_id: 'tour-1',
        settings: { existing: 'value' },
      },
    ] as any;
    store.matches = [];
    const res = makeRes();
    await groupsHandler(
      makeReq({
        method: 'PUT',
        query: { stageId: STAGE_ID },
        body: {
          assignments: [
            { teamId: 't1', groupKey: 'A' },
            { teamId: 't2', groupKey: 'A' },
            { teamId: 't3', groupKey: 'B' },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(
      (store.tournament_stages[0] as any).settings.group_assignments.A
    ).toEqual(['t1', 't2']);
    expect(
      (store.tournament_stages[0] as any).settings.group_assignments.B
    ).toEqual(['t3']);
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('POST 400 with invalid numGroups', async () => {
    const res = makeRes();
    await groupsHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { numGroups: 33 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 with invalid method', async () => {
    const res = makeRes();
    await groupsHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { numGroups: 2, method: 'bogus' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when stage has no teams', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        stage_type: 'group',
        tournament_id: 'tour-1',
        settings: {},
      },
    ] as any;
    store.stage_teams = [];
    const res = makeRes();
    await groupsHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { numGroups: 2 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 200 distributes teams using snake seeding', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        stage_type: 'group',
        tournament_id: 'tour-1',
        settings: {},
      },
    ] as any;
    store.stage_teams = [
      {
        stage_id: STAGE_ID,
        team_id: 't1',
        seed: 1,
        team: { id: 't1', name: 'Alpha' },
      },
      {
        stage_id: STAGE_ID,
        team_id: 't2',
        seed: 2,
        team: { id: 't2', name: 'Beta' },
      },
      {
        stage_id: STAGE_ID,
        team_id: 't3',
        seed: 3,
        team: { id: 't3', name: 'Gamma' },
      },
      {
        stage_id: STAGE_ID,
        team_id: 't4',
        seed: 4,
        team: { id: 't4', name: 'Delta' },
      },
    ] as any;
    store.matches = [];
    const res = makeRes();
    await groupsHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { numGroups: 2, method: 'snake' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const settings = (store.tournament_stages[0] as any).settings;
    expect(settings.group_assignments).toBeDefined();
    expect(settings.num_groups).toBe(2);
    // Snake: A=[t1,t4], B=[t2,t3]
    expect(settings.group_assignments.A).toEqual(['t1', 't4']);
    expect(settings.group_assignments.B).toEqual(['t2', 't3']);
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await groupsHandler(
      makeReq({ method: 'DELETE', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('GET 200 infers groups from match.group_key when settings empty', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        stage_type: 'group',
        tournament_id: 'tour-1',
        settings: {},
      },
    ] as any;
    store.stage_teams = [
      {
        stage_id: STAGE_ID,
        team_id: 't1',
        seed: 1,
        team: { id: 't1', name: 'Alpha', short_name: null, logo_url: null },
      },
      {
        stage_id: STAGE_ID,
        team_id: 't2',
        seed: 2,
        team: { id: 't2', name: 'Beta', short_name: null, logo_url: null },
      },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        stage_id: STAGE_ID,
        team1_id: 't1',
        team2_id: 't2',
        group_key: 'A',
        status: 'pending',
      },
    ] as any;
    const res = makeRes();
    await groupsHandler(
      makeReq({ method: 'GET', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.groups.A).toBeDefined();
    expect(body.groups.A.length).toBeGreaterThan(0);
  });

  it('PUT 404 when stage not found', async () => {
    store.tournament_stages = [];
    const res = makeRes();
    await groupsHandler(
      makeReq({
        method: 'PUT',
        query: { stageId: STAGE_ID },
        body: { assignments: [] },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('PUT 400 when stage is not group/round_robin', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, stage_type: 'bracket', tournament_id: 'tour-1' },
    ] as any;
    const res = makeRes();
    await groupsHandler(
      makeReq({
        method: 'PUT',
        query: { stageId: STAGE_ID },
        body: { assignments: [] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 404 when stage not found', async () => {
    store.tournament_stages = [];
    const res = makeRes();
    await groupsHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { numGroups: 2 },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('POST 400 when stage is not group/round_robin', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, stage_type: 'bracket', tournament_id: 'tour-1' },
    ] as any;
    const res = makeRes();
    await groupsHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { numGroups: 2 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 200 distributes teams using random method', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        stage_type: 'round_robin',
        tournament_id: 'tour-1',
        settings: {},
      },
    ] as any;
    store.stage_teams = [
      {
        stage_id: STAGE_ID,
        team_id: 't1',
        seed: 1,
        team: { id: 't1', name: 'Alpha' },
      },
      {
        stage_id: STAGE_ID,
        team_id: 't2',
        seed: 2,
        team: { id: 't2', name: 'Beta' },
      },
      {
        stage_id: STAGE_ID,
        team_id: 't3',
        seed: 3,
        team: { id: 't3', name: 'Gamma' },
      },
      {
        stage_id: STAGE_ID,
        team_id: 't4',
        seed: 4,
        team: { id: 't4', name: 'Delta' },
      },
    ] as any;
    store.matches = [];
    const res = makeRes();
    await groupsHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { numGroups: 2, method: 'random' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const settings = (store.tournament_stages[0] as any).settings;
    expect(settings.group_assignments).toBeDefined();
    expect(Object.keys(settings.group_assignments).length).toBe(2);
  });
});

/* -----------------------------------------------------------
 * /api/admin/recycle-bin
 * ---------------------------------------------------------*/

describe('/api/admin/recycle-bin', () => {
  it('GET 200 lists soft-deleted items across types', async () => {
    store.tournament_stages = [
      {
        id: 's1',
        name: 'Old Stage',
        stage_type: 'group',
        tournament_id: 'tour-1',
        deleted_at: '2026-04-01',
      },
      {
        id: 's2',
        name: 'Active',
        stage_type: 'group',
        tournament_id: 'tour-1',
        deleted_at: null,
      },
    ] as any;
    store.teams = [
      {
        id: 't1',
        name: 'Old Team',
        short_name: 'OT',
        deleted_at: '2026-04-01',
      },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        tournament_id: 'tour-1',
        team1_id: null,
        team2_id: null,
        round_number: 1,
        deleted_at: '2026-04-01',
      },
    ] as any;
    store.announcements = [
      {
        id: 'a1',
        title: 'Old',
        message: 'msg',
        deleted_at: '2026-04-01',
      },
    ] as any;

    const res = makeRes();
    await recycleBinHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    const types = new Set(body.items.map((i: any) => i.type));
    expect(types.has('stage')).toBe(true);
    expect(types.has('team')).toBe(true);
    expect(types.has('match')).toBe(true);
    expect(types.has('announcement')).toBe(true);
  });

  it('GET ?type=team filters by single type', async () => {
    store.tournament_stages = [
      {
        id: 's1',
        name: 'Old',
        stage_type: 'group',
        tournament_id: null,
        deleted_at: '2026-04-01',
      },
    ] as any;
    store.teams = [
      {
        id: 't1',
        name: 'Old Team',
        short_name: null,
        deleted_at: '2026-04-01',
      },
    ] as any;
    const res = makeRes();
    await recycleBinHandler(
      makeReq({ method: 'GET', query: { type: 'team' } }),
      res
    );
    const types = new Set((res.body as any).items.map((i: any) => i.type));
    expect(types.has('team')).toBe(true);
    expect(types.has('stage')).toBe(false);
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await recycleBinHandler(makeReq({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/admin/matches/[matchId]/veto
 * ---------------------------------------------------------*/

describe('/api/admin/matches/[matchId]/veto', () => {
  it('400 on invalid matchId', async () => {
    const res = makeRes();
    await vetoHandler(
      makeReq({ method: 'GET', query: { matchId: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 404 when match missing', async () => {
    store.matches = [];
    const res = makeRes();
    await vetoHandler(
      makeReq({ method: 'GET', query: { matchId: M_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('GET 200 returns veto state with flow', async () => {
    store.matches = [
      {
        id: M_ID,
        tournament_id: 'tour-1',
        match_format: 'bo3',
        team1_id: 't1',
        team2_id: 't2',
      },
    ] as any;
    store.match_map_vetos = [
      {
        match_id: M_ID,
        step_number: 1,
        action: 'ban',
        team_id: 't1',
        map_name: 'Lijiang',
        map_type: 'control',
      },
    ] as any;
    store.teams = [
      { id: 't1', name: 'Alpha' },
      { id: 't2', name: 'Beta' },
    ] as any;

    const res = makeRes();
    await vetoHandler(
      makeReq({ method: 'GET', query: { matchId: M_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.format).toBe('bo3');
    expect(body.steps).toHaveLength(1);
    expect(body.team1Name).toBe('Alpha');
    expect(body.team2Name).toBe('Beta');
  });

  it('POST 400 when map_name missing', async () => {
    const res = makeRes();
    await vetoHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: { action: 'ban' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 with invalid action', async () => {
    const res = makeRes();
    await vetoHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: { action: 'bogus', map_name: 'Lijiang' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('DELETE 200 resets all veto steps', async () => {
    store.matches = [{ id: M_ID, tournament_id: 'tour-1' }] as any;
    store.match_map_vetos = [
      { match_id: M_ID, step_number: 1, action: 'ban' },
      { match_id: M_ID, step_number: 2, action: 'pick' },
      { match_id: 'other-match', step_number: 1, action: 'ban' },
    ] as any;
    const res = makeRes();
    await vetoHandler(
      makeReq({ method: 'DELETE', query: { matchId: M_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    // The other match's vetos should remain
    const remaining = (store.match_map_vetos as any).filter(
      (v: any) => v.match_id === M_ID
    );
    expect(remaining).toHaveLength(0);
    expect(
      (store.match_map_vetos as any).filter(
        (v: any) => v.match_id === 'other-match'
      )
    ).toHaveLength(1);
  });

  it('returns 405 on PATCH', async () => {
    const res = makeRes();
    await vetoHandler(
      makeReq({ method: 'PATCH', query: { matchId: M_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('POST 201 records a step and reports isComplete=false when more steps remain', async () => {
    store.matches = [
      {
        id: M_ID,
        tournament_id: 'tour-1',
        match_format: 'bo3',
        team1_id: 't1',
        team2_id: 't2',
      },
    ] as any;
    store.match_map_vetos = [];
    store.teams = [
      { id: 't1', name: 'Alpha' },
      { id: 't2', name: 'Beta' },
    ] as any;
    const res = makeRes();
    await vetoHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: {
          action: 'ban',
          map_name: 'Lijiang',
          map_type: 'control',
          team_id: 't1',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const body = res.body as any;
    expect(body.isComplete).toBe(false);
    expect(body.gamesCreated).toBe(false);
    expect((store.match_map_vetos as any).length).toBe(1);
  });

  it('POST 400 when veto step would exceed flow length', async () => {
    store.matches = [
      {
        id: M_ID,
        tournament_id: 'tour-1',
        match_format: 'bo3',
        team1_id: 't1',
        team2_id: 't2',
      },
    ] as any;
    // Pre-fill enough steps to exceed bo3 flow length
    store.match_map_vetos = Array.from({ length: 10 }, (_, i) => ({
      match_id: M_ID,
      step_number: i + 1,
      action: 'ban',
      map_name: `Map${i}`,
      team_id: 't1',
    })) as any;
    const res = makeRes();
    await vetoHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: { action: 'ban', map_name: 'Lijiang', team_id: 't1' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 404 when match missing on POST', async () => {
    store.matches = [];
    const res = makeRes();
    await vetoHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: { action: 'ban', map_name: 'Lijiang' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});
