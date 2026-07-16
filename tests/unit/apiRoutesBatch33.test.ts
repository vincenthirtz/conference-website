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

import bulkTournamentMatchesHandler from '../../pages/api/admin/tournament/[id]/bulk-matches';

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
const STAGE_ID = '550e8400-e29b-41d4-a716-446655440001';
const STAGE_ID_2 = '550e8400-e29b-41d4-a716-446655440002';

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/bulk-matches
 * ---------------------------------------------------------*/

describe('POST /api/admin/tournament/[id]/bulk-matches', () => {
  it('405 on non-POST', async () => {
    const res = makeRes();
    await bulkTournamentMatchesHandler(
      makeReq({ method: 'GET', query: { id: TID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid id', async () => {
    const res = makeRes();
    await bulkTournamentMatchesHandler(
      makeReq({
        method: 'POST',
        query: { id: 'bogus' },
        body: { mode: 'shift_round' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 with unknown mode', async () => {
    const res = makeRes();
    await bulkTournamentMatchesHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { mode: 'fly-to-mars' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('shift_round 400 with invalid stageId', async () => {
    const res = makeRes();
    await bulkTournamentMatchesHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          mode: 'shift_round',
          stageId: 'bogus',
          roundNumber: 1,
          offsetMinutes: 30,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('shift_round 400 with non-integer roundNumber', async () => {
    const res = makeRes();
    await bulkTournamentMatchesHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          mode: 'shift_round',
          stageId: STAGE_ID,
          roundNumber: 1.5,
          offsetMinutes: 30,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('shift_round 400 with offsetMinutes=0', async () => {
    const res = makeRes();
    await bulkTournamentMatchesHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          mode: 'shift_round',
          stageId: STAGE_ID,
          roundNumber: 1,
          offsetMinutes: 0,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('shift_round 404 when stage not in tournament', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: 'other-tournament' },
    ] as any;
    const res = makeRes();
    await bulkTournamentMatchesHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          mode: 'shift_round',
          stageId: STAGE_ID,
          roundNumber: 1,
          offsetMinutes: 30,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('shift_round 200 when no scheduled matches', async () => {
    store.tournament_stages = [{ id: STAGE_ID, tournament_id: TID }] as any;
    store.matches = [];
    const res = makeRes();
    await bulkTournamentMatchesHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          mode: 'shift_round',
          stageId: STAGE_ID,
          roundNumber: 1,
          offsetMinutes: 60,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).shifted).toBe(0);
  });

  it('shift_round 200 shifts scheduled matches by offset', async () => {
    store.tournament_stages = [{ id: STAGE_ID, tournament_id: TID }] as any;
    store.matches = [
      {
        id: 'm1',
        stage_id: STAGE_ID,
        round_number: 1,
        scheduled_at: '2026-04-01T10:00:00.000Z',
        status: 'pending',
      },
      {
        id: 'm2',
        stage_id: STAGE_ID,
        round_number: 1,
        scheduled_at: '2026-04-01T11:00:00.000Z',
        status: 'pending',
      },
      {
        id: 'm3-no-schedule',
        stage_id: STAGE_ID,
        round_number: 1,
        scheduled_at: null,
        status: 'pending',
      },
    ] as any;
    const res = makeRes();
    await bulkTournamentMatchesHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          mode: 'shift_round',
          stageId: STAGE_ID,
          roundNumber: 1,
          offsetMinutes: 30,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.shifted).toBe(2);
    expect(body.ignored).toBe(1);
    // First match shifted by 30 minutes
    const m1 = (store.matches as any).find((m: any) => m.id === 'm1');
    expect(m1.scheduled_at).toBe('2026-04-01T10:30:00.000Z');
  });

  it('reassign_stage 400 when targetStageId not provided', async () => {
    const res = makeRes();
    await bulkTournamentMatchesHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { mode: 'reassign_stage', matchIds: ['m1'] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('reassign_stage 400 when matchIds empty', async () => {
    const res = makeRes();
    await bulkTournamentMatchesHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: { mode: 'reassign_stage', targetStageId: STAGE_ID, matchIds: [] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('reassign_stage 404 when target stage not in tournament', async () => {
    store.tournament_stages = [
      { id: STAGE_ID_2, tournament_id: 'other' },
    ] as any;
    const res = makeRes();
    await bulkTournamentMatchesHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          mode: 'reassign_stage',
          targetStageId: STAGE_ID_2,
          matchIds: ['m1'],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('shift_round 400 with non-finite offsetMinutes', async () => {
    const res = makeRes();
    await bulkTournamentMatchesHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          mode: 'shift_round',
          stageId: STAGE_ID,
          roundNumber: 1,
          offsetMinutes: 'not-a-number',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('shift_round 400 when stageId is bogus UUID', async () => {
    const res = makeRes();
    await bulkTournamentMatchesHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          mode: 'shift_round',
          stageId: 'bogus',
          roundNumber: 1,
          offsetMinutes: 60,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('reassign_stage skips matches in wrong tournament', async () => {
    store.tournament_stages = [{ id: STAGE_ID_2, tournament_id: TID }] as any;
    store.matches = [
      {
        id: 'm-other',
        tournament_id: 'OTHER_TID',
        stage_id: STAGE_ID,
        status: 'pending',
      },
    ] as any;
    const res = makeRes();
    await bulkTournamentMatchesHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          mode: 'reassign_stage',
          targetStageId: STAGE_ID_2,
          matchIds: ['m-other', 'm-not-found'],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.skipped.length).toBe(2);
    const reasons = body.skipped.map((s: any) => s.reason);
    expect(reasons).toContain('not_found');
    expect(reasons).toContain('wrong_tournament');
  });

  it('reassign_stage skips matches already in target stage', async () => {
    store.tournament_stages = [{ id: STAGE_ID_2, tournament_id: TID }] as any;
    store.matches = [
      {
        id: 'm1',
        tournament_id: TID,
        stage_id: STAGE_ID_2,
        status: 'pending',
      },
    ] as any;
    const res = makeRes();
    await bulkTournamentMatchesHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          mode: 'reassign_stage',
          targetStageId: STAGE_ID_2,
          matchIds: ['m1'],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.skipped[0].reason).toBe('already_in_target_stage');
  });

  it('reassign_stage 200 moves valid matches and skips locked ones', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: TID },
      { id: STAGE_ID_2, tournament_id: TID },
    ] as any;
    store.matches = [
      {
        id: 'm-ok',
        tournament_id: TID,
        stage_id: STAGE_ID,
        status: 'pending',
        next_match_win_id: null,
        next_match_lose_id: null,
      },
      {
        id: 'm-disputed',
        tournament_id: TID,
        stage_id: STAGE_ID,
        status: 'disputed',
        next_match_win_id: null,
        next_match_lose_id: null,
      },
      {
        id: 'm-bracket',
        tournament_id: TID,
        stage_id: STAGE_ID,
        status: 'pending',
        next_match_win_id: 'some-other-match',
        next_match_lose_id: null,
      },
    ] as any;
    const res = makeRes();
    await bulkTournamentMatchesHandler(
      makeReq({
        method: 'POST',
        query: { id: TID },
        body: {
          mode: 'reassign_stage',
          targetStageId: STAGE_ID_2,
          matchIds: ['m-ok', 'm-disputed', 'm-bracket'],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.moved).toContain('m-ok');
    expect(body.skipped.length).toBeGreaterThanOrEqual(2);
    const ok = (store.matches as any).find((m: any) => m.id === 'm-ok');
    expect(ok.stage_id).toBe(STAGE_ID_2);
  });
});
