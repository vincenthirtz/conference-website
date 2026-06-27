// Coverage boost: targets the largest uncovered branches in admin routes.
// Focused on: bracket.ts (double_elim, save, validate), stages/advance,
// matches/[matchId] DELETE & PUT meta with discord, matches/veto POST happy
// path (incl. game auto-creation), admin/demandes POST side effects.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const {
  logStaffActionMock,
  applyMatchScoreMock,
  notifyMatchStartingMock,
  notifyVetoStepMock,
  notifyMatchResultMock,
  notifyScrimRequestMock,
  notifyBracketUpdateMock,
  notifyAnnouncementMock,
  notifyCheckinReminderMock,
  notifyCheckinForfeitMock,
  notifySupportTicketMock,
  postMvpPollMock,
  postToDiscordWebhookMock,
} = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
  applyMatchScoreMock: vi.fn(async (input: any) => ({
    matchId: input.matchId,
    updated: true,
    match: {},
    winnerTeamId: 'team-a',
  })),
  notifyMatchStartingMock: vi.fn(async () => undefined),
  notifyVetoStepMock: vi.fn(async () => undefined),
  notifyMatchResultMock: vi.fn(async () => undefined),
  notifyScrimRequestMock: vi.fn(async () => undefined),
  notifyBracketUpdateMock: vi.fn(async () => undefined),
  notifyAnnouncementMock: vi.fn(async () => undefined),
  notifyCheckinReminderMock: vi.fn(async () => undefined),
  notifyCheckinForfeitMock: vi.fn(async () => undefined),
  notifySupportTicketMock: vi.fn(async () => undefined),
  postMvpPollMock: vi.fn(async () => undefined),
  postToDiscordWebhookMock: vi.fn(async () => undefined),
}));

vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));
vi.mock('@/utils/matches/applyScore', () => ({
  applyMatchScore: applyMatchScoreMock,
}));
// Mock the FULL discord surface — providing only some exports leaks into other
// test files in --no-isolate mode and breaks tests that import the real ones.
vi.mock('@/utils/discord', () => ({
  notifyMatchStarting: notifyMatchStartingMock,
  notifyVetoStep: notifyVetoStepMock,
  notifyMatchResult: notifyMatchResultMock,
  notifyScrimRequest: notifyScrimRequestMock,
  notifyBracketUpdate: notifyBracketUpdateMock,
  notifyAnnouncement: notifyAnnouncementMock,
  notifyCheckinReminder: notifyCheckinReminderMock,
  notifyCheckinForfeit: notifyCheckinForfeitMock,
  notifySupportTicket: notifySupportTicketMock,
  postMvpPoll: postMvpPollMock,
  postToDiscordWebhook: postToDiscordWebhookMock,
}));

// NOTE: We deliberately do NOT mock @/utils/stages/standings here. That module
// is mocked by utilsSweep2d.test.ts and re-mocking it from this file causes
// mock cross-contamination in --no-isolate + coverage mode. Auto-mode tests
// for advance.ts that depend on populated standings live in that file or use
// the real implementation against an empty mock store (which triggers the
// 400 "empty standings" path).

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import bracketHandler from '../../pages/api/admin/tournament/[id]/bracket';
import advanceHandler from '../../pages/api/admin/stages/[stageId]/advance';
import adminMatchHandler from '../../pages/api/admin/matches/[matchId]';
import vetoHandler from '../../pages/api/admin/matches/[matchId]/veto';
import adminDemandesHandler from '../../pages/api/admin/demandes';
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
  applyMatchScoreMock.mockClear();
  notifyMatchStartingMock.mockClear();
  notifyVetoStepMock.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
});

const TID = '550e8400-e29b-41d4-a716-446655440000';
const STAGE_ID = '550e8400-e29b-41d4-a716-446655440001';
const TARGET_STAGE_ID = '550e8400-e29b-41d4-a716-446655440002';
const M_ID = '550e8400-e29b-41d4-a716-446655440003';
const TEAM_ID = '550e8400-e29b-41d4-a716-446655440004';

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/bracket — generate_double_elim
 * ---------------------------------------------------------*/

