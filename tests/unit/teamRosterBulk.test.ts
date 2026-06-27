// Unit tests for pages/api/admin/teams/[teamId]/roster-bulk.ts
//
// The staff/manager bulk roster endpoint. Applies one operation to a list of
// members and reports per-member success/failure. Mirrors the teamUpdateMember
// / apiAdminMatchesSearch harness.
//
// Coverage:
//   - set_role (bulk assign role to all selected)
//   - set_substitute (mark / unmark, captain protected from being marked sub)
//   - remove (captain guarded against bulk removal)
//   - import_battle_tags (valid / invalid / not-found per line)
//   - audit log emitted ONCE per call (bulk_roster_update)
//   - gating: below-manager staff -> 403

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import bulkHandler from '../../pages/api/admin/teams/[teamId]/roster-bulk';

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeAuthedReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: { teamId: TEAM_ID },
    body: {},
    cookies: {},
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
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAPTAIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PLAYER_A_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PLAYER_B_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const TM_CAP = '11111111-1111-1111-1111-111111111111';
const TM_A = '22222222-2222-2222-2222-222222222222';
const TM_B = '33333333-3333-3333-3333-333333333333';

function makeStaffRow(role: 'admin' | 'manager' | 'caster'): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'staff-user-1',
    email: 'staff@a.com',
    role,
    display_name: 'Staff',
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function seed() {
  store.teams = [
    {
      id: TEAM_ID,
      name: 'Alpha',
      captain_id: CAPTAIN_ID,
      is_active: true,
    },
  ] as any;
  store.team_members = [
    {
      id: TM_CAP,
      team_id: TEAM_ID,
      user_id: CAPTAIN_ID,
      role: 'player',
      battle_tag: 'Cap#1111',
      is_substitute: false,
    },
    {
      id: TM_A,
      team_id: TEAM_ID,
      user_id: PLAYER_A_ID,
      role: 'player',
      battle_tag: 'Aaa#1234',
      is_substitute: false,
    },
    {
      id: TM_B,
      team_id: TEAM_ID,
      user_id: PLAYER_B_ID,
      role: 'player',
      battle_tag: 'Bbb#5678',
      is_substitute: false,
    },
  ] as any;
  store.staff = [makeStaffRow('manager')] as any;
  store.staff_logs = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'staff-user-1' });
  seed();
});

function member(id: string) {
  return (store.team_members as any[]).find((m) => m.id === id);
}

