// Unit tests for pages/api/teams/update-member-specialty.ts
//
// PATCH endpoint: captain or manager sets/clears a roster member's in-game
// specialty (tank | dps | support | flex | null). Mirrors the
// teamUpdateMember / teamManagerRole harness.
//
// Coverage:
//   - captain sets a valid specialty (success)
//   - captain clears specialty with null (success)
//   - manager can update (success)
//   - plain player (no managed team) -> 403
//   - invalid specialty value -> 400 (no mutation)
//   - invalid memberId (not a uuid) -> 400

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import updateSpecialtyHandler from '../../pages/api/teams/update-member-specialty';

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
const MANAGER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PLAYER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const TM_CAP = '11111111-1111-1111-1111-111111111111';
const TM_MGR = '22222222-2222-2222-2222-222222222222';
const TM_PLY = '33333333-3333-3333-3333-333333333333';
const TM_OTHER = '55555555-5555-5555-5555-555555555555';

function seed() {
  store.teams = [
    { id: TEAM_ID, name: 'Alpha', captain_id: CAPTAIN_ID, is_active: true },
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
      specialty: null,
    },
    {
      id: TM_MGR,
      team_id: TEAM_ID,
      user_id: MANAGER_ID,
      role: 'manager',
      specialty: null,
    },
    {
      id: TM_PLY,
      team_id: TEAM_ID,
      user_id: PLAYER_ID,
      role: 'player',
      specialty: 'dps',
    },
    {
      id: TM_OTHER,
      team_id: OTHER_TEAM_ID,
      user_id: 'other-player',
      role: 'player',
      specialty: null,
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: CAPTAIN_ID });
  seed();
});

describe('/api/teams/update-member-specialty - success', () => {
  it('captain can set a valid specialty', async () => {
    const res = makeRes();
    await updateSpecialtyHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, specialty: 'support' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).specialty).toBe('support');
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.specialty).toBe('support');
  });

  it('captain can clear specialty with null', async () => {
    const res = makeRes();
    await updateSpecialtyHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, specialty: null } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).specialty).toBeNull();
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.specialty).toBeNull();
  });

  it('manager can update a member specialty', async () => {
    setAuthUser({ id: MANAGER_ID });
    const res = makeRes();
    await updateSpecialtyHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, specialty: 'flex' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.specialty).toBe('flex');
  });
});

describe('/api/teams/update-member-specialty - access control', () => {
  it('plain player (no managed team) gets 403', async () => {
    setAuthUser({ id: PLAYER_ID });
    const res = makeRes();
    await updateSpecialtyHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, specialty: 'tank' } }),
      res
    );
    expect(res.statusCode).toBe(403);
    // unchanged
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.specialty).toBe('dps');
  });

  it('cannot edit a member of another team (404)', async () => {
    const res = makeRes();
    await updateSpecialtyHandler(
      makeAuthedReq({ body: { memberId: TM_OTHER, specialty: 'tank' } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('/api/teams/update-member-specialty - validation', () => {
  it('rejects an invalid specialty value (400, no mutation)', async () => {
    const res = makeRes();
    await updateSpecialtyHandler(
      makeAuthedReq({ body: { memberId: TM_PLY, specialty: 'wizard' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    const member = (store.team_members as any[]).find((m) => m.id === TM_PLY);
    expect(member.specialty).toBe('dps');
  });

  it('rejects an invalid memberId (not a uuid) with 400', async () => {
    const res = makeRes();
    await updateSpecialtyHandler(
      makeAuthedReq({ body: { memberId: 'not-a-uuid', specialty: 'tank' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});
