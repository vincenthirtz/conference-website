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

const { applyMatchScoreMock, logStaffActionMock } = vi.hoisted(() => ({
  applyMatchScoreMock: vi.fn(async (input: any) => ({
    matchId: input.matchId,
    updated: true,
    match: {},
    winnerTeamId: 'team-a',
  })),
  logStaffActionMock: vi.fn(async () => undefined),
}));

vi.mock('@/utils/matches/applyScore', () => ({
  applyMatchScore: applyMatchScoreMock,
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

import batchScoresHandler from '../../pages/api/admin/stages/[stageId]/batch-scores';
import tournamentTeamByIdHandler from '../../pages/api/admin/tournament/[id]/teams/[teamId]';
import partnershipRequestByIdHandler from '../../pages/api/admin/partnership-requests/[id]';

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
  applyMatchScoreMock.mockClear();
  logStaffActionMock.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('manager')] as any;
});

const STAGE_ID = '550e8400-e29b-41d4-a716-446655440000';
const TID = '550e8400-e29b-41d4-a716-446655440001';
const TT_ID = '550e8400-e29b-41d4-a716-446655440002';
const PR_ID = '550e8400-e29b-41d4-a716-446655440003';
const M_ID_1 = '550e8400-e29b-41d4-a716-446655440010';
const M_ID_2 = '550e8400-e29b-41d4-a716-446655440011';

/* -----------------------------------------------------------
 * /api/admin/stages/[stageId]/batch-scores
 * ---------------------------------------------------------*/

