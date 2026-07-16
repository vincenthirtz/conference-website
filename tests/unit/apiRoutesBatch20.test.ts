import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const {
  logStaffActionMock,
  resetPropagationForMatch,
  propagateBracketForMatch,
} = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
  resetPropagationForMatch: vi.fn(async () => undefined),
  propagateBracketForMatch: vi.fn(async (matchId: string) => ({
    matchId,
    winnerTeamId: null,
    loserTeamId: null,
  })),
}));

vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: logStaffActionMock,
}));
vi.mock('@/utils/bracket/propagate', () => ({
  resetPropagationForMatch,
  propagateBracketForMatch,
  snapshotPropagationSlots: vi.fn(async () => ({})),
  restorePropagationSlots: vi.fn(async () => undefined),
  computeWinnerLoserFromMatch: () => ({
    winnerTeamId: null,
    loserTeamId: null,
  }),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import castMatchHandler from '../../pages/api/cast/[matchId]';
import mvpHandler from '../../pages/api/admin/matches/[matchId]/mvp';
import autoByesHandler from '../../pages/api/admin/stages/[stageId]/auto-byes';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'caster'
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
  resetPropagationForMatch.mockClear();
  propagateBracketForMatch.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('caster')] as any;
});

const M_ID = '550e8400-e29b-41d4-a716-446655440000';
const STAGE_ID = '550e8400-e29b-41d4-a716-446655440100';
const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440200';

/* -----------------------------------------------------------
 * /api/cast/[matchId]
 * ---------------------------------------------------------*/

