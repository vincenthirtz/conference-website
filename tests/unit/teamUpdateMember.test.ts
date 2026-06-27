// Unit tests for pages/api/teams/update-member.ts
//
// The captain/manager self-service endpoint that updates a single roster
// member's BattleTag and/or substitute flag (and optionally role). Mirrors the
// teamManagerRole harness.
//
// Coverage:
//   - inline BattleTag edit (valid + invalid format)
//   - substitute toggle (mark / unmark)
//   - access control (plain player -> 403, member of another team -> 404)
//   - audit logs emitted: update_player_battle_tag, manage_substitute

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import updateMemberHandler from '../../pages/api/teams/update-member';

vi.mock('@/utils/teams/rosterLock', () => ({
  isTeamRosterLocked: vi.fn(async () => ({ locked: false })),
  rosterLockErrorMessage: () => 'Roster locked',
}));

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeAuthedReq(over: Partial<any> = {}): any {
  return {
    method: 'PATCH',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
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
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const TEAM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_TEAM_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CAPTAIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PLAYER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const TM_CAP = '11111111-1111-1111-1111-111111111111';
const TM_PLY = '33333333-3333-3333-3333-333333333333';
const TM_OTHER = '55555555-5555-5555-5555-555555555555';

function seed() {
  store.teams = [
    {
      id: TEAM_ID,
      name: 'Alpha',
      captain_id: CAPTAIN_ID,
      is_active: true,
    },
    {
      id: OTHER_TEAM_ID,
      name: 'Bravo',
      captain_id: 'someone-else',
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
      id: TM_PLY,
      team_id: TEAM_ID,
      user_id: PLAYER_ID,
      role: 'player',
      battle_tag: 'Old#1234',
      is_substitute: false,
    },
    {
      id: TM_OTHER,
      team_id: OTHER_TEAM_ID,
      user_id: 'other-player',
      role: 'player',
      battle_tag: 'Other#9999',
      is_substitute: false,
    },
  ] as any;
  // staff row so getStaffByUserId resolves a staff_id for audit logs.
  store.staff = [
    {
      id: 'staff-cap',
      auth_user_id: CAPTAIN_ID,
      role: 'caster',
      display_name: 'Cap',
      is_active: true,
    },
  ] as any;
  store.staff_logs = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: CAPTAIN_ID });
  seed();
});

describe('/api/teams/update-member - BattleTag', () => {
  it('captain can fix a member BattleTag', async () => {
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, battle_tag: 'New#4242' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.battle_tag).toBe('New#4242');
  });

  it('rejects an invalid BattleTag format', async () => {
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, battle_tag: 'not-a-tag' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.battle_tag).toBe('Old#1234');
  });

  it('emits update_player_battle_tag audit log on change', async () => {
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, battle_tag: 'New#4242' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const log = (store.staff_logs as any[]).find(
      (l) => l.action === 'update_player_battle_tag'
    );
    expect(log).toBeTruthy();
    expect(log.entity_id).toBe(TM_PLY);
  });
});

describe('/api/teams/update-member - substitute', () => {
  it('captain can mark a member as substitute', async () => {
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, is_substitute: true } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.is_substitute).toBe(true);
  });

  it('captain can unmark a substitute', async () => {
    (store.team_members as any[]).find((m) => m.id === TM_PLY).is_substitute =
      true;
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, is_substitute: false } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.is_substitute).toBe(false);
  });

  it('emits manage_substitute audit log on change', async () => {
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, is_substitute: true } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const log = (store.staff_logs as any[]).find(
      (l) => l.action === 'manage_substitute'
    );
    expect(log).toBeTruthy();
    expect(log.payload?.is_substitute).toBe(true);
  });
});

describe('/api/teams/update-member - access control', () => {
  it('plain player (no managed team) gets 403', async () => {
    setAuthUser({ id: PLAYER_ID });
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, battle_tag: 'New#4242' } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('cannot edit a member of another team (404)', async () => {
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_OTHER, battle_tag: 'New#4242' } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('rejects when no field is provided', async () => {
    const res = makeRes();
    await updateMemberHandler(
      makeAuthedReq({ body: { memberId: TM_PLY } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});
