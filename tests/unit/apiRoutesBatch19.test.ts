import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

vi.mock('@/utils/rateLimit', () => ({
  applyRateLimit: () => false,
  getClientIp: () => '127.0.0.1',
}));

const { notifyScrimRequest, sendTeamJoinEmail, sendWelcomeEmail } = vi.hoisted(
  () => ({
    notifyScrimRequest: vi.fn(async () => undefined),
    sendTeamJoinEmail: vi.fn(async () => undefined),
    sendWelcomeEmail: vi.fn(async () => undefined),
  })
);

vi.mock('@/utils/discord', () => ({ notifyScrimRequest }));
vi.mock('@/utils/email', () => ({ sendTeamJoinEmail, sendWelcomeEmail }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setCookieUser,
  setAuthListUsers,
  setAdminUser,
  setCreateUserResult,
} from './__helpers__/supabaseMock';

import scrimHandler from '../../pages/api/demandes/scrim';
import teamAddMemberHandler from '../../pages/api/teams/add-member';
import searchPlayersHandler from '../../pages/api/teams/search-players';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

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
  notifyScrimRequest.mockClear();
  sendTeamJoinEmail.mockClear();
});

/* -----------------------------------------------------------
 * /api/demandes/scrim
 * ---------------------------------------------------------*/