describe('GET /api/cast/[matchId]', () => {
  it('405 on non-GET', async () => {
    const res = makeRes();
    await castMatchHandler(
      makeReq({ method: 'POST', query: { matchId: M_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid matchId', async () => {
    const res = makeRes();
    await castMatchHandler(
      makeReq({ method: 'GET', query: { matchId: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when match missing', async () => {
    store.matches = [];
    const res = makeRes();
    await castMatchHandler(
      makeReq({ method: 'GET', query: { matchId: M_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('200 returns aggregated match payload (teams, veto, rosters, h2h)', async () => {
    store.matches = [
      {
        id: M_ID,
        status: 'finished',
        match_format: 'bo3',
        round_name: 'Final',
        round_number: 3,
        bracket_side: null,
        team1_id: 't1',
        team2_id: 't2',
        team1_score: 2,
        team2_score: 1,
        winner_team_id: 't1',
        forfeit_team_id: null,
        scheduled_at: '2026-04-01',
        completed_at: '2026-04-01',
        stream_url: null,
        replay_url: null,
        lobby_code: null,
        notes: null,
        team1: {
          id: 't1',
          name: 'Alpha',
          short_name: 'A',
          logo_url: null,
          country: 'FR',
          captain_id: 'cap-1',
        },
        team2: {
          id: 't2',
          name: 'Beta',
          short_name: 'B',
          logo_url: null,
          country: 'BE',
          captain_id: 'cap-2',
        },
        tournament: { id: 'tour-1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', name: 'Cup', slug: 'cup' },
        stage: { id: 's1', name: 'Group', stage_type: 'group' },
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
      {
        match_id: M_ID,
        step_number: 2,
        action: 'pick',
        team_id: 't2',
        map_name: 'Hanamura',
        map_type: 'assault',
      },
    ] as any;
    store.team_members = [
      {
        id: 'm1',
        team_id: 't1',
        user_id: 'cap-1',
        role: 'player',
        battle_tag: 'AlphaCap#1',
        is_substitute: false,
      },
      {
        id: 'm2',
        team_id: 't1',
        user_id: 'p1',
        role: 'substitute',
        battle_tag: 'Sub#1',
        is_substitute: true,
      },
      {
        id: 'm3',
        team_id: 't2',
        user_id: 'p2',
        role: 'player',
        battle_tag: 'BetaPlayer#2',
        is_substitute: false,
      },
    ] as any;
    // No past meetings
    const res = makeRes();
    await castMatchHandler(
      makeReq({ method: 'GET', query: { matchId: M_ID } }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.match.id).toBe(M_ID);
    expect(body.team1.name).toBe('Alpha');
    expect(body.team2.name).toBe('Beta');
    // Captain sorted first in team1
    expect(body.team1.members[0].is_captain).toBe(true);
    expect(body.veto.steps).toHaveLength(2);
    expect(body.veto.pickedMaps).toHaveLength(1);
    expect(body.h2h.total).toBe(0); // no past matches
  });

  it('200 includes h2h with normalized scores', async () => {
    store.matches = [
      {
        id: M_ID,
        status: 'pending',
        match_format: 'bo3',
        team1_id: 't1',
        team2_id: 't2',
        team1: { id: 't1', name: 'Alpha', captain_id: 'cap-1' },
        team2: { id: 't2', name: 'Beta', captain_id: 'cap-2' },
        tournament: { id: 'tour-1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', name: 'Cup' },
        stage: null,
      },
      {
        id: 'past-1',
        status: 'finished',
        team1_id: 't2', // reversed
        team2_id: 't1',
        team1_score: 1,
        team2_score: 3,
        winner_team_id: 't1',
        completed_at: '2026-03-01',
        tournament: { name: 'Old Cup' },
      },
    ] as any;
    store.team_members = [];
    store.match_map_vetos = [];

    const res = makeRes();
    await castMatchHandler(
      makeReq({ method: 'GET', query: { matchId: M_ID } }),
      res
    );

    const body = res.body as any;
    expect(body.h2h.total).toBe(1);
    expect(body.h2h.winsTeam1).toBe(1);
    expect(body.h2h.winsTeam2).toBe(0);
    // Scores normalized: current team1 perspective
    expect(body.h2h.meetings[0].team1Score).toBe(3);
    expect(body.h2h.meetings[0].team2Score).toBe(1);
  });
});

/* -----------------------------------------------------------
 * /api/admin/matches/[matchId]/mvp
 * ---------------------------------------------------------*/

describe('/api/admin/matches/[matchId]/mvp', () => {
  it('400 on invalid matchId', async () => {
    const res = makeRes();
    await mvpHandler(
      makeReq({ method: 'GET', query: { matchId: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 404 when match missing', async () => {
    store.matches = [];
    const res = makeRes();
    await mvpHandler(makeReq({ method: 'GET', query: { matchId: M_ID } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('GET 200 returns poll + candidates', async () => {
    store.matches = [
      {
        id: M_ID,
        status: 'finished',
        team1_id: 't1',
        team2_id: 't2',
        tournament_id: 'tour-1',
      },
    ] as any;
    store.match_mvp_polls = [
      {
        id: 'p1',
        match_id: M_ID,
        winner_member_id: null,
      },
    ] as any;
    store.team_members = [
      {
        id: 'mem1',
        team_id: 't1',
        battle_tag: 'Alpha#1',
        is_substitute: false,
        team: { id: 't1', name: 'Alpha' },
      },
      {
        id: 'mem2',
        team_id: 't2',
        battle_tag: 'Beta#1',
        is_substitute: false,
        team: { id: 't2', name: 'Beta' },
      },
    ] as any;

    const res = makeRes();
    await mvpHandler(makeReq({ method: 'GET', query: { matchId: M_ID } }), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.candidates).toHaveLength(2);
    expect(body.poll.id).toBe('p1');
  });

  it('POST 400 with invalid winnerMemberId', async () => {
    const res = makeRes();
    await mvpHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: { winnerMemberId: 'bogus' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 404 when match missing', async () => {
    store.matches = [];
    const res = makeRes();
    await mvpHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: { winnerMemberId: MEMBER_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('POST 404 when member not found', async () => {
    store.matches = [
      { id: M_ID, team1_id: 't1', team2_id: 't2', tournament_id: 'tour-1' },
    ] as any;
    store.team_members = [];
    const res = makeRes();
    await mvpHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: { winnerMemberId: MEMBER_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('POST 400 when member is not in either team', async () => {
    store.matches = [
      { id: M_ID, team1_id: 't1', team2_id: 't2', tournament_id: 'tour-1' },
    ] as any;
    store.team_members = [
      { id: MEMBER_ID, team_id: 'other-team', battle_tag: 'X#1' },
    ] as any;
    const res = makeRes();
    await mvpHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: { winnerMemberId: MEMBER_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 200 inserts a new poll row when none exists', async () => {
    store.matches = [
      { id: M_ID, team1_id: 't1', team2_id: 't2', tournament_id: 'tour-1' },
    ] as any;
    store.match_mvp_polls = [];
    store.team_members = [
      { id: MEMBER_ID, team_id: 't1', battle_tag: 'Alpha#1' },
    ] as any;
    const res = makeRes();
    await mvpHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: { winnerMemberId: MEMBER_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const inserted = (store.match_mvp_polls as any).find(
      (p: any) => p.match_id === M_ID
    );
    expect(inserted.winner_member_id).toBe(MEMBER_ID);
    expect(inserted.winner_battle_tag).toBe('Alpha#1');
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('POST 200 updates existing poll row', async () => {
    store.matches = [
      { id: M_ID, team1_id: 't1', team2_id: 't2', tournament_id: 'tour-1' },
    ] as any;
    store.match_mvp_polls = [
      { id: 'existing', match_id: M_ID, winner_member_id: null },
    ] as any;
    store.team_members = [
      { id: MEMBER_ID, team_id: 't2', battle_tag: 'Beta#9' },
    ] as any;
    const res = makeRes();
    await mvpHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: { winnerMemberId: MEMBER_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.match_mvp_polls as any)[0].winner_member_id).toBe(MEMBER_ID);
  });

  it('DELETE 200 clears the winner', async () => {
    store.matches = [
      { id: M_ID, team1_id: 't1', team2_id: 't2', tournament_id: 'tour-1' },
    ] as any;
    store.match_mvp_polls = [
      {
        id: 'p1',
        match_id: M_ID,
        winner_member_id: 'old',
        winner_battle_tag: 'Old#1',
      },
    ] as any;
    const res = makeRes();
    await mvpHandler(
      makeReq({ method: 'DELETE', query: { matchId: M_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.match_mvp_polls as any)[0].winner_member_id).toBeNull();
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('returns 405 on PATCH', async () => {
    const res = makeRes();
    await mvpHandler(
      makeReq({ method: 'PATCH', query: { matchId: M_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/admin/stages/[stageId]/auto-byes
 * ---------------------------------------------------------*/

describe('POST /api/admin/stages/[stageId]/auto-byes', () => {
  beforeEach(() => {
    store.staff = [makeStaffRow('admin')] as any;
  });

  it('405 on non-POST', async () => {
    const res = makeRes();
    await autoByesHandler(
      makeReq({ method: 'GET', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid stageId', async () => {
    const res = makeRes();
    await autoByesHandler(
      makeReq({ method: 'POST', query: { stageId: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when stage missing', async () => {
    store.tournament_stages = [];
    const res = makeRes();
    await autoByesHandler(
      makeReq({ method: 'POST', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('200 with empty result when no candidate matches', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: 'tour-1' },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        stage_id: STAGE_ID,
        status: 'pending',
        team1_id: 't1',
        team2_id: 't2', // both teams set
        is_bye: false,
      },
    ] as any;
    const res = makeRes();
    await autoByesHandler(
      makeReq({ method: 'POST', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).updatedMatchIds).toEqual([]);
  });

  it('200 marks single-team matches as BYE and propagates', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: 'tour-1' },
    ] as any;
    store.matches = [
      {
        id: 'm-bye-1',
        tournament_id: 'tour-1',
        stage_id: STAGE_ID,
        status: 'pending',
        team1_id: 't1',
        team2_id: null,
        is_bye: false,
        round_number: 1,
      },
      {
        id: 'm-normal',
        tournament_id: 'tour-1',
        stage_id: STAGE_ID,
        status: 'pending',
        team1_id: 't1',
        team2_id: 't2',
        is_bye: false,
        round_number: 1,
      },
    ] as any;
    const res = makeRes();
    await autoByesHandler(
      makeReq({ method: 'POST', query: { stageId: STAGE_ID } }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.updatedMatchIds).toEqual(['m-bye-1']);
    expect(body.failed).toEqual([]);

    const updated = (store.matches as any).find((m: any) => m.id === 'm-bye-1');
    expect(updated.is_bye).toBe(true);
    expect(updated.status).toBe('finished');
    expect(updated.winner_team_id).toBe('t1');
    // S5a: helpers now take tenantId as the first positional arg.
    expect(resetPropagationForMatch).toHaveBeenCalledWith(
      'ce69a726-773e-4d12-b5eb-d2503aa752b4',
      'm-bye-1'
    );
    expect(propagateBracketForMatch).toHaveBeenCalledWith(
      'ce69a726-773e-4d12-b5eb-d2503aa752b4',
      'm-bye-1'
    );
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('200 respects roundNumber filter', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: 'tour-1' },
    ] as any;
    store.matches = [
      {
        id: 'm-r1',
        tournament_id: 'tour-1',
        stage_id: STAGE_ID,
        status: 'pending',
        team1_id: 't1',
        team2_id: null,
        is_bye: false,
        round_number: 1,
      },
      {
        id: 'm-r2',
        tournament_id: 'tour-1',
        stage_id: STAGE_ID,
        status: 'pending',
        team1_id: null,
        team2_id: 't2',
        is_bye: false,
        round_number: 2,
      },
    ] as any;
    const res = makeRes();
    await autoByesHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { roundNumber: 2 },
      }),
      res
    );
    expect((res.body as any).updatedMatchIds).toEqual(['m-r2']);
  });

  it('200 with propagate=false skips bracket propagation', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: 'tour-1' },
    ] as any;
    store.matches = [
      {
        id: 'm-bye',
        tournament_id: 'tour-1',
        stage_id: STAGE_ID,
        status: 'pending',
        team1_id: 't1',
        team2_id: null,
        is_bye: false,
        round_number: 1,
      },
    ] as any;
    const res = makeRes();
    await autoByesHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { propagate: false },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(propagateBracketForMatch).not.toHaveBeenCalled();
    expect(resetPropagationForMatch).toHaveBeenCalledOnce();
  });
});
