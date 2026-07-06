// tests/unit/apiAdminMatchTenantScope.test.ts
//
// Scoping tenant de /api/admin/matches/[matchId] (GET / PUT meta / DELETE).
// supabaseAdmin bypasse la RLS : sans filtre `.eq('tenant_id', ctx.tenantId)`,
// un manager du tenant A pouvait lire / modifier / supprimer un match du
// tenant B. Ces tests verrouillent le comportement corrigé, y compris le
// garde CROSS_TENANT_REF sur team1_id / team2_id / tournament_id en PUT meta.

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
vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: vi.fn(async () => undefined),
}));
vi.mock('@/utils/matches/botEventEnrich', () => ({
  enrichMatchEvent: vi.fn(async () => null),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import adminMatchHandler from '../../pages/api/admin/matches/[matchId]';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const M_ID = '550e8400-e29b-41d4-a716-446655440001';
const TEAM_A1 = '550e8400-e29b-41d4-a716-446655440010';
const TEAM_B1 = '550e8400-e29b-41d4-a716-446655440020';
const TOUR_A = '550e8400-e29b-41d4-a716-446655440030';
const TOUR_B = '550e8400-e29b-41d4-a716-446655440040';

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
  return `Bearer scope-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: freshBearer() },
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
  // Le staff appartient au tenant A → ctx.tenantId = TENANT_A (fallback_first).
  store.tenants = [
    { id: TENANT_A, slug: 'alpha', name: 'Alpha', is_active: true },
    { id: TENANT_B, slug: 'beta', name: 'Beta', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: 'staff-1', role: 'admin' },
  ] as any;
  store.tournaments = [
    { id: TOUR_A, tenant_id: TENANT_A, status: 'running' },
    { id: TOUR_B, tenant_id: TENANT_B, status: 'running' },
  ] as any;
  store.teams = [
    { id: TEAM_A1, tenant_id: TENANT_A, name: 'Alpha One' },
    { id: TEAM_B1, tenant_id: TENANT_B, name: 'Beta One' },
  ] as any;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function seedMatch(tenantId: string, extra: Record<string, unknown> = {}) {
  store.matches = [
    {
      id: M_ID,
      tenant_id: tenantId,
      tournament_id: tenantId === TENANT_A ? TOUR_A : TOUR_B,
      status: 'pending',
      updated_at: '2026-04-01T11:00:00Z',
      scheduled_at: null,
      notes: null,
      ...extra,
    },
  ] as any;
}

describe('/api/admin/matches/[matchId] — tenant scoping', () => {
  it('GET 200 pour un match du tenant courant', async () => {
    seedMatch(TENANT_A);
    const res = makeRes();
    await adminMatchHandler(
      makeReq({ method: 'GET', query: { matchId: M_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).match.id).toBe(M_ID);
  });

  it("GET 404 pour un match d'un autre tenant", async () => {
    seedMatch(TENANT_B);
    const res = makeRes();
    await adminMatchHandler(
      makeReq({ method: 'GET', query: { matchId: M_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it("PUT meta 404 pour un match d'un autre tenant (pas de fuite, pas d'écriture)", async () => {
    seedMatch(TENANT_B, { notes: 'original' });
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: { mode: 'meta', notes: 'hacked' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect((store.matches[0] as any).notes).toBe('original');
  });

  it("PUT: l'optimistic lock ne fuit pas le updated_at d'un match d'un autre tenant", async () => {
    seedMatch(TENANT_B);
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
    // Avant le fix : 409 avec server_updated_at du match du tenant B.
    expect(res.statusCode).not.toBe(409);
    // Le chemin score reste délégué à applyMatchScore (scoped tenant côté helper).
    expect(applyMatchScoreMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A, matchId: M_ID })
    );
  });

  it("DELETE (soft) 404 pour un match d'un autre tenant", async () => {
    seedMatch(TENANT_B);
    const res = makeRes();
    await adminMatchHandler(
      makeReq({ method: 'DELETE', query: { matchId: M_ID } }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect((store.matches[0] as any).status).toBe('pending');
  });

  it("DELETE ?hard=1 404 pour un match d'un autre tenant (rien supprimé)", async () => {
    seedMatch(TENANT_B);
    const res = makeRes();
    await adminMatchHandler(
      makeReq({ method: 'DELETE', query: { matchId: M_ID, hard: '1' } }),
      res
    );
    expect(res.statusCode).toBe(404);
    expect(store.matches).toHaveLength(1);
  });

  it('DELETE (soft) 200 pour un match du tenant courant', async () => {
    seedMatch(TENANT_A);
    const res = makeRes();
    await adminMatchHandler(
      makeReq({ method: 'DELETE', query: { matchId: M_ID } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.matches[0] as any).status).toBe('cancelled');
  });

  it('PUT meta 400 CROSS_TENANT_REF quand team1_id appartient à un autre tenant', async () => {
    seedMatch(TENANT_A);
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: { mode: 'meta', team1_id: TEAM_B1 },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('CROSS_TENANT_REF');
    expect((store.matches[0] as any).team1_id).toBeUndefined();
  });

  it('PUT meta 400 CROSS_TENANT_REF quand tournament_id appartient à un autre tenant', async () => {
    seedMatch(TENANT_A);
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: { mode: 'meta', tournament_id: TOUR_B },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('CROSS_TENANT_REF');
  });

  it('PUT meta 400 quand team1_id n’est pas un UUID', async () => {
    seedMatch(TENANT_A);
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: { mode: 'meta', team1_id: 'not-a-uuid' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PUT meta 200 quand team1_id appartient au tenant courant', async () => {
    seedMatch(TENANT_A);
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: { mode: 'meta', team1_id: TEAM_A1 },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.matches[0] as any).team1_id).toBe(TEAM_A1);
  });

  it('PUT meta 200 quand team1_id est explicitement null (désassignation)', async () => {
    seedMatch(TENANT_A, { team1_id: TEAM_A1 });
    const res = makeRes();
    await adminMatchHandler(
      makeReq({
        method: 'PUT',
        query: { matchId: M_ID },
        body: { mode: 'meta', team1_id: null },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.matches[0] as any).team1_id).toBeNull();
  });
});
