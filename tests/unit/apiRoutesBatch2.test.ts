import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { sendPasswordResetEmail } = vi.hoisted(() => ({
  sendPasswordResetEmail: vi.fn(async () => undefined),
}));
vi.mock('@/utils/email', () => ({ sendPasswordResetEmail }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setGenerateLinkResult,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import twitchChannelsHandler from '../../pages/api/admin/twitch-channels/index';
import forgotPasswordHandler from '../../pages/api/auth/forgot-password';
import checkinTokenHandler from '../../pages/api/checkin/[token]';
import teamsLeaveHandler from '../../pages/api/teams/leave';

/* -----------------------------------------------------------
 * Helpers (same shape as apiAdminRoutes.test.ts)
 * ---------------------------------------------------------*/

function makeStaff(
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'admin'
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
  sendPasswordResetEmail.mockClear();
});

/* -----------------------------------------------------------
 * /api/admin/twitch-channels
 * ---------------------------------------------------------*/

describe('/api/admin/twitch-channels', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaff('admin')] as any;
  });

  it('GET 200 lists active channels', async () => {
    store.twitch_channels = [
      {
        id: 'c1',
        channel: 'foo',
        label: 'Foo',
        is_active: true,
        sort_order: 1,
      },
      {
        id: 'c2',
        channel: 'bar',
        label: 'Bar',
        is_active: false,
        sort_order: 2,
      },
    ] as any;
    const res = makeRes();
    await twitchChannelsHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(200);
    const items = (res.body as any).items;
    expect(items.map((i: any) => i.id)).toEqual(['c1']);
  });

  it('GET ?includeInactive=true returns inactive too', async () => {
    store.twitch_channels = [
      { id: 'c1', channel: 'foo', is_active: true, sort_order: 1 },
      { id: 'c2', channel: 'bar', is_active: false, sort_order: 2 },
    ] as any;
    const res = makeRes();
    await twitchChannelsHandler(
      makeReq({ method: 'GET', query: { includeInactive: 'true' } }, true),
      res
    );
    expect((res.body as any).items).toHaveLength(2);
  });

  it('POST 400 when channel or label missing', async () => {
    const res = makeRes();
    await twitchChannelsHandler(
      makeReq({ method: 'POST', body: { channel: 'only-channel' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 201 inserts a channel with normalized values', async () => {
    store.twitch_channels = [
      { sort_order: 7, channel: 'old', label: 'Old', is_active: true },
    ] as any;
    const res = makeRes();
    await twitchChannelsHandler(
      makeReq(
        {
          method: 'POST',
          body: {
            channel: '  MyChannel  ',
            label: 'My Channel',
            backgroundUrl: 'javascript:void(0)', // sanitized -> null
          },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(201);
    const inserted = (store.twitch_channels as any).find(
      (c: any) => c.channel === 'mychannel'
    );
    expect(inserted).toBeTruthy();
    expect(inserted.background_url).toBeNull();
    expect(inserted.sort_order).toBe(8); // 7 + 1
  });

  it('POST 405 on unsupported methods', async () => {
    const res = makeRes();
    await twitchChannelsHandler(makeReq({ method: 'PATCH' }, true), res);
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/auth/forgot-password
 * ---------------------------------------------------------*/

describe('POST /api/auth/forgot-password', () => {
  it('returns 405 on non-POST', async () => {
    const res = makeRes();
    await forgotPasswordHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 for missing or invalid email', async () => {
    const res = makeRes();
    await forgotPasswordHandler(
      makeReq({ method: 'POST', body: { email: 'not-an-email' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns generic success and triggers email when generateLink works', async () => {
    const res = makeRes();
    await forgotPasswordHandler(
      makeReq({ method: 'POST', body: { email: 'me@example.com' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).success).toBe(true);
    await new Promise((r) => setImmediate(r));
    expect(sendPasswordResetEmail).toHaveBeenCalledOnce();
    const args = (sendPasswordResetEmail.mock.calls[0] as any[])[0];
    expect(args.to).toBe('me@example.com');
  });

  it('returns the same success when the user is unknown (no enumeration)', async () => {
    setGenerateLinkResult({
      data: null,
      error: { status: 404, message: 'User not found' },
    });
    const res = makeRes();
    await forgotPasswordHandler(
      makeReq({ method: 'POST', body: { email: 'noone@example.com' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('returns 500 on unexpected generateLink error', async () => {
    setGenerateLinkResult({
      data: null,
      error: { status: 500, message: 'Boom' },
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await forgotPasswordHandler(
      makeReq({ method: 'POST', body: { email: 'me@example.com' } }),
      res
    );
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(500);
  });

  it('returns 500 when generateLink returns no action_link', async () => {
    setGenerateLinkResult({ data: { properties: {} }, error: null });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await forgotPasswordHandler(
      makeReq({ method: 'POST', body: { email: 'me@example.com' } }),
      res
    );
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(500);
  });

  it('uses default redirect path when an unknown one is requested', async () => {
    const res = makeRes();
    await forgotPasswordHandler(
      makeReq({
        method: 'POST',
        body: {
          email: 'me@example.com',
          redirectPath: '/evil-path',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
  });
});

/* -----------------------------------------------------------
 * /api/checkin/[token] — public token resolve/redeem
 * ---------------------------------------------------------*/

describe('/api/checkin/[token]', () => {
  it('GET 400 when token missing', async () => {
    const res = makeRes();
    await checkinTokenHandler(makeReq({ method: 'GET', query: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('GET 400 when token is an array', async () => {
    const res = makeRes();
    await checkinTokenHandler(
      makeReq({ method: 'GET', query: { token: ['a', 'b'] } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 404 when token does not match any match', async () => {
    store.matches = [];
    const res = makeRes();
    await checkinTokenHandler(
      makeReq({ method: 'GET', query: { token: 'x'.repeat(32) } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('GET 200 returns match info when token matches', async () => {
    const tok = 'a'.repeat(32);
    store.matches = [
      { id: 'm1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', status: 'pending',
        scheduled_at: '2026-04-01T12:00:00.000Z',
        team1_id: 'team-a',
        team2_id: 'team-b',
        team1_checkin_token: tok,
        team2_checkin_token: null,
        team1_checked_in_at: null,
        team2_checked_in_at: null,
        team1: { id: 'team-a', name: 'Alpha' },
        team2: { id: 'team-b', name: 'Bravo' },
      },
    ] as any;
    const res = makeRes();
    await checkinTokenHandler(
      makeReq({ method: 'GET', query: { token: tok } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).teamName).toBe('Alpha');
  });

  it('POST 200 marks the team checked in', async () => {
    const tok = 'b'.repeat(32);
    store.matches = [
      { id: 'm1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', status: 'pending',
        scheduled_at: '2026-04-01T12:00:00.000Z',
        team1_id: 'team-a',
        team2_id: 'team-b',
        team1_checkin_token: tok,
        team2_checkin_token: null,
        team1_checked_in_at: null,
        team2_checked_in_at: null,
        team1: { id: 'team-a', name: 'Alpha' },
        team2: { id: 'team-b', name: 'Bravo' },
      },
    ] as any;
    const res = makeRes();
    await checkinTokenHandler(
      makeReq({ method: 'POST', query: { token: tok } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.matches[0] as any).team1_checked_in_at).toBeTruthy();
  });

  it('POST 400 when match is finished', async () => {
    const tok = 'c'.repeat(32);
    store.matches = [
      { id: 'm1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', status: 'finished',
        scheduled_at: '2026-04-01T12:00:00.000Z',
        team1_id: 'team-a',
        team2_id: 'team-b',
        team1_checkin_token: tok,
        team2_checkin_token: null,
        team1_checked_in_at: null,
        team2_checked_in_at: null,
        team1: { id: 'team-a', name: 'Alpha' },
        team2: { id: 'team-b', name: 'Bravo' },
      },
    ] as any;
    const res = makeRes();
    await checkinTokenHandler(
      makeReq({ method: 'POST', query: { token: tok } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 405 on PATCH', async () => {
    const res = makeRes();
    await checkinTokenHandler(
      makeReq({ method: 'PATCH', query: { token: 'a'.repeat(32) } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/teams/leave
 * ---------------------------------------------------------*/

describe('POST /api/teams/leave', () => {
  it('returns 405 on non-POST', async () => {
    setAuthUser({ id: 'user-1' });
    const res = makeRes();
    await teamsLeaveHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 401 when no Bearer token', async () => {
    const res = makeRes();
    await teamsLeaveHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when token does not resolve to a user', async () => {
    setAuthUser(null);
    const res = makeRes();
    await teamsLeaveHandler(makeReq({ method: 'POST' }, true), res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when user has no team membership', async () => {
    setAuthUser({ id: 'user-1' });
    store.team_members = [];
    const res = makeRes();
    await teamsLeaveHandler(makeReq({ method: 'POST' }, true), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 403 when user is the captain of the team', async () => {
    setAuthUser({ id: 'user-1' });
    store.team_members = [
      { id: 'tm1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', team_id: 't1', user_id: 'user-1' },
    ] as any;
    store.teams = [{ id: 't1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', captain_id: 'user-1' }] as any;
    const res = makeRes();
    await teamsLeaveHandler(makeReq({ method: 'POST' }, true), res);
    expect(res.statusCode).toBe(403);
  });

  it('returns 409 when the roster is locked', async () => {
    setAuthUser({ id: 'user-1' });
    store.team_members = [
      { id: 'tm1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', team_id: 't1', user_id: 'user-1' },
    ] as any;
    store.teams = [{ id: 't1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', captain_id: 'someone-else' }] as any;
    store.tournament_teams = [{ tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', tournament_id: 'tour1', team_id: 't1' }] as any;
    const past = new Date(Date.now() - 60_000).toISOString();
    store.tournaments = [
      { id: 'tour1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', name: 'X',
        roster_locked_at: past,
        status: 'in_progress',
      },
    ] as any;

    const res = makeRes();
    await teamsLeaveHandler(makeReq({ method: 'POST' }, true), res);
    expect(res.statusCode).toBe(409);
  });

  it('200 when leaving cleanly — membership row is removed', async () => {
    setAuthUser({ id: 'user-1' });
    store.team_members = [
      { id: 'tm1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', team_id: 't1', user_id: 'user-1' },
    ] as any;
    store.teams = [{ id: 't1', tenant_id: 'ce69a726-773e-4d12-b5eb-d2503aa752b4', captain_id: 'someone-else' }] as any;
    store.tournament_teams = [];
    store.tournaments = [];
    const res = makeRes();
    await teamsLeaveHandler(makeReq({ method: 'POST' }, true), res);
    expect(res.statusCode).toBe(200);
    expect(store.team_members.length).toBe(0);
  });
});
