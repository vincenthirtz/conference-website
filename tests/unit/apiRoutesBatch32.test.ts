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
vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import bulkMatchesHandler from '../../pages/api/admin/stages/[stageId]/bulk-matches';

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

/* -----------------------------------------------------------
 * /api/admin/stages/[stageId]/bulk-matches
 * ---------------------------------------------------------*/

describe('/api/admin/stages/[stageId]/bulk-matches', () => {
  it('400 on invalid stageId', async () => {
    const res = makeRes();
    await bulkMatchesHandler(
      makeReq({ method: 'PATCH', query: { stageId: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when stage missing', async () => {
    store.tournament_stages = [];
    const res = makeRes();
    await bulkMatchesHandler(
      makeReq({ method: 'PATCH', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('PATCH 400 when schedules empty', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: 'tour-1' },
    ] as any;
    const res = makeRes();
    await bulkMatchesHandler(
      makeReq({
        method: 'PATCH',
        query: { stageId: STAGE_ID },
        body: { schedules: [] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 200 schedules matches and returns undo payload', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: 'tour-1' },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        stage_id: STAGE_ID,
        scheduled_at: '2026-04-01T10:00:00Z',
      },
      {
        id: 'm2',
        stage_id: STAGE_ID,
        scheduled_at: null,
      },
    ] as any;
    const res = makeRes();
    await bulkMatchesHandler(
      makeReq({
        method: 'PATCH',
        query: { stageId: STAGE_ID },
        body: {
          schedules: [
            { matchId: 'm1', scheduled_at: '2026-04-02T10:00:00Z' },
            { matchId: 'm2', scheduled_at: '2026-04-03T10:00:00Z' },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.successCount).toBe(2);
    expect(body.undoPayload.snapshots).toHaveLength(2);
    expect((store.matches[0] as any).scheduled_at).toBe('2026-04-02T10:00:00Z');
  });

  it('PUT 400 when matchIds empty', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: 'tour-1' },
    ] as any;
    const res = makeRes();
    await bulkMatchesHandler(
      makeReq({
        method: 'PUT',
        query: { stageId: STAGE_ID },
        body: { matchIds: [], fields: { status: 'finished' } },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 400 when fields object missing or empty', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: 'tour-1' },
    ] as any;
    const res = makeRes();
    await bulkMatchesHandler(
      makeReq({
        method: 'PUT',
        query: { stageId: STAGE_ID },
        body: { matchIds: ['m1'], fields: {} },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 400 with invalid status', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: 'tour-1' },
    ] as any;
    const res = makeRes();
    await bulkMatchesHandler(
      makeReq({
        method: 'PUT',
        query: { stageId: STAGE_ID },
        body: { matchIds: ['m1'], fields: { status: 'bogus' } },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 400 with invalid best_of', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: 'tour-1' },
    ] as any;
    const res = makeRes();
    await bulkMatchesHandler(
      makeReq({
        method: 'PUT',
        query: { stageId: STAGE_ID },
        body: { matchIds: ['m1'], fields: { best_of: 16 } },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT 200 updates matches in bulk', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: 'tour-1' },
    ] as any;
    store.matches = [
      { id: 'm1', stage_id: STAGE_ID, status: 'pending', notes: null },
      { id: 'm2', stage_id: STAGE_ID, status: 'pending', notes: null },
    ] as any;
    const res = makeRes();
    await bulkMatchesHandler(
      makeReq({
        method: 'PUT',
        query: { stageId: STAGE_ID },
        body: {
          matchIds: ['m1', 'm2'],
          fields: { status: 'postponed', notes: 'Delayed' },
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.matches[0] as any).status).toBe('postponed');
    expect((store.matches[0] as any).notes).toBe('Delayed');
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('DELETE 400 when matchIds empty', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: 'tour-1' },
    ] as any;
    const res = makeRes();
    await bulkMatchesHandler(
      makeReq({
        method: 'DELETE',
        query: { stageId: STAGE_ID },
        body: { matchIds: [] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('DELETE soft cancels matches and returns undo', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: 'tour-1' },
    ] as any;
    store.matches = [
      {
        id: 'm1',
        stage_id: STAGE_ID,
        status: 'finished',
        team1_score: 2,
        team2_score: 1,
        winner_team_id: 't1',
      },
    ] as any;
    const res = makeRes();
    await bulkMatchesHandler(
      makeReq({
        method: 'DELETE',
        query: { stageId: STAGE_ID },
        body: { matchIds: ['m1'] },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.undoPayload).toBeTruthy();
    expect(body.undoPayload.type).toBe('bulk_cancel');
  });

  it('DELETE hard removes matches', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: 'tour-1' },
    ] as any;
    store.matches = [
      { id: 'm1', stage_id: STAGE_ID, status: 'pending' },
      { id: 'm2', stage_id: STAGE_ID, status: 'pending' },
    ] as any;
    const res = makeRes();
    await bulkMatchesHandler(
      makeReq({
        method: 'DELETE',
        query: { stageId: STAGE_ID },
        body: { matchIds: ['m1', 'm2'], hard: true },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.matches.length).toBe(0);
  });

  it('returns 405 on GET', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: 'tour-1' },
    ] as any;
    const res = makeRes();
    await bulkMatchesHandler(
      makeReq({ method: 'GET', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});