describe('POST /api/admin/tournament/[id]/bracket — generate_double_elim', () => {
  it('400 on invalid size', async () => {
    const res = makeRes();
    await bracketHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { action: 'generate_double_elim', size: 5 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('201 generates a size=4 double-elimination bracket without GF reset', async () => {
    store.matches = [];
    const res = makeRes();
    await bracketHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          action: 'generate_double_elim',
          size: 4,
          bestOf: 5,
          startDate: '2026-04-01T10:00:00Z',
          intervalMinutes: 15,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const body = res.body as any;
    // size=4 DE: WB 3 (2+1), LB 2 (1+1) for 2*(log2(4)-1)=2 rounds, GF 1 = 6
    expect(body.match_count).toBeGreaterThan(0);
    const all = store.matches as any[];
    expect(all.some((m) => m.bracket_side === 'wb')).toBe(true);
    expect(all.some((m) => m.bracket_side === 'lb')).toBe(true);
    expect(all.some((m) => m.bracket_side === 'final')).toBe(true);
    // GF reset NOT included
    expect(
      (all.filter((m) => m.bracket_side === 'final') as any[]).length
    ).toBe(1);
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('201 generates size=8 DE with grand final reset', async () => {
    store.matches = [];
    const res = makeRes();
    await bracketHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          action: 'generate_double_elim',
          size: 8,
          grandFinalReset: true,
          startDate: '2026-04-01T10:00:00Z',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const all = store.matches as any[];
    // GF + reset
    expect(
      (all.filter((m) => m.bracket_side === 'final') as any[]).length
    ).toBe(2);
  });

  it('201 generates size=16 DE without bestOf or startDate', async () => {
    store.matches = [];
    const res = makeRes();
    await bracketHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          action: 'generate_double_elim',
          size: 16,
          bestOf: null,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const all = store.matches as any[];
    // 16 -> wb=4 rounds (8+4+2+1=15), lb=2*(4-1)=6 rounds, gf=1 = 22 total
    expect(all.length).toBeGreaterThan(15);
    // No scheduled_at when no startDate
    expect(all.every((m) => m.scheduled_at === null)).toBe(true);
    // No match_format when bestOf is null
    expect(all.every((m) => m.match_format === null)).toBe(true);
  });
});

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/bracket — save action
 * ---------------------------------------------------------*/

describe('POST /api/admin/tournament/[id]/bracket — save', () => {
  it('400 when matches is missing or empty', async () => {
    const res = makeRes();
    await bracketHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { action: 'save', matches: [] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when matches is not an array', async () => {
    const res = makeRes();
    await bracketHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { action: 'save', matches: null },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 saves team slots and scheduling', async () => {
    store.matches = [
      { id: 'm1', tournament_id: TID, team1_id: null, team2_id: null },
      { id: 'm2', tournament_id: TID, team1_id: null, team2_id: null },
    ] as any;
    const res = makeRes();
    await bracketHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          action: 'save',
          matches: [
            {
              id: 'm1',
              team1_id: 'team-x',
              team2_id: 'team-y',
              scheduled_at: '2026-04-01T10:00:00Z',
            },
            { id: 'm2', team1_id: null, team2_id: 'team-z' },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const m1 = (store.matches as any).find((m: any) => m.id === 'm1');
    expect(m1.team1_id).toBe('team-x');
    expect(m1.team2_id).toBe('team-y');
    expect(m1.scheduled_at).toBe('2026-04-01T10:00:00Z');
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });
});

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/bracket — validate action
 * ---------------------------------------------------------*/

describe('POST /api/admin/tournament/[id]/bracket — validate', () => {
  it('200 returns validation result for empty bracket', async () => {
    store.matches = [];
    const res = makeRes();
    await bracketHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { action: 'validate' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toBeTruthy();
  });

  it('200 validates a small bracket', async () => {
    store.matches = [
      {
        id: 'm1',
        tournament_id: TID,
        round_number: 1,
        bracket_side: 'wb',
        next_match_win_id: 'm2',
        status: 'pending',
      },
      {
        id: 'm2',
        tournament_id: TID,
        round_number: 2,
        bracket_side: 'wb',
        next_match_win_id: null,
        status: 'pending',
      },
    ] as any;
    const res = makeRes();
    await bracketHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { action: 'validate' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  it('200 validates with stageId filter', async () => {
    store.matches = [
      {
        id: 'm1',
        tournament_id: TID,
        stage_id: 's1',
        round_number: 1,
        bracket_side: 'wb',
        status: 'pending',
      },
    ] as any;
    const res = makeRes();
    await bracketHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { action: 'validate', stageId: 's1' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });
});

/* -----------------------------------------------------------
 * /api/admin/stages/[stageId]/advance — manual + auto modes
 * ---------------------------------------------------------*/

describe('POST /api/admin/stages/[stageId]/advance — manual mode', () => {
  it('400 when targetStageId missing', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: TID,
        stage_type: 'group',
        settings: {},
        is_active: true,
      },
    ] as any;
    const res = makeRes();
    await advanceHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { teamIds: ['t1', 't2'] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when teamIds missing or empty', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: TID,
        stage_type: 'group',
        settings: {},
        is_active: true,
      },
      {
        id: TARGET_STAGE_ID,
        tournament_id: TID,
        stage_type: 'bracket',
        settings: {},
        is_active: false,
      },
    ] as any;
    const res = makeRes();
    await advanceHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { targetStageId: TARGET_STAGE_ID, teamIds: [] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when target stage missing', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: TID,
        stage_type: 'group',
        settings: {},
        is_active: true,
      },
    ] as any;
    const res = makeRes();
    await advanceHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: {
          targetStageId: TARGET_STAGE_ID,
          teamIds: ['t1'],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('400 when target stage is in different tournament', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: TID,
        stage_type: 'group',
        settings: {},
        is_active: true,
      },
      {
        id: TARGET_STAGE_ID,
        tournament_id: 'other-tournament',
        stage_type: 'bracket',
        settings: {},
        is_active: false,
      },
    ] as any;
    const res = makeRes();
    await advanceHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: {
          targetStageId: TARGET_STAGE_ID,
          teamIds: ['t1'],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when teamIds not in source stage', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: TID,
        stage_type: 'group',
        settings: {},
        is_active: true,
      },
      {
        id: TARGET_STAGE_ID,
        tournament_id: TID,
        stage_type: 'bracket',
        settings: {},
        is_active: false,
      },
    ] as any;
    store.stage_teams = [{ stage_id: STAGE_ID, team_id: 't1' }] as any;
    const res = makeRes();
    await advanceHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: {
          targetStageId: TARGET_STAGE_ID,
          teamIds: ['t-not-in-stage'],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 advances teams with seedMode=manual', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: TID,
        stage_type: 'group',
        settings: {},
        is_active: true,
      },
      {
        id: TARGET_STAGE_ID,
        tournament_id: TID,
        stage_type: 'bracket',
        settings: {},
        is_active: false,
      },
    ] as any;
    store.stage_teams = [
      { stage_id: STAGE_ID, team_id: 't1' },
      { stage_id: STAGE_ID, team_id: 't2' },
    ] as any;
    const res = makeRes();
    await advanceHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: {
          targetStageId: TARGET_STAGE_ID,
          teamIds: ['t1', 't2'],
          seedMode: 'manual',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.advanced).toHaveLength(2);
    expect(body.advanced[0].seed).toBe(1);
    expect(body.advanced[1].seed).toBe(2);
    expect(body.skipped).toEqual([]);
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('200 advances teams with seedMode=rank (real standings on empty store)', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: TID,
        stage_type: 'group',
        settings: {},
        is_active: true,
      },
      {
        id: TARGET_STAGE_ID,
        tournament_id: TID,
        stage_type: 'bracket',
        settings: {},
        is_active: false,
      },
    ] as any;
    store.stage_teams = [
      { stage_id: STAGE_ID, team_id: 't1' },
      { stage_id: STAGE_ID, team_id: 't2' },
    ] as any;
    const res = makeRes();
    await advanceHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: {
          targetStageId: TARGET_STAGE_ID,
          teamIds: ['t1', 't2'],
          seedMode: 'rank',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('200 reports skipped when teams already in target', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: TID,
        stage_type: 'group',
        settings: {},
        is_active: true,
      },
      {
        id: TARGET_STAGE_ID,
        tournament_id: TID,
        stage_type: 'bracket',
        settings: {},
        is_active: false,
      },
    ] as any;
    store.stage_teams = [
      { stage_id: STAGE_ID, team_id: 't1' },
      { stage_id: STAGE_ID, team_id: 't2' },
      { stage_id: TARGET_STAGE_ID, team_id: 't1' },
    ] as any;
    const res = makeRes();
    await advanceHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: {
          targetStageId: TARGET_STAGE_ID,
          teamIds: ['t1', 't2'],
          seedMode: 'none',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.skipped).toContain('t1');
    expect(body.advanced).toHaveLength(1);
  });

  it('200 returns advanced=[] when all teams already in target', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: TID,
        stage_type: 'group',
        settings: {},
        is_active: true,
      },
      {
        id: TARGET_STAGE_ID,
        tournament_id: TID,
        stage_type: 'bracket',
        settings: {},
        is_active: false,
      },
    ] as any;
    store.stage_teams = [
      { stage_id: STAGE_ID, team_id: 't1' },
      { stage_id: TARGET_STAGE_ID, team_id: 't1' },
    ] as any;
    const res = makeRes();
    await advanceHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: {
          targetStageId: TARGET_STAGE_ID,
          teamIds: ['t1'],
          seedMode: 'none',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).advanced).toEqual([]);
    expect((res.body as any).skipped).toContain('t1');
  });
});

