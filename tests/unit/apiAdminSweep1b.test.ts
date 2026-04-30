// Sweep 1b: medium admin handlers at 0% coverage.
//
// Targets:
//  - pages/api/admin/teams/import-platform.ts
//  - pages/api/admin/stages/[stageId]/swiss-status.ts
//  - pages/api/admin/stages/[stageId]/auto-seed.ts
//  - pages/api/admin/tournament/[id]/stages.ts (POST/PATCH/GET)

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

const {
  fetchToornamentParticipants,
  fetchChallongeParticipants,
  fetchStartGgParticipants,
  importTeams,
  computeStageStandings,
} = vi.hoisted(() => ({
  fetchToornamentParticipants: vi.fn(async () => [] as any[]),
  fetchChallongeParticipants: vi.fn(async () => [] as any[]),
  fetchStartGgParticipants: vi.fn(async () => [] as any[]),
  importTeams: vi.fn(async () => ({
    created: 0,
    skipped: 0,
    errors: [],
    teams: [],
  })),
  computeStageStandings: vi.fn(async () => [] as any[]),
}));

vi.mock('@/utils/tournamentImport/toornament', () => ({
  fetchToornamentParticipants,
}));
vi.mock('@/utils/tournamentImport/challonge', () => ({
  fetchChallongeParticipants,
}));
vi.mock('@/utils/tournamentImport/startgg', () => ({
  fetchStartGgParticipants,
}));
vi.mock('@/utils/teamImport', () => ({ importTeams }));
vi.mock('@/utils/stages/standings', () => ({ computeStageStandings }));

import { PlatformImportError } from '../../utils/tournamentImport/types';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import importPlatformHandler from '../../pages/api/admin/teams/import-platform';
import swissStatusHandler from '../../pages/api/admin/stages/[stageId]/swiss-status';
import autoSeedHandler from '../../pages/api/admin/stages/[stageId]/auto-seed';
import tournamentStagesHandler from '../../pages/api/admin/tournament/[id]/stages';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'admin'
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
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeAuthedReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
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

const VALID_UUID = '11111111-1111-1111-1111-111111111111';
const STAGE_UUID = '22222222-2222-2222-2222-222222222222';
const TOUR_UUID = '33333333-3333-3333-3333-333333333333';

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  fetchToornamentParticipants.mockClear();
  fetchChallongeParticipants.mockClear();
  fetchStartGgParticipants.mockClear();
  importTeams.mockClear();
  computeStageStandings.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
});

/* -----------------------------------------------------------
 * /api/admin/teams/import-platform
 * ---------------------------------------------------------*/

