// Tests dédiés au garde-fou Lot 3 sur POST /api/admin/matches/[matchId]/dispute :
// la dispute est refusée (409 + code DOWNSTREAM_LOCKED) quand le résultat du
// match a déjà été propagé à un match aval `ongoing` / `finished` / `walkover`.

import { describe, it, expect, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import disputeHandler from '../../pages/api/admin/matches/[matchId]/dispute';

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

let _tokenCounter = 0;
function freshBearer() {
  _tokenCounter += 1;
  return `Bearer t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
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

const M_SRC = '11111111-1111-1111-1111-111111111111';
const M_DOWN = '22222222-2222-2222-2222-222222222222';
const T_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const T_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow()] as any;
});

describe('POST /api/admin/matches/[matchId]/dispute — downstream guard', () => {
  it('200 when no downstream link', async () => {
    store.matches = [
      {
        id: M_SRC,
        tournament_id: 'tour-1',
        status: 'finished',
        team1_id: T_A,
        team2_id: T_B,
        next_match_win_id: null,
        next_match_lose_id: null,
      },
    ] as any;
    const res = makeRes();
    await disputeHandler(
      makeReq({ query: { matchId: M_SRC }, body: { reason: 'bad call' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.matches as any[])[0].status).toBe('disputed');
  });

  it('200 when downstream is still pending', async () => {
    store.matches = [
      {
        id: M_SRC,
        tournament_id: 'tour-1',
        status: 'finished',
        team1_id: T_A,
        team2_id: T_B,
        next_match_win_id: M_DOWN,
        next_match_win_slot: 1,
      },
      { id: M_DOWN, status: 'pending', team1_id: T_A },
    ] as any;
    const res = makeRes();
    await disputeHandler(
      makeReq({ query: { matchId: M_SRC }, body: { reason: 'bad call' } }),
      res
    );
    expect(res.statusCode).toBe(200);
  });

  it('409 + DOWNSTREAM_LOCKED when downstream is ongoing with source team', async () => {
    store.matches = [
      {
        id: M_SRC,
        tournament_id: 'tour-1',
        status: 'finished',
        team1_id: T_A,
        team2_id: T_B,
        next_match_win_id: M_DOWN,
        next_match_win_slot: 1,
      },
      { id: M_DOWN, status: 'ongoing', team1_id: T_A },
    ] as any;
    const res = makeRes();
    await disputeHandler(
      makeReq({ query: { matchId: M_SRC }, body: { reason: 'bad call' } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('DOWNSTREAM_LOCKED');
    expect((res.body as any).blockedBy).toHaveLength(1);
    expect((store.matches as any[])[0].status).toBe('finished'); // unchanged
  });

  it('409 when downstream is finished with source team', async () => {
    store.matches = [
      {
        id: M_SRC,
        tournament_id: 'tour-1',
        status: 'finished',
        team1_id: T_A,
        team2_id: T_B,
        next_match_win_id: M_DOWN,
        next_match_win_slot: 1,
      },
      { id: M_DOWN, status: 'finished', team1_id: T_A },
    ] as any;
    const res = makeRes();
    await disputeHandler(
      makeReq({ query: { matchId: M_SRC }, body: { reason: 'r' } }),
      res
    );
    expect(res.statusCode).toBe(409);
  });

  it('200 when downstream is ongoing but slot carries a different team (manual override)', async () => {
    store.matches = [
      {
        id: M_SRC,
        tournament_id: 'tour-1',
        status: 'finished',
        team1_id: T_A,
        team2_id: T_B,
        next_match_win_id: M_DOWN,
        next_match_win_slot: 1,
      },
      {
        id: M_DOWN,
        status: 'ongoing',
        team1_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      }, // unrelated team
    ] as any;
    const res = makeRes();
    await disputeHandler(
      makeReq({ query: { matchId: M_SRC }, body: { reason: 'r' } }),
      res
    );
    expect(res.statusCode).toBe(200);
  });
});
