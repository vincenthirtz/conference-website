import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: vi.fn(async () => ({
    delivered: true,
    status: 200,
    attempts: 1,
  })),
}));
vi.mock('@/utils/matches/botEventEnrich', () => ({
  enrichMatchEvent: vi.fn(async (matchId: string) => ({
    matchId,
    team1: { captainDiscordUserId: 'dc-1' },
    team2: { captainDiscordUserId: 'dc-2' },
  })),
}));

import { emitBotEvent } from '@/utils/botEvents';
import nudgeHandler from '../../pages/api/admin/matches/[matchId]/checkin-nudge';

function makeStaffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role: 'manager',
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

const M_ID = '11111111-1111-1111-1111-111111111111';
const T1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const T2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow()] as any;
  (emitBotEvent as any).mockClear();
});

describe('POST /api/admin/matches/[matchId]/checkin-nudge', () => {
  it('405 on non-POST', async () => {
    const res = makeRes();
    await nudgeHandler(
      makeReq({ method: 'GET', query: { matchId: M_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('400 invalid matchId', async () => {
    const res = makeRes();
    await nudgeHandler(
      makeReq({ query: { matchId: 'bogus' }, body: { teamSide: 1 } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 invalid teamSide', async () => {
    const res = makeRes();
    await nudgeHandler(
      makeReq({ query: { matchId: M_ID }, body: { teamSide: 3 } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when match missing', async () => {
    const res = makeRes();
    await nudgeHandler(
      makeReq({ query: { matchId: M_ID }, body: { teamSide: 1 } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('409 INVALID_STATUS when match status is finished', async () => {
    store.matches = [
      {
        id: M_ID,
        tournament_id: 'tour-1',
        status: 'finished',
        team1_id: T1,
        team2_id: T2,
      },
    ] as any;
    const res = makeRes();
    await nudgeHandler(
      makeReq({ query: { matchId: M_ID }, body: { teamSide: 1 } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('INVALID_STATUS');
  });

  it('409 ALREADY_CHECKED_IN when the requested side has already checked in', async () => {
    store.matches = [
      {
        id: M_ID,
        tournament_id: 'tour-1',
        status: 'pending',
        team1_id: T1,
        team2_id: T2,
        team1_checked_in_at: '2026-05-25T10:00:00Z',
      },
    ] as any;
    const res = makeRes();
    await nudgeHandler(
      makeReq({ query: { matchId: M_ID }, body: { teamSide: 1 } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('ALREADY_CHECKED_IN');
  });

  it('200 happy path: emits one event per nudged side + writes staff log', async () => {
    store.matches = [
      {
        id: M_ID,
        tournament_id: 'tour-1',
        status: 'pending',
        team1_id: T1,
        team2_id: T2,
        scheduled_at: '2026-05-25T19:00:00Z',
      },
    ] as any;
    const res = makeRes();
    await nudgeHandler(
      makeReq({ query: { matchId: M_ID }, body: { teamSide: 'both' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.success).toBe(true);
    expect(body.nudgedSides.sort()).toEqual([1, 2]);
    expect((emitBotEvent as any).mock.calls).toHaveLength(2);
    expect((emitBotEvent as any).mock.calls[0][0]).toBe('checkin.nudge');

    const log = (store.staff_logs as any[]).find(
      (l) => l.action === 'checkin_manual_nudge'
    );
    expect(log).toBeDefined();
    expect(log.entity_id).toBe(M_ID);
    expect(log.payload.team_sides.sort()).toEqual([1, 2]);
  });

  it('200 with both, but skips the side already checked in', async () => {
    store.matches = [
      {
        id: M_ID,
        tournament_id: 'tour-1',
        status: 'pending',
        team1_id: T1,
        team2_id: T2,
        team2_checked_in_at: '2026-05-25T10:00:00Z',
      },
    ] as any;
    const res = makeRes();
    await nudgeHandler(
      makeReq({ query: { matchId: M_ID }, body: { teamSide: 'both' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.nudgedSides).toEqual([1]);
    expect(body.skippedSides).toEqual([2]);
    expect((emitBotEvent as any).mock.calls).toHaveLength(1);
  });

  it('backfills checkin tokens when missing + includes checkinUrl in payload', async () => {
    store.matches = [
      {
        id: M_ID,
        tournament_id: 'tour-1',
        status: 'pending',
        team1_id: T1,
        team2_id: T2,
        team1_checkin_token: null,
        team2_checkin_token: null,
      },
    ] as any;
    const res = makeRes();
    await nudgeHandler(
      makeReq({ query: { matchId: M_ID }, body: { teamSide: 1 } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const tokenAfter = (store.matches as any[])[0].team1_checkin_token;
    expect(typeof tokenAfter).toBe('string');
    expect(tokenAfter.length).toBeGreaterThan(0);

    const eventPayload = (emitBotEvent as any).mock.calls[0][1];
    expect(typeof eventPayload.checkinUrl).toBe('string');
    expect(eventPayload.checkinUrl).toContain(tokenAfter);
  });
});
