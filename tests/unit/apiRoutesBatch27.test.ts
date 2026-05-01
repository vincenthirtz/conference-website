import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { logStaffActionMock, applyMatchScoreMock, notifyMatchStarting } =
  vi.hoisted(() => ({
    logStaffActionMock: vi.fn(async () => undefined),
    applyMatchScoreMock: vi.fn(async (input: any) => ({
      matchId: input.matchId,
      updated: true,
      match: {},
      winnerTeamId: 'team-a',
    })),
    notifyMatchStarting: vi.fn(async () => undefined),
  }));

vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));
vi.mock('@/utils/matches/applyScore', () => ({
  applyMatchScore: applyMatchScoreMock,
}));
vi.mock('@/utils/discord', () => ({ notifyMatchStarting }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import adminTeamHandler from '../../pages/api/admin/teams/[teamId]';
import adminMatchHandler from '../../pages/api/admin/matches/[matchId]';

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
  applyMatchScoreMock.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('manager')] as any;
});

const TEAM_ID = '550e8400-e29b-41d4-a716-446655440000';
const M_ID = '550e8400-e29b-41d4-a716-446655440001';

/* -----------------------------------------------------------
 * /api/admin/teams/[teamId]
 * ---------------------------------------------------------*/

describe('/api/admin/teams/[teamId]', () => {
  it('400 on invalid teamId', async () => {
    const res = makeRes();
    await adminTeamHandler(
      makeReq({ method: 'GET', query: { teamId: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 404 when team missing', async () => {
    store.teams = [];
    const res = makeRes();
    await adminTeamHandler(
      makeReq({ method: 'GET', query: { teamId: TEAM_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('GET 200 returns team with members + is_captain flag', async () => {
    store.teams = [
      {
        id: TEAM_ID,
        name: 'Alpha',
        captain_id: 'cap-1',
        is_active: true,
      },
    ] as any;
    store.team_members = [
      {
        id: 'm1',
        team_id: TEAM_ID,
        user_id: 'cap-1',
        role: 'player',
        battle_tag: 'Cap#1',
      },
      {
        id: 'm2',
        team_id: TEAM_ID,
        user_id: 'p2',
        role: 'player',
        battle_tag: 'P2#2',
      },
    ] as any;
    const res = makeRes();
    await adminTeamHandler(
      makeReq({ method: 'GET', query: { teamId: TEAM_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.team.name).toBe('Alpha');
    expect(body.members).toHaveLength(2);
    const cap = body.members.find((m: any) => m.user_id === 'cap-1');
    expect(cap.is_captain).toBe(true);
  });

  it('PUT 400 when no valid fields', async () => {
    store.teams = [{ id: TEAM_ID, name: 'A' }] as any;
    const res = makeRes();
    await adminTeamHandler(
      makeReq({ method: 'PUT', query: { teamId: TEAM_ID }, body: {} }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 400 when name is empty', async () => {
    store.teams = [{ id: TEAM_ID, name: 'A' }] as any;
    const res = makeRes();
    await adminTeamHandler(
      makeReq({
        method: 'PUT',
        query: { teamId: TEAM_ID },
        body: { name: '   ' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 400 with invalid discord_role_id', async () => {
    store.teams = [{ id: TEAM_ID, name: 'A' }] as any;
    const res = makeRes();
    await adminTeamHandler(
      makeReq({
        method: 'PUT',
        query: { teamId: TEAM_ID },
        body: { discord_role_id: 'abc' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 400 on invalid logo URL', async () => {
    store.teams = [{ id: TEAM_ID, name: 'A' }] as any;
    const res = makeRes();
    await adminTeamHandler(
      makeReq({
        method: 'PUT',
        query: { teamId: TEAM_ID },
        body: { logo_url: 'javascript:alert(1)' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 200 updates team with sanitized fields and logs', async () => {
    store.teams = [
      { id: TEAM_ID, name: 'Old', country: 'FR', short_name: 'O' },
    ] as any;
    const res = makeRes();
    await adminTeamHandler(
      makeReq({
        method: 'PUT',
        query: { teamId: TEAM_ID },
        body: {
          name: 'New',
          country: 'BE',
          logo_url: 'https://example.com/logo.png',
          discord_role_id: '12345678901234567',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.teams[0] as any).name).toBe('New');
    expect((store.teams[0] as any).country).toBe('BE');
    expect((store.teams[0] as any).logo_url).toBe(
      'https://example.com/logo.png'
    );
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('DELETE soft 200 deactivates the team', async () => {
    store.teams = [{ id: TEAM_ID, name: 'A', is_active: true }] as any;
    const res = makeRes();
    await adminTeamHandler(
      makeReq({ method: 'DELETE', query: { teamId: TEAM_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.teams[0] as any).is_active).toBe(false);
    expect((store.teams[0] as any).deleted_at).toBeTruthy();
  });

  it('DELETE ?hard=1 cascades and removes the team', async () => {
    store.teams = [{ id: TEAM_ID, name: 'A', is_active: true }] as any;
    store.team_members = [{ id: 'tm1', team_id: TEAM_ID }] as any;
    store.demandes = [{ id: 'd1', team_id: TEAM_ID }] as any;
    store.stage_teams = [{ stage_id: 's1', team_id: TEAM_ID }] as any;
    const res = makeRes();
    await adminTeamHandler(
      makeReq({
        method: 'DELETE',
        query: { teamId: TEAM_ID, hard: '1' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).hardDeleted).toBe(true);
    expect(store.teams.length).toBe(0);
    expect(store.team_members.length).toBe(0);
    expect(store.demandes.length).toBe(0);
    expect(store.stage_teams.length).toBe(0);
  });

  it('DELETE 404 when team missing', async () => {
    store.teams = [];
    const res = makeRes();
    await adminTeamHandler(
      makeReq({ method: 'DELETE', query: { teamId: TEAM_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await adminTeamHandler(
      makeReq({ method: 'POST', query: { teamId: TEAM_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('PUT 400 with invalid logo_url protocol', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Alpha', is_active: true }] as any;
    const res = makeRes();
    await adminTeamHandler(
      makeReq({
        method: 'PUT',
        query: { teamId: TEAM_ID },
        body: { logo_url: 'javascript:alert(1)' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 400 with invalid website URL', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Alpha', is_active: true }] as any;
    const res = makeRes();
    await adminTeamHandler(
      makeReq({
        method: 'PUT',
        query: { teamId: TEAM_ID },
        body: { website: 'not-a-url' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});

/* -----------------------------------------------------------
 * /api/admin/matches/[matchId]
 * ---------------------------------------------------------*/

describe('/api/admin/matches/[matchId]', () => {
  it('400 on invalid matchId', async () => {
    const res = makeRes();
    await adminMatchHandler(
      makeReq({ method: 'GET', query: { matchId: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 404 when match missing', async () => {
    store.matches = [];
    const res = makeRes();
    await adminMatchHandler(
      makeReq({ method: 'GET', query: { matchId: M_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('GET 200 returns the match', async () => {
    store.matches = [
      {
        id: M_ID,
        tournament_id: 'tour-1',
        stage_id: 's1',
        status: 'pending',
        team1_id: 't1',
        team2_id: 't2',
        is_bye: false,
      },
    ] as any;
    const res = makeRes();
    await adminMatchHandler(
      makeReq({ method: 'GET', query: { matchId: M_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).match.id).toBe(M_ID);
  });

  it('PUT 409 when expected_updated_at does not match', async () => {
    store.matches = [
      {
        id: M_ID,
        tournament_id: 'tour-1',
        updated_at: '2026-04-01T11:00:00Z',
      },
    ] as any;
    store.tournaments = [{ id: 'tour-1', status: 'running' }] as any;
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: {
          expected_updated_at: '2026-04-01T10:00:00Z',
          team1Score: 1,
          team2Score: 0,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
  });

  it('PUT 403 when tournament is completed', async () => {
    store.matches = [
      { id: M_ID, tournament_id: 'tour-1', updated_at: '2026' },
    ] as any;
    store.tournaments = [{ id: 'tour-1', status: 'completed' }] as any;
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: { team1Score: 1, team2Score: 0 },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('PUT score path 400 when scores not numeric', async () => {
    store.matches = [{ id: M_ID, tournament_id: 'tour-1' }] as any;
    store.tournaments = [{ id: 'tour-1', status: 'running' }] as any;
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: { team1Score: 'not-a-number' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT score path 400 when status="disputed" (must use /dispute endpoint)', async () => {
    store.matches = [{ id: M_ID, tournament_id: 'tour-1' }] as any;
    store.tournaments = [{ id: 'tour-1', status: 'running' }] as any;
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: { team1Score: 2, team2Score: 1, status: 'disputed' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('USE_DISPUTE_ENDPOINT');
  });

  it('PUT 200 score path delegates to applyMatchScore', async () => {
    store.matches = [{ id: M_ID, tournament_id: 'tour-1' }] as any;
    store.tournaments = [{ id: 'tour-1', status: 'running' }] as any;
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: { team1Score: 2, team2Score: 1 },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(applyMatchScoreMock).toHaveBeenCalledOnce();
  });

  it('PUT meta path 400 when no valid meta fields', async () => {
    store.matches = [{ id: M_ID, tournament_id: 'tour-1' }] as any;
    store.tournaments = [{ id: 'tour-1', status: 'running' }] as any;
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: { mode: 'meta', random_field: 'x' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT meta path 400 with invalid bracket_side', async () => {
    store.matches = [{ id: M_ID, tournament_id: 'tour-1' }] as any;
    store.tournaments = [{ id: 'tour-1', status: 'running' }] as any;
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: { mode: 'meta', bracket_side: 'invalid' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT meta path 400 with invalid next_match_win_slot', async () => {
    store.matches = [{ id: M_ID, tournament_id: 'tour-1' }] as any;
    store.tournaments = [{ id: 'tour-1', status: 'running' }] as any;
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: { mode: 'meta', next_match_win_slot: 3 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT meta path 200 updates planning fields', async () => {
    store.matches = [
      {
        id: M_ID,
        tournament_id: 'tour-1',
        scheduled_at: null,
        notes: null,
      },
    ] as any;
    store.tournaments = [
      {
        id: 'tour-1',
        status: 'running',
        start_date: '2026-04-01',
        end_date: '2026-04-30',
      },
    ] as any;
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: {
          mode: 'meta',
          scheduled_at: '2026-04-15T10:00:00Z',
          notes: 'A note',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.matches[0] as any).notes).toBe('A note');
  });
});
