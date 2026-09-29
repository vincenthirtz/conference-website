// Tests minimaux des routes staff d'un match qui n'en avaient aucun, posés à
// leur migration vers `defineAdminRoute` (features/admin/matches) :
//   GET        /api/admin/matches/[matchId]/analytics
//   GET        /api/admin/matches/[matchId]/map-pool
//   GET/POST   /api/admin/matches/[matchId]/cast-assignments
//   PATCH/DEL  /api/admin/matches/[matchId]/cast-assignments/[assignmentId]
//
// Ils verrouillent les messages d'erreur historiques, la portée tenant et le
// journal staff (slug + payload) — pas le détail des calculs, testés ailleurs.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { logStaffActionMock, emitCastEventMock, resolvePoolMock } = vi.hoisted(
  () => ({
    logStaffActionMock: vi.fn(async () => undefined),
    emitCastEventMock: vi.fn(async () => undefined),
    resolvePoolMock: vi.fn(async () => ({
      maps: [{ name: 'Ilios' }],
      source: 'tournament',
    })),
  })
);

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});
vi.mock('@/utils/staffLogs', async (orig) => ({
  ...(await orig<typeof import('@/utils/staffLogs')>()),
  logStaffAction: logStaffActionMock,
}));
vi.mock('@/utils/castEvents', () => ({ emitCastEvent: emitCastEventMock }));
vi.mock('@/utils/maps/pool', async (orig) => ({
  ...(await orig<typeof import('@/utils/maps/pool')>()),
  resolveEffectiveMapPool: resolvePoolMock,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import analyticsHandler from '../../pages/api/admin/matches/[matchId]/analytics';
import mapPoolHandler from '../../pages/api/admin/matches/[matchId]/map-pool';
import castListHandler from '../../pages/api/admin/matches/[matchId]/cast-assignments/index';
import castByIdHandler from '../../pages/api/admin/matches/[matchId]/cast-assignments/[assignmentId]';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const M_ID = '550e8400-e29b-41d4-a716-446655440001';
const M_OTHER = '550e8400-e29b-41d4-a716-446655440002';
const CAST_ID = '550e8400-e29b-41d4-a716-446655440050';
const ASSIGN_ID = '550e8400-e29b-41d4-a716-446655440060';

function makeStaffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'admin',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let tokenCounter = 0;
function makeReq(over: Partial<any> = {}): any {
  tokenCounter += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer mm-${tokenCounter}` },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const future = () => new Date(Date.now() + 3_600_000).toISOString();

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  emitCastEventMock.mockClear();
  resolvePoolMock.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow()] as any;
  store.tenants = [
    { id: TENANT_A, slug: 'alpha', name: 'Alpha', is_active: true },
    { id: TENANT_B, slug: 'beta', name: 'Beta', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: 'staff-1', role: 'admin' },
  ] as any;
  store.matches = [
    {
      id: M_ID,
      tenant_id: TENANT_A,
      tournament_id: null,
      team1_id: null,
      team2_id: null,
      status: 'pending',
      round_number: 1,
      scheduled_at: null,
    },
    { id: M_OTHER, tenant_id: TENANT_B, status: 'pending' },
  ] as any;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/admin/matches/[matchId]/analytics', () => {
  it('400 « Invalid matchId »', async () => {
    const res = makeRes();
    await analyticsHandler(makeReq({ query: { matchId: 'x' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid matchId');
  });

  it("404 pour un match d'un autre tenant", async () => {
    const res = makeRes();
    await analyticsHandler(makeReq({ query: { matchId: M_OTHER } }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Match not found');
  });

  it('200 avec une analytique pour un match sans partie', async () => {
    const res = makeRes();
    await analyticsHandler(makeReq({ query: { matchId: M_ID } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('analytics');
  });

  it('405 + Allow sur une méthode non déclarée', async () => {
    const res = makeRes();
    await analyticsHandler(
      makeReq({ method: 'POST', query: { matchId: M_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });
});

describe('GET /api/admin/matches/[matchId]/map-pool', () => {
  it('400 « matchId invalide »', async () => {
    const res = makeRes();
    await mapPoolHandler(makeReq({ query: { matchId: 'x' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('matchId invalide');
  });

  it("404 pour un match d'un autre tenant", async () => {
    const res = makeRes();
    await mapPoolHandler(makeReq({ query: { matchId: M_OTHER } }), res);
    expect(res.statusCode).toBe(404);
    expect(resolvePoolMock).not.toHaveBeenCalled();
  });

  it('200 : le pool résolu pour le tenant du staff', async () => {
    const res = makeRes();
    await mapPoolHandler(makeReq({ query: { matchId: M_ID } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      maps: [{ name: 'Ilios' }],
      source: 'tournament',
    });
    expect(resolvePoolMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: TENANT_A, roundNumber: 1 })
    );
  });
});

describe('/api/admin/matches/[matchId]/cast-assignments', () => {
  it('POST 400 « castMemberId invalide »', async () => {
    const res = makeRes();
    await castListHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: { castMemberId: 'nope', briefingAt: future() },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('castMemberId invalide');
  });

  it('POST 400 : briefing dans le passé', async () => {
    const res = makeRes();
    await castListHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: { castMemberId: CAST_ID, briefingAt: '2020-01-01T00:00:00Z' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('briefingAt doit être dans le futur.');
  });

  it('POST 409 : caster désactivé', async () => {
    store.cast_members = [
      { id: CAST_ID, tenant_id: TENANT_A, is_active: false },
    ] as any;
    const res = makeRes();
    await castListHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: { castMemberId: CAST_ID, briefingAt: future() },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('Ce caster est désactivé.');
  });

  it('POST 201 : assignation, journal create_cast_assignment, événement bot', async () => {
    store.cast_members = [
      { id: CAST_ID, tenant_id: TENANT_A, is_active: true },
    ] as any;
    const res = makeRes();
    await castListHandler(
      makeReq({
        method: 'POST',
        query: { matchId: M_ID },
        body: { castMemberId: CAST_ID, briefingAt: future() },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(res.body.assignment).toBeTruthy();
    expect(logStaffActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create_cast_assignment',
        entity_type: 'cast_assignment',
        payload: { match_id: M_ID, cast_member_id: CAST_ID },
      })
    );
    expect(emitCastEventMock).toHaveBeenCalledWith(
      'cast.assigned',
      expect.objectContaining({ matchId: M_ID, castMemberId: CAST_ID }),
      TENANT_A
    );
  });

  it('GET 200 : liste scopée au tenant', async () => {
    store.cast_assignments = [
      { id: ASSIGN_ID, tenant_id: TENANT_A, match_id: M_ID },
      { id: 'other', tenant_id: TENANT_B, match_id: M_ID },
    ] as any;
    const res = makeRes();
    await castListHandler(makeReq({ query: { matchId: M_ID } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.assignments.map((a: any) => a.id)).toEqual([ASSIGN_ID]);
  });
});

describe('/api/admin/matches/[matchId]/cast-assignments/[assignmentId]', () => {
  it('400 « IDs invalides »', async () => {
    const res = makeRes();
    await castByIdHandler(
      makeReq({
        method: 'DELETE',
        query: { matchId: M_ID, assignmentId: 'bad' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('IDs invalides');
  });

  it('DELETE 200 : retrait, journal delete_cast_assignment, cast.unassigned', async () => {
    store.cast_assignments = [
      {
        id: ASSIGN_ID,
        tenant_id: TENANT_A,
        match_id: M_ID,
        cast_member_id: CAST_ID,
        briefing_at: future(),
      },
    ] as any;
    const res = makeRes();
    await castByIdHandler(
      makeReq({
        method: 'DELETE',
        query: { matchId: M_ID, assignmentId: ASSIGN_ID },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(logStaffActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'delete_cast_assignment',
        entity_id: ASSIGN_ID,
        payload: { match_id: M_ID },
      })
    );
    expect(emitCastEventMock).toHaveBeenCalledWith(
      'cast.unassigned',
      expect.objectContaining({
        assignmentId: ASSIGN_ID,
        castMemberId: CAST_ID,
      }),
      TENANT_A
    );
  });

  it('PATCH 400 « briefingAt requis »', async () => {
    const res = makeRes();
    await castByIdHandler(
      makeReq({
        method: 'PATCH',
        query: { matchId: M_ID, assignmentId: ASSIGN_ID },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('briefingAt requis');
  });
});