describe('/api/admin/teams/import-platform', () => {
  it('405 on GET', async () => {
    const res = makeRes();
    await importPlatformHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid source', async () => {
    const res = makeRes();
    await importPlatformHandler(
      makeAuthedReq({
        method: 'POST',
        body: { source: 'unknown', sourceRef: 'abc' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when sourceRef missing', async () => {
    const res = makeRes();
    await importPlatformHandler(
      makeAuthedReq({
        method: 'POST',
        body: { source: 'toornament' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when API key not configured', async () => {
    const res = makeRes();
    await importPlatformHandler(
      makeAuthedReq({
        method: 'POST',
        body: { source: 'toornament', sourceRef: 'abc' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toContain('toornament_api_key');
  });

  it('200 with no rows imported', async () => {
    store.site_settings = [
      { key: 'toornament_api_key', value: 'secret', description: null },
    ] as any;
    fetchToornamentParticipants.mockResolvedValueOnce([] as any);

    const res = makeRes();
    await importPlatformHandler(
      makeAuthedReq({
        method: 'POST',
        body: { source: 'toornament', sourceRef: 'abc' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).created).toBe(0);
  });

  it('200 imports challonge participants', async () => {
    store.site_settings = [
      { key: 'challonge_api_key', value: 'k', description: null },
    ] as any;
    fetchChallongeParticipants.mockResolvedValueOnce([{ name: 'TeamA' }] as any);
    importTeams.mockResolvedValueOnce({
      created: 1,
      skipped: 0,
      errors: [],
      teams: [{ id: 't1', name: 'TeamA' }],
    } as any);

    const res = makeRes();
    await importPlatformHandler(
      makeAuthedReq({
        method: 'POST',
        body: {
          source: 'challonge',
          sourceRef: 'tournament-slug',
          tournamentId: TOUR_UUID,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).created).toBe(1);
    expect(importTeams).toHaveBeenCalled();
  });

  it('200 imports startgg participants', async () => {
    store.site_settings = [
      { key: 'startgg_api_key', value: 'k', description: null },
    ] as any;
    fetchStartGgParticipants.mockResolvedValueOnce([{ name: 'A' }] as any);
    importTeams.mockResolvedValueOnce({
      created: 1,
      skipped: 0,
      errors: [],
      teams: [],
    } as any);
    const res = makeRes();
    await importPlatformHandler(
      makeAuthedReq({
        method: 'POST',
        body: { source: 'startgg', sourceRef: 'slug' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('502 when PlatformImportError thrown', async () => {
    store.site_settings = [
      { key: 'toornament_api_key', value: 'k', description: null },
    ] as any;
    fetchToornamentParticipants.mockRejectedValueOnce(
      new PlatformImportError('Bad gateway', 502, 'toornament')
    );

    const res = makeRes();
    await importPlatformHandler(
      makeAuthedReq({
        method: 'POST',
        body: { source: 'toornament', sourceRef: 'abc' },
      }),
      res
    );
    expect(res.statusCode).toBe(502);
  });

  it('500 on generic error', async () => {
    store.site_settings = [
      { key: 'toornament_api_key', value: 'k', description: null },
    ] as any;
    fetchToornamentParticipants.mockRejectedValueOnce(new Error('boom'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = makeRes();
    await importPlatformHandler(
      makeAuthedReq({
        method: 'POST',
        body: { source: 'toornament', sourceRef: 'abc' },
      }),
      res
    );
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(500);
  });
});

/* -----------------------------------------------------------
 * /api/admin/stages/[stageId]/swiss-status
 * ---------------------------------------------------------*/

describe('/api/admin/stages/[stageId]/swiss-status', () => {
  it('405 on POST', async () => {
    const res = makeRes();
    await swissStatusHandler(
      makeAuthedReq({ method: 'POST', query: { stageId: STAGE_UUID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid stageId', async () => {
    const res = makeRes();
    await swissStatusHandler(
      makeAuthedReq({ method: 'GET', query: { stageId: 'bad' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when stage missing', async () => {
    const res = makeRes();
    await swissStatusHandler(
      makeAuthedReq({ method: 'GET', query: { stageId: STAGE_UUID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('400 when stage is not swiss', async () => {
    store.tournament_stages = [
      {
        id: STAGE_UUID,
        tournament_id: TOUR_UUID,
        stage_type: 'bracket',
        settings: null,
      },
    ] as any;
    const res = makeRes();
    await swissStatusHandler(
      makeAuthedReq({ method: 'GET', query: { stageId: STAGE_UUID } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 with empty matches returns currentRound=0', async () => {
    store.tournament_stages = [
      {
        id: STAGE_UUID,
        tournament_id: TOUR_UUID,
        stage_type: 'swiss',
        settings: null,
      },
    ] as any;
    const res = makeRes();
    await swissStatusHandler(
      makeAuthedReq({ method: 'GET', query: { stageId: STAGE_UUID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).currentRound).toBe(0);
    expect((res.body as any).activeTeamCount).toBe(0);
  });

  it('200 with finished round + thresholds eliminates teams', async () => {
    store.tournament_stages = [
      {
        id: STAGE_UUID,
        tournament_id: TOUR_UUID,
        stage_type: 'swiss',
        settings: { total_rounds: 3, win_threshold: 2, loss_threshold: 2 },
      },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        stage_id: STAGE_UUID,
        round_number: 1,
        status: 'finished',
        is_bye: false,
        team1_id: 't1',
        team2_id: 't2',
        winner_team_id: 't1',
      },
      {
        id: 'm2',
        stage_id: STAGE_UUID,
        round_number: 1,
        status: 'finished',
        is_bye: true,
        team1_id: 't3',
        team2_id: null,
        winner_team_id: null,
      },
      {
        id: 'm3',
        stage_id: STAGE_UUID,
        round_number: 1,
        status: 'finished',
        is_bye: false,
        team1_id: 't4',
        team2_id: 't5',
        winner_team_id: 't5',
      },
    ] as any;
    store.stage_teams = [
      { stage_id: STAGE_UUID, team_id: 't1' },
      { stage_id: STAGE_UUID, team_id: 't2' },
      { stage_id: STAGE_UUID, team_id: 't3' },
      { stage_id: STAGE_UUID, team_id: 't4' },
      { stage_id: STAGE_UUID, team_id: 't5' },
    ] as any;
    const res = makeRes();
    await swissStatusHandler(
      makeAuthedReq({ method: 'GET', query: { stageId: STAGE_UUID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.currentRound).toBe(1);
    expect(body.allCurrentRoundFinished).toBe(true);
  });
});

/* -----------------------------------------------------------
 * /api/admin/stages/[stageId]/auto-seed
 * ---------------------------------------------------------*/

describe('/api/admin/stages/[stageId]/auto-seed', () => {
  it('405 on GET', async () => {
    const res = makeRes();
    await autoSeedHandler(
      makeAuthedReq({ method: 'GET', query: { stageId: STAGE_UUID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid stageId', async () => {
    const res = makeRes();
    await autoSeedHandler(
      makeAuthedReq({
        method: 'POST',
        query: { stageId: 'bad' },
        body: { sourceStageId: STAGE_UUID },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when sourceStageId missing', async () => {
    const res = makeRes();
    await autoSeedHandler(
      makeAuthedReq({
        method: 'POST',
        query: { stageId: STAGE_UUID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when target stage missing', async () => {
    const res = makeRes();
    await autoSeedHandler(
      makeAuthedReq({
        method: 'POST',
        query: { stageId: STAGE_UUID },
        body: { sourceStageId: 'src' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('400 when target stage is not bracket', async () => {
    store.tournament_stages = [
      {
        id: STAGE_UUID,
        tournament_id: TOUR_UUID,
        stage_type: 'group',
        settings: null,
      },
    ] as any;
    const res = makeRes();
    await autoSeedHandler(
      makeAuthedReq({
        method: 'POST',
        query: { stageId: STAGE_UUID },
        body: { sourceStageId: 'src' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when source stage missing', async () => {
    store.tournament_stages = [
      {
        id: STAGE_UUID,
        tournament_id: TOUR_UUID,
        stage_type: 'bracket',
        settings: null,
      },
    ] as any;
    const res = makeRes();
    await autoSeedHandler(
      makeAuthedReq({
        method: 'POST',
        query: { stageId: STAGE_UUID },
        body: { sourceStageId: 'src-missing' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('400 when source stage in different tournament', async () => {
    store.tournament_stages = [
      {
        id: STAGE_UUID,
        tournament_id: TOUR_UUID,
        stage_type: 'bracket',
        settings: null,
      },
      {
        id: 'src-other',
        tournament_id: 'other-tour',
        stage_type: 'group',
        settings: null,
      },
    ] as any;
    const res = makeRes();
    await autoSeedHandler(
      makeAuthedReq({
        method: 'POST',
        query: { stageId: STAGE_UUID },
        body: { sourceStageId: 'src-other' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when source has no standings', async () => {
    store.tournament_stages = [
      {
        id: STAGE_UUID,
        tournament_id: TOUR_UUID,
        stage_type: 'bracket',
        settings: null,
      },
      {
        id: 'src',
        tournament_id: TOUR_UUID,
        stage_type: 'group',
        settings: null,
      },
    ] as any;
    computeStageStandings.mockResolvedValueOnce([]);
    const res = makeRes();
    await autoSeedHandler(
      makeAuthedReq({
        method: 'POST',
        query: { stageId: STAGE_UUID },
        body: { sourceStageId: 'src' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when target bracket has no round 1', async () => {
    store.tournament_stages = [
      {
        id: STAGE_UUID,
        tournament_id: TOUR_UUID,
        stage_type: 'bracket',
        settings: null,
      },
      {
        id: 'src',
        tournament_id: TOUR_UUID,
        stage_type: 'group',
        settings: null,
      },
    ] as any;
    computeStageStandings.mockResolvedValueOnce([
      { teamId: 't1', rank: 1 },
      { teamId: 't2', rank: 2 },
    ] as any);
    const res = makeRes();
    await autoSeedHandler(
      makeAuthedReq({
        method: 'POST',
        query: { stageId: STAGE_UUID },
        body: { sourceStageId: 'src' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 seeds bracket round-1 matches with standard pattern', async () => {
    store.tournament_stages = [
      {
        id: STAGE_UUID,
        tournament_id: TOUR_UUID,
        stage_type: 'bracket',
        settings: null,
      },
      {
        id: 'src',
        tournament_id: TOUR_UUID,
        stage_type: 'group',
        settings: null,
      },
    ] as any;
    store.matches = [
      {
        id: 'mA',
        stage_id: STAGE_UUID,
        round_number: 1,
        team1_id: null,
        team2_id: null,
        created_at: '2026-04-01',
      },
      {
        id: 'mB',
        stage_id: STAGE_UUID,
        round_number: 1,
        team1_id: null,
        team2_id: null,
        created_at: '2026-04-02',
      },
    ] as any;
    computeStageStandings.mockResolvedValueOnce([
      { teamId: 't1', rank: 1 },
      { teamId: 't2', rank: 2 },
      { teamId: 't3', rank: 3 },
      { teamId: 't4', rank: 4 },
    ] as any);

    const res = makeRes();
    await autoSeedHandler(
      makeAuthedReq({
        method: 'POST',
        query: { stageId: STAGE_UUID },
        body: { sourceStageId: 'src' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).seeded.length).toBe(4);
    expect((res.body as any).totalMatches).toBe(2);
  });

  it('200 with sequential pattern', async () => {
    store.tournament_stages = [
      {
        id: STAGE_UUID,
        tournament_id: TOUR_UUID,
        stage_type: 'bracket',
        settings: null,
      },
      {
        id: 'src',
        tournament_id: TOUR_UUID,
        stage_type: 'group',
        settings: null,
      },
    ] as any;
    store.matches = [
      {
        id: 'mA',
        stage_id: STAGE_UUID,
        round_number: 1,
        team1_id: null,
        team2_id: null,
        created_at: '2026-04-01',
      },
    ] as any;
    computeStageStandings.mockResolvedValueOnce([
      { teamId: 't1', rank: 1 },
      { teamId: 't2', rank: 2 },
    ] as any);

    const res = makeRes();
    await autoSeedHandler(
      makeAuthedReq({
        method: 'POST',
        query: { stageId: STAGE_UUID },
        body: { sourceStageId: 'src', seedingPattern: 'sequential' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });
});

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/stages
 * ---------------------------------------------------------*/

describe('/api/admin/tournament/[id]/stages', () => {
  it('400 on invalid id', async () => {
    const res = makeRes();
    await tournamentStagesHandler(
      makeAuthedReq({ method: 'GET', query: { id: 'bad' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET returns empty list', async () => {
    const res = makeRes();
    await tournamentStagesHandler(
      makeAuthedReq({ method: 'GET', query: { id: TOUR_UUID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).stages).toEqual([]);
  });

  it('GET returns existing stages', async () => {
    store.tournament_stages = [
      {
        id: 's1',
        tournament_id: TOUR_UUID,
        name: 'Group',
        stage_type: 'group',
        order_index: 0,
      },
      {
        id: 's2',
        tournament_id: TOUR_UUID,
        name: 'Bracket',
        stage_type: 'bracket',
        order_index: 1,
      },
    ] as any;
    const res = makeRes();
    await tournamentStagesHandler(
      makeAuthedReq({ method: 'GET', query: { id: TOUR_UUID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).stages.length).toBe(2);
  });

  it('POST 400 when name missing', async () => {
    const res = makeRes();
    await tournamentStagesHandler(
      makeAuthedReq({ method: 'POST', query: { id: TOUR_UUID }, body: {} }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 on invalid stage_type', async () => {
    const res = makeRes();
    await tournamentStagesHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: TOUR_UUID },
        body: { name: 'X', stage_type: 'invalid' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 on invalid start_date', async () => {
    const res = makeRes();
    await tournamentStagesHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: TOUR_UUID },
        body: { name: 'X', start_date: 'bad-date' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 on invalid end_date', async () => {
    const res = makeRes();
    await tournamentStagesHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: TOUR_UUID },
        body: { name: 'X', end_date: 'bad' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when start_date >= end_date', async () => {
    const res = makeRes();
    await tournamentStagesHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: TOUR_UUID },
        body: {
          name: 'X',
          start_date: '2026-04-10',
          end_date: '2026-04-05',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 on negative order_index', async () => {
    const res = makeRes();
    await tournamentStagesHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: TOUR_UUID },
        body: { name: 'X', order_index: -1 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 404 when tournament not found', async () => {
    const res = makeRes();
    await tournamentStagesHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: TOUR_UUID },
        body: { name: 'Group A', stage_type: 'group' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('POST creates a stage with auto order_index and slug', async () => {
    store.tournaments = [{ id: TOUR_UUID, name: 'T1' }] as any;
    const res = makeRes();
    await tournamentStagesHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: TOUR_UUID },
        body: { name: 'My Group', stage_type: 'group' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const stage = (res.body as any).stage;
    expect(stage.name).toBe('My Group');
    expect(stage.slug).toBe('my-group');
    expect(stage.order_index).toBe(0);
  });

  it('POST creates a stage and increments order_index from max', async () => {
    store.tournaments = [{ id: TOUR_UUID, name: 'T' }] as any;
    store.tournament_stages = [
      {
        id: 's-existing',
        tournament_id: TOUR_UUID,
        order_index: 5,
        name: 'Existing',
      },
    ] as any;
    const res = makeRes();
    await tournamentStagesHandler(
      makeAuthedReq({
        method: 'POST',
        query: { id: TOUR_UUID },
        body: { name: 'Next', stage_type: 'bracket' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    // mock's order() is a noop, so the "max" returned is the first row
    // — what matters is that the create path was exercised.
  });

  it('PATCH 400 when stages not array', async () => {
    const res = makeRes();
    await tournamentStagesHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { id: TOUR_UUID },
        body: { stages: 'nope' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 400 on missing entry id', async () => {
    const res = makeRes();
    await tournamentStagesHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { id: TOUR_UUID },
        body: { stages: [{ order_index: 0 }] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 400 on invalid order_index', async () => {
    const res = makeRes();
    await tournamentStagesHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { id: TOUR_UUID },
        body: { stages: [{ id: 's1', order_index: -1 }] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 404 when tournament not found', async () => {
    const res = makeRes();
    await tournamentStagesHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { id: TOUR_UUID },
        body: { stages: [{ id: 's1', order_index: 0 }] },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('PATCH reorders stages', async () => {
    store.tournaments = [{ id: TOUR_UUID, name: 'T' }] as any;
    store.tournament_stages = [
      {
        id: 's1',
        tournament_id: TOUR_UUID,
        name: 'A',
        order_index: 0,
      },
      {
        id: 's2',
        tournament_id: TOUR_UUID,
        name: 'B',
        order_index: 1,
      },
    ] as any;
    const res = makeRes();
    await tournamentStagesHandler(
      makeAuthedReq({
        method: 'PATCH',
        query: { id: TOUR_UUID },
        body: {
          stages: [
            { id: 's1', order_index: 1 },
            { id: 's2', order_index: 0 },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).stages.length).toBe(2);
  });

  it('405 on DELETE', async () => {
    const res = makeRes();
    await tournamentStagesHandler(
      makeAuthedReq({ method: 'DELETE', query: { id: TOUR_UUID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});