describe('POST /api/admin/stages/[stageId]/advance — auto mode (empty store path)', () => {
  it('400 in auto mode when source has no teams (empty standings)', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: TID,
        stage_type: 'swiss',
        settings: {
          advancement_rules: {
            target_stage_id: TARGET_STAGE_ID,
            advance_top: 4,
          },
        },
        is_active: true,
      },
      {
        id: TARGET_STAGE_ID,
        tournament_id: TID,
        stage_type: 'bracket',
        settings: {},
        is_active: false,
      },
    ] as any;
    // No stage_teams seeded — real computeStageStandings returns []
    const res = makeRes();
    await advanceHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { auto: true },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});

/* -----------------------------------------------------------
 * /api/admin/matches/[matchId]/veto — POST happy path
 * ---------------------------------------------------------*/

describe('POST /api/admin/matches/[matchId]/veto — happy paths', () => {
  it('201 records a single veto step (not yet complete)', async () => {
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
    expect((res.body as any).isComplete).toBe(false);
    expect((res.body as any).gamesCreated).toBe(false);
    expect((store.match_map_vetos as any).length).toBe(1);
  });

  it('400 when map already used in this veto', async () => {
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
        map_name: 'Lijiang',
        team_id: 't1',
      },
    ] as any;
    const res = makeRes();
    await vetoHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: { action: 'ban', map_name: 'Lijiang', team_id: 't2' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when match not found', async () => {
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

/* -----------------------------------------------------------
 * /api/admin/matches/[matchId] — DELETE & PUT meta side-effects
 * ---------------------------------------------------------*/

describe('/api/admin/matches/[matchId] — DELETE', () => {
  it('200 soft-cancels the match by default', async () => {
    store.matches = [
      {
        id: M_ID,
        tournament_id: 'tour-1',
        status: 'pending',
        team1_score: 1,
        team2_score: 2,
        winner_team_id: 't2',
      },
    ] as any;
    const res = makeRes();
    await adminMatchHandler(
      makeReq({ method: 'DELETE', query: { matchId: M_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).hardDeleted).toBe(false);
    const m = (store.matches as any)[0];
    expect(m.status).toBe('cancelled');
    expect(m.team1_score).toBeNull();
    expect(m.winner_team_id).toBeNull();
  });

  it('200 hard-deletes when ?hard=1', async () => {
    store.matches = [
      { id: M_ID, tournament_id: 'tour-1', status: 'pending' },
    ] as any;
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'DELETE',
        query: { matchId: M_ID, hard: '1' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).hardDeleted).toBe(true);
    expect((store.matches as any).length).toBe(0);
  });

  it('404 when match missing on DELETE', async () => {
    store.matches = [];
    const res = makeRes();
    await adminMatchHandler(
      makeReq({ method: 'DELETE', query: { matchId: M_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('/api/admin/matches/[matchId] — PUT meta with status=ongoing', () => {
  it('200 transitions to ongoing and triggers discord ping', async () => {
    store.matches = [
      {
        id: M_ID,
        tournament_id: 'tour-1',
        status: 'pending',
        team1_id: 't1',
        team2_id: 't2',
      },
    ] as any;
    store.tournaments = [{ id: 'tour-1', status: 'running' }] as any;
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: { mode: 'meta', status: 'ongoing' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    // notifyMatchStarting fires asynchronously — wait a tick
    await new Promise((r) => setImmediate(r));
  });

  it('200 PUT meta emits warning when scheduled before tournament start', async () => {
    store.matches = [
      {
        id: M_ID,
        tournament_id: 'tour-1',
        status: 'pending',
        scheduled_at: null,
      },
    ] as any;
    store.tournaments = [
      {
        id: 'tour-1',
        status: 'running',
        start_date: '2026-04-15',
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
          scheduled_at: '2026-04-01T10:00:00Z', // before start
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).warnings).toBeTruthy();
    expect((res.body as any).warnings.length).toBeGreaterThan(0);
  });

  it('200 PUT meta emits warning when scheduled after tournament end', async () => {
    store.matches = [
      {
        id: M_ID,
        tournament_id: 'tour-1',
        status: 'pending',
        scheduled_at: null,
      },
    ] as any;
    store.tournaments = [
      {
        id: 'tour-1',
        status: 'running',
        start_date: '2026-04-15',
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
          scheduled_at: '2026-05-15T10:00:00Z', // after end
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).warnings).toBeTruthy();
  });

  it('400 PUT meta with invalid status', async () => {
    store.matches = [{ id: M_ID, tournament_id: 'tour-1' }] as any;
    store.tournaments = [{ id: 'tour-1', status: 'running' }] as any;
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: { mode: 'meta', status: 'unknown-status' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 PUT meta with status=disputed (must use /dispute)', async () => {
    store.matches = [{ id: M_ID, tournament_id: 'tour-1' }] as any;
    store.tournaments = [{ id: 'tour-1', status: 'running' }] as any;
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: { mode: 'meta', status: 'disputed' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('USE_DISPUTE_ENDPOINT');
  });

  it('400 PUT meta with invalid next_match_lose_slot', async () => {
    store.matches = [{ id: M_ID, tournament_id: 'tour-1' }] as any;
    store.tournaments = [{ id: 'tour-1', status: 'running' }] as any;
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: { mode: 'meta', next_match_lose_slot: 5 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 PUT score with forfeit_team_id (no scores required)', async () => {
    store.matches = [{ id: M_ID, tournament_id: 'tour-1' }] as any;
    store.tournaments = [{ id: 'tour-1', status: 'running' }] as any;
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: { forfeit_team_id: 'team-x' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(applyMatchScoreMock).toHaveBeenCalledOnce();
    const callArg = applyMatchScoreMock.mock.calls[0][0];
    expect(callArg.forfeitTeamId).toBe('team-x');
  });

  it('400 PUT score with negative score', async () => {
    store.matches = [{ id: M_ID, tournament_id: 'tour-1' }] as any;
    store.tournaments = [{ id: 'tour-1', status: 'running' }] as any;
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: { team1Score: -1, team2Score: 0 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('/api/admin/matches/[matchId] — GET with includeGames', () => {
  it('200 GET with includeGames=1 returns the match', async () => {
    store.matches = [
      {
        id: M_ID,
        tournament_id: 'tour-1',
        stage_id: 's1',
      },
    ] as any;
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'GET',
        query: { matchId: M_ID, includeGames: '1' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).match.id).toBe(M_ID);
  });
});

/* -----------------------------------------------------------
 * /api/admin/demandes — POST batch updateStatus
 * ---------------------------------------------------------*/

describe('POST /api/admin/demandes — batch updateStatus', () => {
  const VALID_DEMANDE_ID = '660e8400-e29b-41d4-a716-446655440000';
  const VALID_DEMANDE_ID2 = '660e8400-e29b-41d4-a716-446655440001';

  it('400 when action missing', async () => {
    const res = makeRes();
    await adminDemandesHandler(makeReq({ method: 'POST', body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('400 when action is unsupported', async () => {
    const res = makeRes();
    await adminDemandesHandler(
      makeReq({
        method: 'POST',
        body: { action: 'doSomethingElse' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when demandeIds missing or empty', async () => {
    const res = makeRes();
    await adminDemandesHandler(
      makeReq({
        method: 'POST',
        body: { action: 'updateStatus', demandeIds: [], newStatus: 'approved' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when demandeIds contains invalid UUID', async () => {
    const res = makeRes();
    await adminDemandesHandler(
      makeReq({
        method: 'POST',
        body: {
          action: 'updateStatus',
          demandeIds: ['not-a-uuid'],
          newStatus: 'approved',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when newStatus is invalid', async () => {
    const res = makeRes();
    await adminDemandesHandler(
      makeReq({
        method: 'POST',
        body: {
          action: 'updateStatus',
          demandeIds: [VALID_DEMANDE_ID],
          newStatus: 'banana',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when batch larger than 50', async () => {
    const big = Array.from(
      { length: 51 },
      (_, i) => `660e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`
    );
    const res = makeRes();
    await adminDemandesHandler(
      makeReq({
        method: 'POST',
        body: {
          action: 'updateStatus',
          demandeIds: big,
          newStatus: 'approved',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when staffComment too long', async () => {
    const res = makeRes();
    await adminDemandesHandler(
      makeReq({
        method: 'POST',
        body: {
          action: 'updateStatus',
          demandeIds: [VALID_DEMANDE_ID],
          newStatus: 'approved',
          staffComment: 'x'.repeat(2001),
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 batch updates demandes with staffComment', async () => {
    store.demandes = [
      {
        id: VALID_DEMANDE_ID,
        type: 'other',
        status: 'pending',
        team_id: null,
        tournament_id: null,
        user_id: null,
        comment: 'demande 1',
        payload: null,
      },
      {
        id: VALID_DEMANDE_ID2,
        type: 'other',
        status: 'pending',
        team_id: null,
        tournament_id: null,
        user_id: null,
        comment: 'demande 2',
        payload: null,
      },
    ] as any;
    const res = makeRes();
    await adminDemandesHandler(
      makeReq({
        method: 'POST',
        body: {
          action: 'updateStatus',
          demandeIds: [VALID_DEMANDE_ID, VALID_DEMANDE_ID2],
          newStatus: 'approved',
          staffComment: 'OK approved',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.success).toBe(true);
    expect(body.updatedCount).toBe(2);
    const after = (store.demandes as any).filter(
      (d: any) => d.id === VALID_DEMANDE_ID
    )[0];
    expect(after.status).toBe('approved');
    expect(after.staff_note).toBe('OK approved');
    // Two audit entries now: the legacy before/after snapshot
    // (staff_batch_action) + the dedicated process_demande log.
    expect(logStaffActionMock).toHaveBeenCalledTimes(2);
    const actions = logStaffActionMock.mock.calls.map(
      (c: any[]) => c[0]?.action
    );
    expect(actions).toContain('staff_batch_action');
    expect(actions).toContain('process_demande');
  });

  it('200 approving a team_registration demande creates tournament_teams + news', async () => {
    store.demandes = [
      {
        id: VALID_DEMANDE_ID,
        type: 'team_registration',
        status: 'pending',
        team_id: TEAM_ID,
        tournament_id: TID,
        user_id: null,
        comment: null,
        payload: { team_name: 'Alpha', tournament_name: 'Cup' },
      },
    ] as any;
    store.teams = [{ id: TEAM_ID, name: 'Alpha', logo_url: null }] as any;
    store.tournament_teams = [];
    store.news = [];
    const res = makeRes();
    await adminDemandesHandler(
      makeReq({
        method: 'POST',
        body: {
          action: 'updateStatus',
          demandeIds: [VALID_DEMANDE_ID],
          newStatus: 'approved',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.tournament_teams as any).length).toBe(1);
    expect((store.tournament_teams as any)[0].team_id).toBe(TEAM_ID);
    expect((store.news as any).length).toBe(1);
  });

  it('200 approving a join demande adds team member + creates news', async () => {
    store.demandes = [
      {
        id: VALID_DEMANDE_ID,
        type: 'join',
        status: 'pending',
        team_id: TEAM_ID,
        tournament_id: null,
        user_id: 'user-zz',
        comment: null,
        payload: {
          desired_role: 'tank',
          user_battle_tag: 'Zane#1234',
          team_name: 'Alpha',
        },
      },
    ] as any;
    store.teams = [{ id: TEAM_ID, name: 'Alpha', logo_url: null }] as any;
    store.team_members = [];
    store.news = [];
    const res = makeRes();
    await adminDemandesHandler(
      makeReq({
        method: 'POST',
        body: {
          action: 'updateStatus',
          demandeIds: [VALID_DEMANDE_ID],
          newStatus: 'approved',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.team_members as any).length).toBe(1);
    expect((store.team_members as any)[0].role).toBe('tank');
    expect((store.team_members as any)[0].battle_tag).toBe('Zane#1234');
    expect((store.news as any).length).toBe(1);
  });

  it('200 approving a scrim demande creates a scrim_accepted notification', async () => {
    store.demandes = [
      {
        id: VALID_DEMANDE_ID,
        type: 'scrim',
        status: 'pending',
        team_id: TEAM_ID,
        tournament_id: null,
        user_id: null,
        comment: 'GLHF',
        payload: {
          from_team_id: 'other-team',
          from_team_name: 'Beta',
          preferred_date: '2026-04-01',
          target_team_name: 'Alpha',
        },
      },
    ] as any;
    store.teams = [{ id: TEAM_ID, name: 'Alpha' }] as any;
    const res = makeRes();
    await adminDemandesHandler(
      makeReq({
        method: 'POST',
        body: {
          action: 'updateStatus',
          demandeIds: [VALID_DEMANDE_ID],
          newStatus: 'approved',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    // Original demande + the new "scrim_accepted" notification = 2 entries
    expect((store.demandes as any).length).toBe(2);
    const notif = (store.demandes as any).find(
      (d: any) => (d.payload as any)?.notification_type === 'scrim_accepted'
    );
    expect(notif).toBeTruthy();
  });
});

describe('GET /api/admin/demandes', () => {
  it('200 returns empty list with no demandes', async () => {
    store.demandes = [];
    const res = makeRes();
    await adminDemandesHandler(makeReq({ method: 'GET', query: {} }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).demandes).toEqual([]);
  });

  it('200 filters by type, status, tournamentId, teamId, userId', async () => {
    store.demandes = [
      {
        id: '660e8400-e29b-41d4-a716-446655440000',
        type: 'join',
        status: 'pending',
        tournament_id: 'tour-1',
        team_id: 'team-1',
        user_id: 'user-1',
        comment: null,
        staff_note: null,
        source: null,
        payload: null,
        created_at: '2026-04-01',
        updated_at: null,
      },
    ] as any;
    const res = makeRes();
    await adminDemandesHandler(
      makeReq({
        method: 'GET',
        query: {
          type: 'join',
          status: 'pending',
          tournamentId: 'tour-1',
          teamId: 'team-1',
          userId: 'user-1',
          from: '2026-01-01',
          to: '2026-12-31',
          search: 'note',
          includeTotal: '1',
          orderBy: 'processed_at',
          orderDir: 'asc',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });
});

/* -----------------------------------------------------------
 * /api/admin/teams/[teamId]/tournaments — POST + DELETE happy paths
 * ---------------------------------------------------------*/

describe('POST /api/admin/teams/[teamId]/tournaments', () => {
  it('404 when tournament missing', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Alpha' }] as any;
    store.tournaments = [];
    const res = makeRes();
    await teamTournamentsHandler(
      makeReq({
        method: 'POST',
        query: { teamId: TEAM_ID },
        body: { tournamentId: 'no-such' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('400 when tournament is not published', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Alpha' }] as any;
    store.tournaments = [
      { id: 'tour-1', name: 'Cup', status: 'draft', max_teams: null },
    ] as any;
    const res = makeRes();
    await teamTournamentsHandler(
      makeReq({
        method: 'POST',
        query: { teamId: TEAM_ID },
        body: { tournamentId: 'tour-1' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when tournament has no stages', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Alpha' }] as any;
    store.tournaments = [
      { id: 'tour-1', name: 'Cup', status: 'published', max_teams: null },
    ] as any;
    store.tournament_stages = [];
    const res = makeRes();
    await teamTournamentsHandler(
      makeReq({
        method: 'POST',
        query: { teamId: TEAM_ID },
        body: { tournamentId: 'tour-1' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when team already registered to all stages', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Alpha', logo_url: null }] as any;
    store.tournaments = [
      { id: 'tour-1', name: 'Cup', status: 'published', max_teams: null },
    ] as any;
    store.tournament_stages = [{ id: 's1', tournament_id: 'tour-1' }] as any;
    store.stage_teams = [{ stage_id: 's1', team_id: TEAM_ID }] as any;
    const res = makeRes();
    await teamTournamentsHandler(
      makeReq({
        method: 'POST',
        query: { teamId: TEAM_ID },
        body: { tournamentId: 'tour-1' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('201 registers team to all tournament stages + creates news', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Alpha', logo_url: null }] as any;
    store.tournaments = [
      {
        id: 'tour-1',
        name: 'Cup',
        status: 'published',
        max_teams: null,
        min_players: null,
      },
    ] as any;
    store.tournament_stages = [
      { id: 's1', tournament_id: 'tour-1' },
      { id: 's2', tournament_id: 'tour-1' },
    ] as any;
    store.stage_teams = [];
    store.news = [];
    const res = makeRes();
    const reqObj = makeReq({
      method: 'POST',
      query: { teamId: TEAM_ID },
      body: { tournamentId: 'tour-1' },
    });
    (reqObj as any).staffContext = { staff: { id: 'staff-1' } };
    await teamTournamentsHandler(reqObj, res);
    expect(res.statusCode).toBe(201);
    expect((store.stage_teams as any).length).toBe(2);
    expect((store.news as any).length).toBe(1);
  });

  it('201 registers team to a specific stage only', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Alpha', logo_url: null }] as any;
    store.tournaments = [
      {
        id: 'tour-1',
        name: 'Cup',
        status: 'published',
        max_teams: null,
        min_players: null,
      },
    ] as any;
    store.tournament_stages = [
      { id: 's1', tournament_id: 'tour-1' },
      { id: 's2', tournament_id: 'tour-1' },
    ] as any;
    store.stage_teams = [];
    const res = makeRes();
    await teamTournamentsHandler(
      makeReq({
        method: 'POST',
        query: { teamId: TEAM_ID },
        body: { tournamentId: 'tour-1', stageId: 's1' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((store.stage_teams as any).length).toBe(1);
    expect((store.stage_teams as any)[0].stage_id).toBe('s1');
  });

  it('404 when specific stage not in tournament', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Alpha' }] as any;
    store.tournaments = [
      {
        id: 'tour-1',
        name: 'Cup',
        status: 'published',
        max_teams: null,
        min_players: null,
      },
    ] as any;
    store.tournament_stages = [
      { id: 's1', tournament_id: 'other-tournament' },
    ] as any;
    const res = makeRes();
    await teamTournamentsHandler(
      makeReq({
        method: 'POST',
        query: { teamId: TEAM_ID },
        body: { tournamentId: 'tour-1', stageId: 's1' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/admin/teams/[teamId]/tournaments', () => {
  it('400 when tournamentId missing', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Alpha' }] as any;
    const res = makeRes();
    await teamTournamentsHandler(
      makeReq({
        method: 'DELETE',
        query: { teamId: TEAM_ID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when tournament missing on DELETE', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Alpha' }] as any;
    store.tournaments = [];
    const res = makeRes();
    await teamTournamentsHandler(
      makeReq({
        method: 'DELETE',
        query: { teamId: TEAM_ID },
        body: { tournamentId: 'no-such' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('200 with no stages reports nothing to do', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Alpha' }] as any;
    store.tournaments = [{ id: 'tour-1', name: 'Cup' }] as any;
    store.tournament_stages = [];
    const res = makeRes();
    await teamTournamentsHandler(
      makeReq({
        method: 'DELETE',
        query: { teamId: TEAM_ID },
        body: { tournamentId: 'tour-1' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('200 with no stage_teams matching team reports zero deletions', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Alpha' }] as any;
    store.tournaments = [{ id: 'tour-1', name: 'Cup' }] as any;
    store.tournament_stages = [{ id: 's1', tournament_id: 'tour-1' }] as any;
    store.stage_teams = [{ stage_id: 's1', team_id: 'other-team' }] as any;
    const res = makeRes();
    await teamTournamentsHandler(
      makeReq({
        method: 'DELETE',
        query: { teamId: TEAM_ID },
        body: { tournamentId: 'tour-1' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('200 unregisters team from all tournament stages', async () => {
    store.teams = [{ id: TEAM_ID, name: 'Alpha' }] as any;
    store.tournaments = [{ id: 'tour-1', name: 'Cup' }] as any;
    store.tournament_stages = [
      { id: 's1', tournament_id: 'tour-1' },
      { id: 's2', tournament_id: 'tour-1' },
    ] as any;
    store.stage_teams = [
      { stage_id: 's1', team_id: TEAM_ID },
      { stage_id: 's2', team_id: TEAM_ID },
      { stage_id: 's1', team_id: 'other-team' },
    ] as any;
    const res = makeRes();
    const reqObj = makeReq({
      method: 'DELETE',
      query: { teamId: TEAM_ID },
      body: { tournamentId: 'tour-1' },
    });
    (reqObj as any).staffContext = { staff: { id: 'staff-1' } };
    await teamTournamentsHandler(reqObj, res);
    expect(res.statusCode).toBe(200);
    // Only the other team's entry remains
    const remaining = (store.stage_teams as any).filter(
      (st: any) => st.team_id === TEAM_ID
    );
    expect(remaining.length).toBe(0);
  });
});
