import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.hoisted(() => {
  process.env.DISCORD_TEAM_SECRET = 'discord-secret-x';
});

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
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: logStaffActionMock,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAuthListUsers,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import discordAddMemberHandler from '../../pages/api/discord/teams/add-member';
import tournamentMatchesHandler from '../../pages/api/admin/tournament/[id]/matches';

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

function makeReq(over: Partial<any> = {}, includeAuth = false): any {
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
});

const TID = '550e8400-e29b-41d4-a716-446655440000';

/* -----------------------------------------------------------
 * /api/discord/teams/add-member
 * ---------------------------------------------------------*/

describe('POST /api/discord/teams/add-member', () => {
  it('405 on non-POST', async () => {
    const res = makeRes();
    await discordAddMemberHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('401 without secret', async () => {
    const res = makeRes();
    await discordAddMemberHandler(
      makeReq({ method: 'POST', body: { team_id: 'team-1' } }),
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('401 with wrong secret', async () => {
    const res = makeRes();
    await discordAddMemberHandler(
      makeReq({
        method: 'POST',
        headers: { host: 'h', authorization: 'Bearer wrong' },
        body: { team_id: 'team-1' },
      }),
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('400 when team_id missing', async () => {
    const res = makeRes();
    await discordAddMemberHandler(
      makeReq({
        method: 'POST',
        headers: { host: 'h', authorization: 'Bearer discord-secret-x' },
        body: {},
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when team not found', async () => {
    store.teams = [];
    const res = makeRes();
    await discordAddMemberHandler(
      makeReq({
        method: 'POST',
        headers: { host: 'h', authorization: 'Bearer discord-secret-x' },
        body: { team_id: 'team-x', user_id: 'u1' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('400 when neither user_id nor email provided', async () => {
    store.teams = [{ id: 'team-1' }] as any;
    const res = makeRes();
    await discordAddMemberHandler(
      makeReq({
        method: 'POST',
        headers: { host: 'h', authorization: 'Bearer discord-secret-x' },
        body: { team_id: 'team-1' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when email cannot be resolved', async () => {
    store.teams = [{ id: 'team-1' }] as any;
    setAuthListUsers([{ id: 'u-other', email: 'other@example.com' }]);
    const res = makeRes();
    await discordAddMemberHandler(
      makeReq({
        method: 'POST',
        headers: { host: 'h', authorization: 'Bearer discord-secret-x' },
        body: { team_id: 'team-1', email: 'unknown@example.com' },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('200 adds member by user_id and sets captain when requested', async () => {
    store.teams = [{ id: 'team-1', captain_id: null }] as any;
    store.team_members = [];
    const res = makeRes();
    await discordAddMemberHandler(
      makeReq({
        method: 'POST',
        headers: { host: 'h', authorization: 'Bearer discord-secret-x' },
        body: {
          team_id: 'team-1',
          user_id: 'u-new',
          set_captain: true,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).captainSet).toBe(true);
    expect((store.teams[0] as any).captain_id).toBe('u-new');
    expect(store.team_members.length).toBe(1);
  });

  it('200 resolves user by email', async () => {
    store.teams = [{ id: 'team-1' }] as any;
    store.team_members = [];
    setAuthListUsers([{ id: 'u-resolved', email: 'me@example.com' }]);
    const res = makeRes();
    await discordAddMemberHandler(
      makeReq({
        method: 'POST',
        headers: { host: 'h', authorization: 'Bearer discord-secret-x' },
        body: { team_id: 'team-1', email: 'me@example.com', role: 'coach' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.team_members[0] as any).user_id).toBe('u-resolved');
    expect((store.team_members[0] as any).role).toBe('coach');
  });
});

/* -----------------------------------------------------------
 * /api/admin/tournament/[id]/matches
 * ---------------------------------------------------------*/

describe('/api/admin/tournament/[id]/matches', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('manager')] as any;
  });

  it('400 on invalid tournament id', async () => {
    const res = makeRes();
    await tournamentMatchesHandler(
      makeReq({ method: 'GET', query: { id: 'bogus' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 200 lists matches with no filters', async () => {
    store.matches = [
      {
        id: 'm1',
        tournament_id: TID,
        stage_id: 's1',
        status: 'finished',
        round_number: 1,
        team1_id: 't1',
        team2_id: 't2',
        winner_team_id: 't1',
        is_bye: false,
        created_at: '2026',
      },
      {
        id: 'm2',
        tournament_id: TID,
        stage_id: 's1',
        status: 'pending',
        round_number: 2,
        team1_id: 't1',
        team2_id: 't3',
        is_bye: false,
        created_at: '2026',
      },
    ] as any;
    const res = makeRes();
    await tournamentMatchesHandler(
      makeReq({ method: 'GET', query: { id: TID } }, true),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).matches).toHaveLength(2);
  });

  it('GET filters by stageId', async () => {
    store.matches = [
      {
        id: 'm1',
        tournament_id: TID,
        stage_id: 's1',
        status: 'finished',
        is_bye: false,
        created_at: '2026',
      },
      {
        id: 'm2',
        tournament_id: TID,
        stage_id: 's2',
        status: 'pending',
        is_bye: false,
        created_at: '2026',
      },
    ] as any;
    const res = makeRes();
    await tournamentMatchesHandler(
      makeReq({ method: 'GET', query: { id: TID, stageId: 's2' } }, true),
      res
    );
    expect((res.body as any).matches.map((m: any) => m.id)).toEqual(['m2']);
  });

  it('GET filters by status', async () => {
    store.matches = [
      {
        id: 'm1',
        tournament_id: TID,
        status: 'finished',
        is_bye: false,
        created_at: '2026',
      },
      {
        id: 'm2',
        tournament_id: TID,
        status: 'pending',
        is_bye: false,
        created_at: '2026',
      },
    ] as any;
    const res = makeRes();
    await tournamentMatchesHandler(
      makeReq({ method: 'GET', query: { id: TID, status: 'finished' } }, true),
      res
    );
    expect((res.body as any).matches.map((m: any) => m.id)).toEqual(['m1']);
  });

  it('GET ?result=bye filters byes', async () => {
    store.matches = [
      {
        id: 'm-bye',
        tournament_id: TID,
        status: 'finished',
        is_bye: true,
        created_at: '2026',
      },
      {
        id: 'm-normal',
        tournament_id: TID,
        status: 'pending',
        is_bye: false,
        created_at: '2026',
      },
    ] as any;
    const res = makeRes();
    await tournamentMatchesHandler(
      makeReq({ method: 'GET', query: { id: TID, result: 'bye' } }, true),
      res
    );
    expect((res.body as any).matches.map((m: any) => m.id)).toEqual(['m-bye']);
  });

  it('GET ?result=win returns only matches with winner', async () => {
    store.matches = [
      {
        id: 'm-won',
        tournament_id: TID,
        status: 'finished',
        is_bye: false,
        winner_team_id: 't1',
        created_at: '2026',
      },
      {
        id: 'm-tie',
        tournament_id: TID,
        status: 'finished',
        is_bye: false,
        winner_team_id: null,
        created_at: '2026',
      },
    ] as any;
    const res = makeRes();
    await tournamentMatchesHandler(
      makeReq({ method: 'GET', query: { id: TID, result: 'win' } }, true),
      res
    );
    expect((res.body as any).matches.map((m: any) => m.id)).toEqual(['m-won']);
  });

  it('GET ?result=no_result returns finished matches without winner', async () => {
    store.matches = [
      {
        id: 'm-tie',
        tournament_id: TID,
        status: 'finished',
        is_bye: false,
        winner_team_id: null,
        created_at: '2026',
      },
      {
        id: 'm-won',
        tournament_id: TID,
        status: 'finished',
        is_bye: false,
        winner_team_id: 't1',
        created_at: '2026',
      },
    ] as any;
    const res = makeRes();
    await tournamentMatchesHandler(
      makeReq({ method: 'GET', query: { id: TID, result: 'no_result' } }, true),
      res
    );
    expect((res.body as any).matches.map((m: any) => m.id)).toEqual(['m-tie']);
  });

  it('POST 400 when matches array missing', async () => {
    const res = makeRes();
    await tournamentMatchesHandler(
      makeReq({ method: 'POST', query: { id: TID }, body: {} }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when matches array empty', async () => {
    const res = makeRes();
    await tournamentMatchesHandler(
      makeReq(
        { method: 'POST', query: { id: TID }, body: { matches: [] } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 201 inserts batch + logs', async () => {
    store.matches = [];
    const res = makeRes();
    await tournamentMatchesHandler(
      makeReq(
        {
          method: 'POST',
          query: { id: TID },
          body: {
            matches: [
              {
                stage_id: 's1',
                round_number: 1,
                team1_id: 't1',
                team2_id: 't2',
              },
              {
                stage_id: 's1',
                round_number: 1,
                team1_id: 't3',
                team2_id: 't4',
              },
            ],
          },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).matches).toHaveLength(2);
    expect(store.matches.length).toBe(2);
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('returns 405 on PATCH', async () => {
    const res = makeRes();
    await tournamentMatchesHandler(
      makeReq({ method: 'PATCH', query: { id: TID } }, true),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});
