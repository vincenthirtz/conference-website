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

const { logStaffActionMock, applyMatchScoreMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
  applyMatchScoreMock: vi.fn(async (input: any) => ({
    matchId: input.matchId,
    updated: true,
    match: { id: input.matchId, status: input.status ?? 'finished' },
    winnerTeamId: 'team-a',
  })),
}));

vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));
vi.mock('@/utils/matches/applyScore', () => ({
  applyMatchScore: applyMatchScoreMock,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import adminStageHandler from '../../pages/api/admin/stages/[stageId]';
import disputeHandler from '../../pages/api/admin/matches/[matchId]/dispute';

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

const STAGE_ID = '550e8400-e29b-41d4-a716-446655440000';
const M_ID = '550e8400-e29b-41d4-a716-446655440001';

/* -----------------------------------------------------------
 * /api/admin/stages/[stageId]
 * ---------------------------------------------------------*/

describe('/api/admin/stages/[stageId]', () => {
  it('400 on invalid stageId', async () => {
    const res = makeRes();
    await adminStageHandler(
      makeReq({ method: 'GET', query: { stageId: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 404 when stage missing', async () => {
    store.tournament_stages = [];
    const res = makeRes();
    await adminStageHandler(
      makeReq({ method: 'GET', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('GET 200 returns the stage', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: 'tour-1',
        name: 'Group A',
        stage_type: 'group',
      },
    ] as any;
    const res = makeRes();
    await adminStageHandler(
      makeReq({ method: 'GET', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).stage.id).toBe(STAGE_ID);
  });

  it('PUT 400 when no valid fields', async () => {
    store.tournament_stages = [{ id: STAGE_ID, name: 'A' }] as any;
    const res = makeRes();
    await adminStageHandler(
      makeReq({
        method: 'PUT',
        query: { stageId: STAGE_ID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 400 when name empty', async () => {
    store.tournament_stages = [{ id: STAGE_ID, name: 'A' }] as any;
    const res = makeRes();
    await adminStageHandler(
      makeReq({
        method: 'PUT',
        query: { stageId: STAGE_ID },
        body: { name: '   ' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 400 with negative order_index', async () => {
    store.tournament_stages = [{ id: STAGE_ID, name: 'A' }] as any;
    const res = makeRes();
    await adminStageHandler(
      makeReq({
        method: 'PUT',
        query: { stageId: STAGE_ID },
        body: { order_index: -1 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 400 with invalid stage_type', async () => {
    store.tournament_stages = [{ id: STAGE_ID, name: 'A' }] as any;
    const res = makeRes();
    await adminStageHandler(
      makeReq({
        method: 'PUT',
        query: { stageId: STAGE_ID },
        body: { stage_type: 'bogus' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 400 with invalid start_date', async () => {
    store.tournament_stages = [{ id: STAGE_ID, name: 'A' }] as any;
    const res = makeRes();
    await adminStageHandler(
      makeReq({
        method: 'PUT',
        query: { stageId: STAGE_ID },
        body: { start_date: 'not-a-date' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 400 when start_date >= end_date', async () => {
    store.tournament_stages = [{ id: STAGE_ID, name: 'A' }] as any;
    const res = makeRes();
    await adminStageHandler(
      makeReq({
        method: 'PUT',
        query: { stageId: STAGE_ID },
        body: {
          start_date: '2026-05-01',
          end_date: '2026-04-01',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 200 updates the stage', async () => {
    store.tournament_stages = [
      {
        id: STAGE_ID,
        tournament_id: 'tour-1',
        name: 'Old',
        stage_type: 'group',
      },
    ] as any;
    const res = makeRes();
    await adminStageHandler(
      makeReq({
        method: 'PUT',
        query: { stageId: STAGE_ID },
        body: { name: 'New', is_active: true, order_index: 2 },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.tournament_stages[0] as any).name).toBe('New');
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('DELETE soft 200 deactivates', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: 'tour-1', is_active: true, is_public: true, name: 'A' },
    ] as any;
    const res = makeRes();
    await adminStageHandler(
      makeReq({ method: 'DELETE', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.tournament_stages[0] as any).is_active).toBe(false);
    expect((store.tournament_stages[0] as any).is_public).toBe(false);
  });

  it('DELETE ?hard=1 removes the stage', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: 'tour-1', name: 'A' },
    ] as any;
    const res = makeRes();
    await adminStageHandler(
      makeReq({
        method: 'DELETE',
        query: { stageId: STAGE_ID, hard: '1' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.tournament_stages.length).toBe(0);
  });

  it('DELETE 404 when missing', async () => {
    store.tournament_stages = [];
    const res = makeRes();
    await adminStageHandler(
      makeReq({ method: 'DELETE', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await adminStageHandler(
      makeReq({ method: 'POST', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/admin/matches/[matchId]/dispute
 * ---------------------------------------------------------*/

describe('/api/admin/matches/[matchId]/dispute', () => {
  it('400 on invalid matchId', async () => {
    const res = makeRes();
    await disputeHandler(
      makeReq({ method: 'POST', query: { matchId: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when reason missing', async () => {
    const res = makeRes();
    await disputeHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when reason too long', async () => {
    const res = makeRes();
    await disputeHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: { reason: 'x'.repeat(2001) },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 404 when match missing', async () => {
    store.matches = [];
    const res = makeRes();
    await disputeHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: { reason: 'x' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('POST 409 when already disputed', async () => {
    store.matches = [
      { id: M_ID, status: 'disputed', tournament_id: 'tour-1' },
    ] as any;
    const res = makeRes();
    await disputeHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: { reason: 'New' },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
  });

  it('POST 400 when match is cancelled', async () => {
    store.matches = [
      { id: M_ID, status: 'cancelled', tournament_id: 'tour-1' },
    ] as any;
    const res = makeRes();
    await disputeHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: { reason: 'r' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 200 opens dispute and stores reason', async () => {
    store.matches = [
      { id: M_ID, status: 'pending', tournament_id: 'tour-1' },
    ] as any;
    const res = makeRes();
    await disputeHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: { reason: 'Something happened' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const m = store.matches[0] as any;
    expect(m.status).toBe('disputed');
    expect(m.dispute_reason).toBe('Something happened');
    expect(m.dispute_opened_at).toBeTruthy();
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('PATCH 400 when resolution missing', async () => {
    store.matches = [
      { id: M_ID, status: 'disputed', tournament_id: 'tour-1' },
    ] as any;
    const res = makeRes();
    await disputeHandler(
      makeReq({
        method: 'PATCH',
        query: { matchId: M_ID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 409 when match not disputed', async () => {
    store.matches = [
      { id: M_ID, status: 'pending', tournament_id: 'tour-1' },
    ] as any;
    const res = makeRes();
    await disputeHandler(
      makeReq({
        method: 'PATCH',
        query: { matchId: M_ID },
        body: { resolution: 'r' },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
  });

  it('PATCH 400 with invalid resumeStatus', async () => {
    store.matches = [
      { id: M_ID, status: 'disputed', tournament_id: 'tour-1' },
    ] as any;
    const res = makeRes();
    await disputeHandler(
      makeReq({
        method: 'PATCH',
        query: { matchId: M_ID },
        body: { resolution: 'r', resumeStatus: 'bogus' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 200 simple resolution (no score change)', async () => {
    store.matches = [
      {
        id: M_ID,
        status: 'disputed',
        tournament_id: 'tour-1',
        team1_id: 't1',
        team2_id: 't2',
      },
    ] as any;
    const res = makeRes();
    await disputeHandler(
      makeReq({
        method: 'PATCH',
        query: { matchId: M_ID },
        body: { resolution: 'No-fault', resumeStatus: 'pending' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const m = store.matches[0] as any;
    expect(m.status).toBe('pending');
    expect(m.dispute_resolution).toBe('No-fault');
  });

  it('PATCH 200 with score override delegates to applyMatchScore', async () => {
    store.matches = [
      {
        id: M_ID,
        status: 'disputed',
        tournament_id: 'tour-1',
        team1_id: 't1',
        team2_id: 't2',
      },
    ] as any;
    const res = makeRes();
    await disputeHandler(
      makeReq({
        method: 'PATCH',
        query: { matchId: M_ID },
        body: {
          resolution: 'Reset score',
          resumeStatus: 'finished',
          team1Score: 2,
          team2Score: 1,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(applyMatchScoreMock).toHaveBeenCalledOnce();
  });

  it('DELETE 409 when match not disputed', async () => {
    store.matches = [
      { id: M_ID, status: 'pending', tournament_id: 'tour-1' },
    ] as any;
    const res = makeRes();
    await disputeHandler(
      makeReq({ method: 'DELETE', query: { matchId: M_ID } }),
      res
    );
    expect(res.statusCode).toBe(409);
  });

  it('DELETE 200 cancels the dispute', async () => {
    store.matches = [
      {
        id: M_ID,
        status: 'disputed',
        tournament_id: 'tour-1',
        dispute_reason: 'x',
      },
    ] as any;
    const res = makeRes();
    await disputeHandler(
      makeReq({
        method: 'DELETE',
        query: { matchId: M_ID, resumeStatus: 'pending' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const m = store.matches[0] as any;
    expect(m.status).toBe('pending');
    expect(m.dispute_reason).toBeNull();
  });

  it('DELETE 400 with invalid resumeStatus', async () => {
    store.matches = [
      { id: M_ID, status: 'disputed', tournament_id: 'tour-1' },
    ] as any;
    const res = makeRes();
    await disputeHandler(
      makeReq({
        method: 'DELETE',
        query: { matchId: M_ID, resumeStatus: 'bogus' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 405 on GET', async () => {
    const res = makeRes();
    await disputeHandler(
      makeReq({ method: 'GET', query: { matchId: M_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});