describe('roster-bulk: set_role', () => {
  it('assigns a role to all selected members', async () => {
    const res = makeRes();
    await bulkHandler(
      makeAuthedReq({
        body: {
          operation: 'set_role',
          memberIds: [TM_A, TM_B],
          role: 'coach',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.successCount).toBe(2);
    expect(member(TM_A).role).toBe('coach');
    expect(member(TM_B).role).toBe('coach');
  });

  it('rejects when role is missing', async () => {
    const res = makeRes();
    await bulkHandler(
      makeAuthedReq({
        body: { operation: 'set_role', memberIds: [TM_A] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('roster-bulk: set_substitute', () => {
  it('marks selected members as substitute', async () => {
    const res = makeRes();
    await bulkHandler(
      makeAuthedReq({
        body: {
          operation: 'set_substitute',
          memberIds: [TM_A, TM_B],
          isSubstitute: true,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(member(TM_A).is_substitute).toBe(true);
    expect(member(TM_B).is_substitute).toBe(true);
  });

  it('unmarks substitutes', async () => {
    member(TM_A).is_substitute = true;
    const res = makeRes();
    await bulkHandler(
      makeAuthedReq({
        body: {
          operation: 'set_substitute',
          memberIds: [TM_A],
          isSubstitute: false,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(member(TM_A).is_substitute).toBe(false);
  });

  it('never marks the captain as substitute (guarded)', async () => {
    const res = makeRes();
    await bulkHandler(
      makeAuthedReq({
        body: {
          operation: 'set_substitute',
          memberIds: [TM_CAP, TM_A],
          isSubstitute: true,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    // Captain untouched, player marked
    expect(member(TM_CAP).is_substitute).toBe(false);
    expect(member(TM_A).is_substitute).toBe(true);
    const capResult = res.body.results.find((r: any) => r.memberId === TM_CAP);
    expect(capResult.ok).toBe(false);
    expect(res.body.successCount).toBe(1);
    expect(res.body.failureCount).toBe(1);
  });
});

describe('roster-bulk: remove', () => {
  it('removes selected non-captain members', async () => {
    const res = makeRes();
    await bulkHandler(
      makeAuthedReq({
        body: { operation: 'remove', memberIds: [TM_A, TM_B] },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(member(TM_A)).toBeUndefined();
    expect(member(TM_B)).toBeUndefined();
  });

  it('never removes the captain via bulk (guarded)', async () => {
    const res = makeRes();
    await bulkHandler(
      makeAuthedReq({
        body: { operation: 'remove', memberIds: [TM_CAP, TM_A] },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    // Captain still present, player removed
    expect(member(TM_CAP)).toBeTruthy();
    expect(member(TM_A)).toBeUndefined();
    const capResult = res.body.results.find((r: any) => r.memberId === TM_CAP);
    expect(capResult.ok).toBe(false);
    expect(capResult.error).toMatch(/captain/i);
  });
});

describe('roster-bulk: import_battle_tags', () => {
  it('applies a valid BattleTag to a matched member', async () => {
    const res = makeRes();
    await bulkHandler(
      makeAuthedReq({
        body: {
          operation: 'import_battle_tags',
          items: [{ memberId: TM_A, battleTag: 'New#4242' }],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.successCount).toBe(1);
    expect(member(TM_A).battle_tag).toBe('New#4242');
  });

  it('reports an invalid BattleTag and leaves the member unchanged', async () => {
    const res = makeRes();
    await bulkHandler(
      makeAuthedReq({
        body: {
          operation: 'import_battle_tags',
          items: [{ memberId: TM_A, battleTag: 'not-a-tag' }],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.failureCount).toBe(1);
    const result = res.body.results.find((r: any) => r.memberId === TM_A);
    expect(result.ok).toBe(false);
    expect(member(TM_A).battle_tag).toBe('Aaa#1234');
  });

  it('reports not-found for a member id outside the team', async () => {
    const res = makeRes();
    await bulkHandler(
      makeAuthedReq({
        body: {
          operation: 'import_battle_tags',
          items: [{ memberId: 'unknown-member', battleTag: 'New#4242' }],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const result = res.body.results.find(
      (r: any) => r.memberId === 'unknown-member'
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });
});

describe('roster-bulk: audit', () => {
  it('emits exactly one bulk_roster_update log per call', async () => {
    const res = makeRes();
    await bulkHandler(
      makeAuthedReq({
        body: {
          operation: 'set_role',
          memberIds: [TM_A, TM_B],
          role: 'coach',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    const logs = (store.staff_logs as any[]).filter(
      (l) => l.action === 'bulk_roster_update'
    );
    expect(logs.length).toBe(1);
    expect(logs[0].entity_id).toBe(TEAM_ID);
    expect(logs[0].payload.operation).toBe('set_role');
    expect(logs[0].payload.success).toBe(2);
  });
});

describe('roster-bulk: gating', () => {
  it('returns 403 for a below-manager staff (caster)', async () => {
    store.staff = [makeStaffRow('caster')] as any;
    invalidateStaffCache();
    const res = makeRes();
    await bulkHandler(
      makeAuthedReq({
        body: { operation: 'remove', memberIds: [TM_A] },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('rejects an unknown operation', async () => {
    const res = makeRes();
    await bulkHandler(
      makeAuthedReq({
        body: { operation: 'nuke', memberIds: [TM_A] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects a non-POST method', async () => {
    const res = makeRes();
    await bulkHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });
});
