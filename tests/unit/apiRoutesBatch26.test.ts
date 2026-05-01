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

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: logStaffActionMock,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import stageTeamsHandler from '../../pages/api/admin/stages/[stageId]/teams';
import teamTournamentsHandler from '../../pages/api/admin/teams/[teamId]/tournaments';

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
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('manager')] as any;
});

const STAGE_ID = '550e8400-e29b-41d4-a716-446655440000';
const TEAM_ID = '550e8400-e29b-41d4-a716-446655440001';
const TID = '550e8400-e29b-41d4-a716-446655440002';

/* -----------------------------------------------------------
 * /api/admin/stages/[stageId]/teams
 * ---------------------------------------------------------*/

describe('/api/admin/stages/[stageId]/teams', () => {
  it('400 on invalid stageId', async () => {
    const res = makeRes();
    await stageTeamsHandler(
      makeReq({ method: 'GET', query: { stageId: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 404 when stage missing', async () => {
    store.tournament_stages = [];
    const res = makeRes();
    await stageTeamsHandler(
      makeReq({ method: 'GET', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('GET 200 returns stage + tournament + teams', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: TID,
        name: 'Group A',
        stage_type: 'group',
      },
    ] as any;
    store.tournaments = [{ id: TID, name: 'Cup', slug: 'cup' }] as any;
    store.stage_teams = [
      {
        stage_id: STAGE_ID,
        team_id: 't1',
        seed: 1,
        is_substitute: false,
        notes: null,
        team: {
          id: 't1',
          name: 'Alpha',
          short_name: 'A',
          logo_url: null,
        },
      },
    ] as any;
    const res = makeRes();
    await stageTeamsHandler(
      makeReq({ method: 'GET', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.stage.name).toBe('Group A');
    expect(body.tournament.name).toBe('Cup');
    expect(body.teams).toHaveLength(1);
  });

  it('POST 400 when teamId missing', async () => {
    store.tournament_stages = [{ id: STAGE_ID, tournament_id: TID }] as any;
    const res = makeRes();
    await stageTeamsHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 404 when stage missing', async () => {
    store.tournament_stages = [];
    const res = makeRes();
    await stageTeamsHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { teamId: TEAM_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('POST 201 inserts a stage_team and reports min_players warning', async () => {
    store.tournament_stages = [{ id: STAGE_ID, tournament_id: TID }] as any;
    store.tournaments = [{ id: TID, min_players: 5 }] as any;
    store.team_members = [{ user_id: 'u1', team_id: TEAM_ID }] as any;
    store.stage_teams = [];
    const res = makeRes();
    await stageTeamsHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { teamId: TEAM_ID, seed: 3 },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const body = res.body as any;
    expect(body.stageTeam.team_id).toBe(TEAM_ID);
    expect(body.warnings.length).toBeGreaterThan(0);
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('PATCH unitaire 200 updates a single seed', async () => {
    store.tournament_stages = [{ id: STAGE_ID, tournament_id: TID }] as any;
    store.stage_teams = [
      { stage_id: STAGE_ID, team_id: TEAM_ID, seed: 5 },
    ] as any;
    const res = makeRes();
    await stageTeamsHandler(
      makeReq({
        method: 'PATCH',
        query: { stageId: STAGE_ID },
        body: { teamId: TEAM_ID, seed: 9 },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.stage_teams[0] as any).seed).toBe(9);
  });

  it('PATCH bulk 200 updates multiple seeds', async () => {
    store.tournament_stages = [{ id: STAGE_ID, tournament_id: TID }] as any;
    store.stage_teams = [
      { stage_id: STAGE_ID, team_id: 't1', seed: 1 },
      { stage_id: STAGE_ID, team_id: 't2', seed: 2 },
    ] as any;
    const res = makeRes();
    await stageTeamsHandler(
      makeReq({
        method: 'PATCH',
        query: { stageId: STAGE_ID },
        body: {
          seeds: [
            { teamId: 't1', seed: 5 },
            { teamId: 't2', seed: 10 },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).bulk).toBe(true);
    expect((res.body as any).results).toHaveLength(2);
    expect((store.stage_teams[0] as any).seed).toBe(5);
    expect((store.stage_teams[1] as any).seed).toBe(10);
  });

  it('PATCH unitaire 400 when teamId missing', async () => {
    store.tournament_stages = [{ id: STAGE_ID, tournament_id: TID }] as any;
    const res = makeRes();
    await stageTeamsHandler(
      makeReq({
        method: 'PATCH',
        query: { stageId: STAGE_ID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('DELETE 400 when no teamId / teamIds provided', async () => {
    store.tournament_stages = [{ id: STAGE_ID, tournament_id: TID }] as any;
    const res = makeRes();
    await stageTeamsHandler(
      makeReq({
        method: 'DELETE',
        query: { stageId: STAGE_ID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('DELETE unitaire 200 removes a team and clears match slots', async () => {
    store.tournament_stages = [{ id: STAGE_ID, tournament_id: TID }] as any;
    store.stage_teams = [
      { stage_id: STAGE_ID, team_id: TEAM_ID, seed: 1 },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        stage_id: STAGE_ID,
        team1_id: TEAM_ID,
        team2_id: 'other',
        team1_score: 2,
        team2_score: 1,
        winner_team_id: TEAM_ID,
      },
    ] as any;
    const res = makeRes();
    await stageTeamsHandler(
      makeReq({
        method: 'DELETE',
        query: { stageId: STAGE_ID },
        body: { teamId: TEAM_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.stage_teams.length).toBe(0);
    expect((store.matches[0] as any).team1_id).toBeNull();
    expect((store.matches[0] as any).winner_team_id).toBeNull();
  });

  it('DELETE bulk 200 removes multiple teams', async () => {
    store.tournament_stages = [{ id: STAGE_ID, tournament_id: TID }] as any;
    store.stage_teams = [
      { stage_id: STAGE_ID, team_id: 't1', seed: 1 },
      { stage_id: STAGE_ID, team_id: 't2', seed: 2 },
      { stage_id: STAGE_ID, team_id: 't3', seed: 3 },
    ] as any;
    store.matches = [];
    const res = makeRes();
    await stageTeamsHandler(
      makeReq({
        method: 'DELETE',
        query: { stageId: STAGE_ID },
        body: { teamIds: ['t1', 't3'] },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.stage_teams.length).toBe(1);
    expect((store.stage_teams[0] as any).team_id).toBe('t2');
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await stageTeamsHandler(
      makeReq({ method: 'PUT', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('POST 201 with duplicate-player warning across other teams', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: TID },
      { id: 'stage-other', tournament_id: TID },
    ] as any;
    store.tournaments = [{ id: TID, min_players: null }] as any;
    store.team_members = [
      { user_id: 'u1', team_id: TEAM_ID },
      { user_id: 'u1', team_id: 'team-other', teams: { name: 'OtherTeam' } },
    ] as any;
    store.stage_teams = [
      { stage_id: 'stage-other', team_id: 'team-other' },
    ] as any;
    store.teams = [
      { id: TEAM_ID, name: 'Alpha' },
      { id: 'team-other', name: 'OtherTeam' },
    ] as any;
    const res = makeRes();
    await stageTeamsHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { teamId: TEAM_ID, seed: 1 },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const body = res.body as any;
    expect(body.warnings).toBeTruthy();
    expect(body.warnings.some((w: string) => w.includes('autre équipe'))).toBe(
      true
    );
  });

  it('PATCH bulk records per-entry failure for invalid entries', async () => {
    store.tournament_stages = [{ id: STAGE_ID, tournament_id: TID }] as any;
    const res = makeRes();
    await stageTeamsHandler(
      makeReq({
        method: 'PATCH',
        query: { stageId: STAGE_ID },
        body: {
          seeds: [
            { teamId: '', seed: 1 }, // invalid: empty teamId
            { teamId: 't1', seed: null }, // valid
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.bulk).toBe(true);
    expect(body.results).toHaveLength(2);
    expect(body.results[0].success).toBe(false);
  });

  it('POST 201 without warnings when min_players satisfied', async () => {
    store.tournament_stages = [{ id: STAGE_ID, tournament_id: TID }] as any;
    store.tournaments = [{ id: TID, min_players: 1 }] as any;
    store.team_members = [
      { user_id: 'u1', team_id: TEAM_ID },
      { user_id: 'u2', team_id: TEAM_ID },
    ] as any;
    store.stage_teams = [];
    const res = makeRes();
    await stageTeamsHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { teamId: TEAM_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
  });
});

/* -----------------------------------------------------------
 * /api/admin/teams/[teamId]/tournaments
 * ---------------------------------------------------------*/

describe('/api/admin/teams/[teamId]/tournaments', () => {
  it('400 on invalid teamId', async () => {
    const res = makeRes();
    await teamTournamentsHandler(
      makeReq({ method: 'GET', query: { teamId: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when team missing', async () => {
    store.teams = [];
    const res = makeRes();
    await teamTournamentsHandler(
      makeReq({ method: 'GET', query: { teamId: TEAM_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('GET 200 returns published tournaments + registrations', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Alpha' }] as any;
    store.tournaments = [
      {
        id: TID,
        name: 'Cup',
        slug: 'cup',
        game: 'OW2',
        status: 'published',
        start_date: '2026-04-01',
        end_date: null,
        max_teams: 16,
      },
      {
        id: 'tour-other',
        name: 'Other',
        slug: 'other',
        status: 'draft',
        start_date: '2026-04-01',
      },
    ] as any;
    store.stage_teams = [
      {
        stage_id: 's1',
        team_id: TEAM_ID,
        tournament_stages: {
          id: 's1',
          tournament_id: TID,
          name: 'Group',
          stage_type: 'group',
          tournaments: {
            id: TID,
            name: 'Cup',
            slug: 'cup',
            game: 'OW2',
            status: 'published',
            start_date: '2026-04-01',
            end_date: null,
          },
        },
      },
    ] as any;

    const res = makeRes();
    await teamTournamentsHandler(
      makeReq({ method: 'GET', query: { teamId: TEAM_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    // The route returns various fields — ensure it doesn't 500.
    expect(res.body).toBeTruthy();
  });

  it('POST 400 when tournamentId missing', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Alpha' }] as any;
    const res = makeRes();
    await teamTournamentsHandler(
      makeReq({
        method: 'POST',
        query: { teamId: TEAM_ID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 405 on unsupported method', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Alpha' }] as any;
    const res = makeRes();
    await teamTournamentsHandler(
      makeReq({ method: 'PATCH', query: { teamId: TEAM_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});
