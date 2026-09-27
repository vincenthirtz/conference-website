// Tests pour pages/api/admin/tournament/[id]/pool.ts — l'écran staff de
// répartition de la liste d'attente (lot 2).
//
// Les invariants (5 max, joueuses en attente) sont tenus par `pool_place` /
// `pool_unplace`, simulées ici : on vérifie ce que la ROUTE décide avant de
// les appeler (mode regroupé, cible autorisée) et ce qu'elle fait de leurs
// refus (codes, nettoyage de l'équipe mixte créée pour rien).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));

import {
  store,
  resetSupabaseMock,
  CONFERENCE_TENANT_ID,
  setAuthUser,
  setRpcResult,
  rpcCalls,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import handler from '../../pages/api/admin/tournament/[id]/pool';

const T_ID = '4313f067-b7a4-4872-a8b7-5035d0596d2e';
const TEAM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEAM_X = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const e = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

function staff(): StaffMember {
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

let n = 0;
function makeReq(over: Partial<any> = {}): any {
  n += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${n}` },
    query: { id: T_ID },
    body: {},
    socket: { remoteAddress: `10.3.0.${n % 250}` },
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function waiting(i: number, team: string | null) {
  return {
    id: e(i),
    tenant_id: CONFERENCE_TENANT_ID,
    tournament_id: T_ID,
    user_id: `u${i}`,
    display_name: `Joueuse${i}`,
    battle_tag: `J${i}#1234`,
    origin_team_id: team,
    placed_team_id: null,
    status: 'waitlist',
    created_at: `2026-10-01T00:00:0${i}Z`,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [staff()] as any;
  store.tournaments = [
    {
      id: T_ID,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Halloween',
      pooled_teams: true,
    },
  ] as any;
  store.teams = [
    {
      id: TEAM_A,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Alpha',
      is_active: true,
    },
    {
      id: TEAM_X,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Autre',
      is_active: true,
    },
  ] as any;
  store.tournament_teams = [] as any;
  store.tournament_pool_entries = [
    waiting(1, TEAM_A),
    waiting(2, TEAM_A),
    waiting(3, TEAM_A),
    waiting(4, null),
    waiting(5, null),
  ] as any;
});

describe('GET /api/admin/tournament/[id]/pool', () => {
  it('409 NOT_POOLED on a regular tournament', async () => {
    (store.tournaments as any[])[0].pooled_teams = false;
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('NOT_POOLED');
  });

  it('returns the waitlist and proposes the Alpha core topped up with 2 solos', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.teamSize).toBe(5);
    expect(body.waitlist).toHaveLength(5);
    expect(body.waitlist[0].originTeamName).toBe('Alpha');
    expect(body.proposal.squads).toEqual([
      {
        kind: 'core',
        teamId: TEAM_A,
        teamName: 'Alpha',
        entryIds: [e(1), e(2), e(3), e(4), e(5)],
      },
    ]);
  });
});

describe('POST /api/admin/tournament/[id]/pool', () => {
  it('places into the origin team of one of the players', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'POST',
        body: { action: 'place', entryIds: [e(1), e(4)], teamId: TEAM_A },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(rpcCalls).toContainEqual({
      fn: 'pool_place',
      params: {
        p_tenant_id: CONFERENCE_TENANT_ID,
        p_tournament_id: T_ID,
        p_entry_ids: [e(1), e(4)],
        p_team_id: TEAM_A,
        p_team_size: 5,
      },
    });
    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
  });

  it('refuses an unrelated team (neither entered nor an origin team)', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'POST',
        body: { action: 'place', entryIds: [e(4)], teamId: TEAM_X },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_TARGET');
    expect(rpcCalls).toHaveLength(0);
  });

  it('creates an inactive mixed team for place-new', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'POST',
        body: {
          action: 'place-new',
          entryIds: [e(4), e(5)],
          teamName: 'Citrouilles',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const created = (store.teams as any[]).find(
      (t) => t.name === 'Citrouilles'
    );
    expect(created).toBeTruthy();
    expect(created.is_active).toBe(false);
    expect(created.is_joinable).toBe(false);
    expect((rpcCalls[0].params as any).p_team_id).toBe(created.id);
  });

  it('deletes the mixed team it just created when placement is refused', async () => {
    setRpcResult('pool_place', {
      error: {
        message: 'pool_place: entries not waiting',
        hint: 'not_waiting',
      },
    });
    const res = makeRes();
    await handler(
      makeReq({
        method: 'POST',
        body: { action: 'place-new', entryIds: [e(4)], teamName: 'Fantômes' },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('NOT_WAITING');
    expect((store.teams as any[]).some((t) => t.name === 'Fantômes')).toBe(
      false
    );
  });

  it('maps a full team to 409 TEAM_FULL', async () => {
    setRpcResult('pool_place', {
      error: { message: 'pool_place: team full', hint: 'team_full' },
    });
    const res = makeRes();
    await handler(
      makeReq({
        method: 'POST',
        body: { action: 'place', entryIds: [e(1)], teamId: TEAM_A },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('TEAM_FULL');
  });

  it('unplace calls pool_unplace', async () => {
    setRpcResult('pool_unplace', { data: 'unplaced' });
    const res = makeRes();
    await handler(
      makeReq({ method: 'POST', body: { action: 'unplace', entryId: e(1) } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(rpcCalls[0]).toEqual({
      fn: 'pool_unplace',
      params: {
        p_tenant_id: CONFERENCE_TENANT_ID,
        p_tournament_id: T_ID,
        p_entry_id: e(1),
      },
    });
  });

  it('400 on more than 5 players at once', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'POST',
        body: {
          action: 'place',
          entryIds: [e(1), e(2), e(3), e(4), e(5), e(6)],
          teamId: TEAM_A,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});