describe('POST /api/admin/stages/[stageId]/batch-scores', () => {
  it('405 on non-POST', async () => {
    const res = makeRes();
    await batchScoresHandler(
      makeReq({ method: 'GET', query: { stageId: STAGE_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid stageId', async () => {
    const res = makeRes();
    await batchScoresHandler(
      makeReq({ method: 'POST', query: { stageId: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when stage not found', async () => {
    store.tournament_stages = [];
    const res = makeRes();
    await batchScoresHandler(
      makeReq(
        {
          method: 'POST',
          query: { stageId: STAGE_ID },
          body: { scores: [] },
        }
      ),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('403 when tournament is completed', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: TID },
    ] as any;
    store.tournaments = [{ id: TID, status: 'completed' }] as any;
    const res = makeRes();
    await batchScoresHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { scores: [{ matchId: M_ID_1, team1Score: 1, team2Score: 0 }] },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('400 when scores empty', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: TID },
    ] as any;
    store.tournaments = [{ id: TID, status: 'running' }] as any;
    const res = makeRes();
    await batchScoresHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { scores: [] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when too many scores (>50)', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: TID },
    ] as any;
    store.tournaments = [{ id: TID, status: 'running' }] as any;
    const scores = Array.from({ length: 51 }, () => ({
      matchId: M_ID_1,
      team1Score: 1,
      team2Score: 0,
    }));
    const res = makeRes();
    await batchScoresHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { scores },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when a matchId is invalid', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: TID },
    ] as any;
    store.tournaments = [{ id: TID, status: 'running' }] as any;
    const res = makeRes();
    await batchScoresHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { scores: [{ matchId: 'bogus', team1Score: 1, team2Score: 0 }] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when a match does not belong to the stage', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: TID },
    ] as any;
    store.tournaments = [{ id: TID, status: 'running' }] as any;
    store.matches = [
      { id: M_ID_1, stage_id: 'other-stage' },
    ] as any;
    const res = makeRes();
    await batchScoresHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { scores: [{ matchId: M_ID_1, team1Score: 1, team2Score: 0 }] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 applies scores and reports per-match results', async () => {
    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: TID },
    ] as any;
    store.tournaments = [{ id: TID, status: 'running' }] as any;
    store.matches = [
      { id: M_ID_1, stage_id: STAGE_ID },
      { id: M_ID_2, stage_id: STAGE_ID },
    ] as any;

    const res = makeRes();
    await batchScoresHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: {
          scores: [
            { matchId: M_ID_1, team1Score: 2, team2Score: 1 },
            { matchId: M_ID_2, team1Score: 0, team2Score: 3 },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.successCount).toBe(2);
    expect(body.failureCount).toBe(0);
    expect(applyMatchScoreMock).toHaveBeenCalledTimes(2);
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('500 when all scores fail', async () => {
    applyMatchScoreMock.mockRejectedValue(new Error('boom'));

    store.tournament_stages = [
      { id: STAGE_ID, tournament_id: TID },
    ] as any;
    store.tournaments = [{ id: TID, status: 'running' }] as any;
    store.matches = [{ id: M_ID_1, stage_id: STAGE_ID }] as any;

    const res = makeRes();
    await batchScoresHandler(
      makeReq({
        method: 'POST',
        query: { stageId: STAGE_ID },
        body: { scores: [{ matchId: M_ID_1, team1Score: 1, team2Score: 0 }] },
      }),
      res
    );
    expect(res.statusCode).toBe(500);
    expect((res.body as any).failureCount).toBe(1);
  });
});

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/teams/[teamId]
 * ---------------------------------------------------------*/

describe('/api/admin/tournament/[id]/teams/[teamId]', () => {
  it('400 when ids invalid', async () => {
    const res = makeRes();
    await tournamentTeamByIdHandler(
      makeReq({
        method: 'GET',
        query: { id: 'bogus', teamId: TT_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 404 when entry missing', async () => {
    store.tournament_teams = [];
    const res = makeRes();
    await tournamentTeamByIdHandler(
      makeReq({
        method: 'GET',
        query: { id: TID, teamId: TT_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('GET 200 returns the entry', async () => {
    store.tournament_teams = [
      {
        id: TT_ID,
        tournament_id: TID,
        team_id: 't1',
        seed: 1,
        status: 'registered',
        team: { id: 't1', name: 'Alpha' },
      },
    ] as any;
    const res = makeRes();
    await tournamentTeamByIdHandler(
      makeReq({ method: 'GET', query: { id: TID, teamId: TT_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).team.team_id).toBe('t1');
  });

  it('PATCH 400 when no fields provided', async () => {
    store.tournament_teams = [
      { id: TT_ID, tournament_id: TID, team_id: 't1', seed: 1, status: 'registered', team: { id: 't1', name: 'A' } },
    ] as any;
    const res = makeRes();
    await tournamentTeamByIdHandler(
      makeReq({
        method: 'PATCH',
        query: { id: TID, teamId: TT_ID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 404 when entry not found', async () => {
    store.tournament_teams = [];
    const res = makeRes();
    await tournamentTeamByIdHandler(
      makeReq({
        method: 'PATCH',
        query: { id: TID, teamId: TT_ID },
        body: { seed: 5 },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('PATCH 200 updates seed + logs', async () => {
    store.tournament_teams = [
      {
        id: TT_ID,
        tournament_id: TID,
        team_id: 't1',
        seed: 1,
        status: 'registered',
        team: { id: 't1', name: 'Alpha' },
      },
    ] as any;
    const res = makeRes();
    await tournamentTeamByIdHandler(
      makeReq({
        method: 'PATCH',
        query: { id: TID, teamId: TT_ID },
        body: { seed: 7, status: 'check_in' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.tournament_teams[0] as any).seed).toBe(7);
    expect((store.tournament_teams[0] as any).status).toBe('check_in');
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('DELETE 404 when entry missing', async () => {
    store.tournament_teams = [];
    const res = makeRes();
    await tournamentTeamByIdHandler(
      makeReq({
        method: 'DELETE',
        query: { id: TID, teamId: TT_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('DELETE 200 removes the entry and logs', async () => {
    store.tournament_teams = [
      {
        id: TT_ID,
        tournament_id: TID,
        team_id: 't1',
        seed: 1,
        team: { id: 't1', name: 'Alpha' },
      },
    ] as any;
    const res = makeRes();
    await tournamentTeamByIdHandler(
      makeReq({
        method: 'DELETE',
        query: { id: TID, teamId: TT_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.tournament_teams.length).toBe(0);
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await tournamentTeamByIdHandler(
      makeReq({
        method: 'POST',
        query: { id: TID, teamId: TT_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/admin/partnership-requests/[id]
 * ---------------------------------------------------------*/

describe('/api/admin/partnership-requests/[id]', () => {
  beforeEach(() => {
    store.staff = [makeStaffRow('admin')] as any;
  });

  it('400 on invalid id', async () => {
    const res = makeRes();
    await partnershipRequestByIdHandler(
      makeReq({ method: 'GET', query: { id: 'bogus' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 404 when request missing', async () => {
    store.partnership_requests = [];
    const res = makeRes();
    await partnershipRequestByIdHandler(
      makeReq({ method: 'GET', query: { id: PR_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('GET 200 returns request and auto-marks new → read', async () => {
    store.partnership_requests = [
      { id: PR_ID, status: 'new', company_name: 'Acme' },
    ] as any;
    const res = makeRes();
    await partnershipRequestByIdHandler(
      makeReq({ method: 'GET', query: { id: PR_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.partnership_requests[0] as any).status).toBe('read');
    expect((store.partnership_requests[0] as any).read_at).toBeTruthy();
  });

  it('PATCH 400 with invalid status', async () => {
    store.partnership_requests = [
      { id: PR_ID, status: 'new', company_name: 'Acme' },
    ] as any;
    const res = makeRes();
    await partnershipRequestByIdHandler(
      makeReq({
        method: 'PATCH',
        query: { id: PR_ID },
        body: { status: 'unknown' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 400 when no changes', async () => {
    store.partnership_requests = [
      { id: PR_ID, status: 'new', company_name: 'Acme' },
    ] as any;
    const res = makeRes();
    await partnershipRequestByIdHandler(
      makeReq({
        method: 'PATCH',
        query: { id: PR_ID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 200 updates status to contacted and stamps timestamp', async () => {
    store.partnership_requests = [
      { id: PR_ID, status: 'read', company_name: 'Acme' },
    ] as any;
    const res = makeRes();
    await partnershipRequestByIdHandler(
      makeReq({
        method: 'PATCH',
        query: { id: PR_ID },
        body: { status: 'contacted' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const r = (store.partnership_requests as any)[0];
    expect(r.status).toBe('contacted');
    expect(r.contacted_at).toBeTruthy();
    expect(logStaffActionMock).toHaveBeenCalled();
  });

  it('PATCH 200 accepted: auto-creates a disabled partner', async () => {
    store.partnership_requests = [
      {
        id: PR_ID,
        status: 'negotiating',
        company_name: 'Acme',
        category: 'super',
        message: 'Hello',
        website: 'https://acme.com',
      },
    ] as any;
    store.partners = [];
    const res = makeRes();
    await partnershipRequestByIdHandler(
      makeReq({
        method: 'PATCH',
        query: { id: PR_ID },
        body: { status: 'accepted' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const partner = (store.partners as any)[0];
    expect(partner).toBeTruthy();
    expect(partner.name).toBe('Acme');
    expect(partner.is_active).toBe(false);
    expect(partner.category).toBe('super');
  });

  it("PATCH accepted maps category 'other' to 'cultural'", async () => {
    store.partnership_requests = [
      {
        id: PR_ID,
        status: 'new',
        company_name: 'Acme',
        category: 'other',
      },
    ] as any;
    store.partners = [];
    const res = makeRes();
    await partnershipRequestByIdHandler(
      makeReq({
        method: 'PATCH',
        query: { id: PR_ID },
        body: { status: 'accepted' },
      }),
      res
    );
    expect((store.partners as any)[0].category).toBe('cultural');
  });

  it('DELETE 404 when missing', async () => {
    store.partnership_requests = [];
    const res = makeRes();
    await partnershipRequestByIdHandler(
      makeReq({ method: 'DELETE', query: { id: PR_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('DELETE 200 removes and logs', async () => {
    store.partnership_requests = [
      { id: PR_ID, company_name: 'Acme', status: 'archived' },
    ] as any;
    const res = makeRes();
    await partnershipRequestByIdHandler(
      makeReq({ method: 'DELETE', query: { id: PR_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.partnership_requests.length).toBe(0);
    expect(logStaffActionMock).toHaveBeenCalled();
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await partnershipRequestByIdHandler(
      makeReq({ method: 'POST', query: { id: PR_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});