describe('/api/demandes/scrim', () => {
  it('401 without Bearer', async () => {
    const res = makeRes();
    await scrimHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('GET 200 returns own scrim demandes', async () => {
    setAuthUser({ id: 'user-1' });
    store.demandes = [
      {
        id: 'd1',
        user_id: 'user-1',
        type: 'scrim',
        status: 'pending',
        created_at: '2026',
      },
      {
        id: 'd2',
        user_id: 'user-1',
        type: 'join',
        status: 'pending',
        created_at: '2026',
      },
    ] as any;
    const res = makeRes();
    await scrimHandler(makeReq({ method: 'GET' }, true), res);
    expect((res.body as any).demandes.map((d: any) => d.id)).toEqual(['d1']);
  });

  it('POST 400 when teamId missing', async () => {
    setAuthUser({ id: 'user-1' });
    const res = makeRes();
    await scrimHandler(
      makeReq({ method: 'POST', body: {} }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when message too long', async () => {
    setAuthUser({ id: 'user-1' });
    const res = makeRes();
    await scrimHandler(
      makeReq(
        {
          method: 'POST',
          body: { teamId: 'team-x', message: 'a'.repeat(1001) },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when user is not in any team', async () => {
    setAuthUser({ id: 'user-1' });
    store.team_members = [];
    const res = makeRes();
    await scrimHandler(
      makeReq(
        { method: 'POST', body: { teamId: 'team-x' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 403 when user not captain', async () => {
    setAuthUser({ id: 'user-1' });
    store.team_members = [
      { id: 'tm1', user_id: 'user-1', team_id: 'my-team' },
    ] as any;
    store.teams = [
      { id: 'my-team', captain_id: 'someone-else', name: 'Mine' },
    ] as any;
    const res = makeRes();
    await scrimHandler(
      makeReq(
        { method: 'POST', body: { teamId: 'target' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('POST 400 when scrim against own team', async () => {
    setAuthUser({ id: 'user-1' });
    store.team_members = [
      { id: 'tm1', user_id: 'user-1', team_id: 'my-team' },
    ] as any;
    store.teams = [
      { id: 'my-team', captain_id: 'user-1', name: 'Mine' },
    ] as any;
    const res = makeRes();
    await scrimHandler(
      makeReq(
        { method: 'POST', body: { teamId: 'my-team' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when target team unknown', async () => {
    setAuthUser({ id: 'user-1' });
    store.team_members = [
      { id: 'tm1', user_id: 'user-1', team_id: 'my-team' },
    ] as any;
    store.teams = [
      { id: 'my-team', captain_id: 'user-1', name: 'Mine', is_active: true },
    ] as any;
    const res = makeRes();
    await scrimHandler(
      makeReq(
        { method: 'POST', body: { teamId: 'unknown' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when an existing pending scrim demande targets the same team', async () => {
    setAuthUser({ id: 'user-1' });
    store.team_members = [
      { id: 'tm1', user_id: 'user-1', team_id: 'my-team' },
    ] as any;
    store.teams = [
      { id: 'my-team', captain_id: 'user-1', name: 'Mine', is_active: true },
      { id: 'target', captain_id: null, name: 'Target', is_active: true },
    ] as any;
    store.demandes = [
      {
        id: 'existing',
        user_id: 'user-1',
        type: 'scrim',
        team_id: 'target',
        status: 'pending',
      },
    ] as any;
    const res = makeRes();
    await scrimHandler(
      makeReq(
        { method: 'POST', body: { teamId: 'target' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 400 when preferredDate is invalid', async () => {
    setAuthUser({ id: 'user-1' });
    store.team_members = [
      { id: 'tm1', user_id: 'user-1', team_id: 'my-team' },
    ] as any;
    store.teams = [
      { id: 'my-team', captain_id: 'user-1', name: 'Mine', is_active: true },
      { id: 'target', captain_id: null, name: 'Target', is_active: true },
    ] as any;
    store.demandes = [];
    const res = makeRes();
    await scrimHandler(
      makeReq(
        {
          method: 'POST',
          body: { teamId: 'target', preferredDate: 'not-a-date' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 201 creates demande + fires Discord notification', async () => {
    setAuthUser({
      id: 'user-1',
      email: 'me@me.com',
      user_metadata: { display_name: 'Me' },
    });
    store.team_members = [
      { id: 'tm1', user_id: 'user-1', team_id: 'my-team' },
    ] as any;
    store.teams = [
      { id: 'my-team', captain_id: 'user-1', name: 'Mine', is_active: true },
      { id: 'target', captain_id: null, name: 'Target', is_active: true },
    ] as any;
    store.demandes = [];

    const res = makeRes();
    await scrimHandler(
      makeReq(
        {
          method: 'POST',
          body: {
            teamId: 'target',
            message: 'Looking forward!',
            preferredDate: '2026-05-01T18:00:00Z',
          },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((store.demandes as any).length).toBe(1);
    expect(notifyScrimRequest).toHaveBeenCalledOnce();
    const args = notifyScrimRequest.mock.calls[0][0] as any;
    expect(args.fromTeamName).toBe('Mine');
    expect(args.targetTeamName).toBe('Target');
  });
});

/* -----------------------------------------------------------
 * /api/teams/add-member (captain)  — uses cookie auth
 * ---------------------------------------------------------*/

describe('POST /api/teams/add-member', () => {
  it('405 on non-POST', async () => {
    const res = makeRes();
    await teamAddMemberHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('401 when no cookie session', async () => {
    setCookieUser(null);
    const res = makeRes();
    await teamAddMemberHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('403 when user is not captain', async () => {
    setCookieUser({ id: 'user-1' });
    store.teams = [];
    const res = makeRes();
    await teamAddMemberHandler(
      makeReq({ method: 'POST', body: { battleTag: 'X#1234' } }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('409 when roster is locked', async () => {
    setCookieUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', captain_id: 'user-1', name: 'A', logo_url: null },
    ] as any;
    store.tournament_teams = [
      { tournament_id: 'tour-1', team_id: 'team-1' },
    ] as any;
    const past = new Date(Date.now() - 60_000).toISOString();
    store.tournaments = [
      {
        id: 'tour-1',
        name: 'X',
        roster_locked_at: past,
        status: 'in_progress',
      },
    ] as any;
    const res = makeRes();
    await teamAddMemberHandler(
      makeReq({
        method: 'POST',
        body: { userId: 'u-new', battleTag: 'Player#1234' },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
  });

  it('400 on invalid battle tag', async () => {
    setCookieUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', captain_id: 'user-1', name: 'A', logo_url: null },
    ] as any;
    store.tournament_teams = [];
    const res = makeRes();
    await teamAddMemberHandler(
      makeReq({
        method: 'POST',
        body: { userId: 'u-new', battleTag: 'no-hash' },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when neither userId nor email', async () => {
    setCookieUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', captain_id: 'user-1', name: 'A', logo_url: null },
    ] as any;
    store.tournament_teams = [];
    const res = makeRes();
    await teamAddMemberHandler(
      makeReq({ method: 'POST', body: { battleTag: 'X#1234' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 adds member by userId', async () => {
    setCookieUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', captain_id: 'user-1', name: 'A', logo_url: null },
    ] as any;
    store.tournament_teams = [];
    store.team_members = [];
    store.news = [];

    const res = makeRes();
    await teamAddMemberHandler(
      makeReq({
        method: 'POST',
        body: { userId: 'u-new', battleTag: 'Player#1234', role: 'player' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.team_members.length).toBe(1);
    expect((store.news as any).length).toBe(1);
  });

  it('200 resolves user by email when not provided directly', async () => {
    setCookieUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', captain_id: 'user-1', name: 'A', logo_url: null },
    ] as any;
    store.tournament_teams = [];
    store.team_members = [];
    store.news = [];
    setAuthListUsers([{ id: 'u-existing', email: 'known@example.com' }]);

    const res = makeRes();
    await teamAddMemberHandler(
      makeReq({
        method: 'POST',
        body: {
          email: 'known@example.com',
          battleTag: 'Player#1234',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.team_members[0] as any).user_id).toBe('u-existing');
    await new Promise((r) => setImmediate(r));
    expect(sendTeamJoinEmail).toHaveBeenCalled();
  });

  it('200 auto-creates a Supabase user when email is unknown', async () => {
    setCookieUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', captain_id: 'user-1', name: 'A', logo_url: null },
    ] as any;
    store.tournament_teams = [];
    store.team_members = [];
    store.news = [];
    setAuthListUsers([]); // no existing user
    setCreateUserResult({
      data: { user: { id: 'u-created', email: 'new@example.com' } },
      error: null,
    });

    const res = makeRes();
    await teamAddMemberHandler(
      makeReq({
        method: 'POST',
        body: {
          email: 'new@example.com',
          battleTag: 'Player#1234',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.team_members[0] as any).user_id).toBe('u-created');
  });

  it('400 when team has reached max_players for one of its tournaments', async () => {
    setCookieUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', captain_id: 'user-1', name: 'A', logo_url: null },
    ] as any;
    store.team_members = [
      { id: 'm1', team_id: 'team-1', role: 'player' },
      { id: 'm2', team_id: 'team-1', role: 'player' },
    ] as any;
    store.tournament_teams = [
      {
        team_id: 'team-1',
        tournament_id: 'tour-1',
        tournaments: { max_players: 2 },
      },
    ] as any;
    store.tournaments = []; // no roster lock

    const res = makeRes();
    await teamAddMemberHandler(
      makeReq({
        method: 'POST',
        body: {
          userId: 'u-new',
          battleTag: 'Player#1234',
          role: 'player',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});

/* -----------------------------------------------------------
 * /api/teams/search-players
 * ---------------------------------------------------------*/

describe('GET /api/teams/search-players', () => {
  it('405 on non-GET', async () => {
    const res = makeRes();
    await searchPlayersHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('401 without cookie session', async () => {
    setCookieUser(null);
    const res = makeRes();
    await searchPlayersHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('403 when user is not captain', async () => {
    setCookieUser({ id: 'user-1' });
    store.teams = [];
    const res = makeRes();
    await searchPlayersHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('400 when q too short', async () => {
    setCookieUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', captain_id: 'user-1', name: 'A' },
    ] as any;
    const res = makeRes();
    await searchPlayersHandler(
      makeReq({ method: 'GET', query: { q: 'a' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when q too long', async () => {
    setCookieUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', captain_id: 'user-1', name: 'A' },
    ] as any;
    const res = makeRes();
    await searchPlayersHandler(
      makeReq({ method: 'GET', query: { q: 'x'.repeat(101) } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 finds players by email and reports has_team', async () => {
    setCookieUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', captain_id: 'user-1', name: 'A' },
    ] as any;
    setAuthListUsers([
      { id: 'u1', email: 'alice@example.com' },
      { id: 'u2', email: 'bob@example.com' },
    ]);
    store.team_members = [
      { user_id: 'u1', battle_tag: 'Alice#1234' },
    ] as any;
    store.profiles = [];

    const res = makeRes();
    await searchPlayersHandler(
      makeReq({ method: 'GET', query: { q: 'alice' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const players = (res.body as any).players;
    const u1 = players.find((p: any) => p.id === 'u1');
    expect(u1).toBeTruthy();
    expect(u1.has_team).toBe(true);
    expect(u1.battle_tag).toBe('Alice#1234');
  });

  it('200 fills missing email via auth.admin.getUserById fallback', async () => {
    setCookieUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', captain_id: 'user-1', name: 'A' },
    ] as any;
    setAuthListUsers([]);
    store.team_members = [
      { user_id: 'u-bt', battle_tag: 'Mercy#1234' },
    ] as any;
    store.profiles = [];
    setAdminUser('u-bt', 'mercy@example.com');

    const res = makeRes();
    await searchPlayersHandler(
      makeReq({ method: 'GET', query: { q: 'mercy' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    const players = (res.body as any).players;
    const u = players.find((p: any) => p.id === 'u-bt');
    expect(u.email).toBe('mercy@example.com');
  });

  it('200 returns empty list when no source matches', async () => {
    setCookieUser({ id: 'user-1' });
    store.teams = [
      { id: 'team-1', captain_id: 'user-1', name: 'A' },
    ] as any;
    setAuthListUsers([]);
    store.team_members = [];
    store.profiles = [];

    const res = makeRes();
    await searchPlayersHandler(
      makeReq({ method: 'GET', query: { q: 'nothing' } }),
      res
    );
    expect((res.body as any).players).toEqual([]);
  });
});
