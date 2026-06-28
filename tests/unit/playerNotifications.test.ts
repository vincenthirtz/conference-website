import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import notificationsHandler from '../../pages/api/player/notifications';

const USER_ID = '00000000-0000-0000-0000-000000000aa1';
const TEAM_ID = '00000000-0000-0000-0000-000000000bb1';
const OTHER_TEAM_ID = '00000000-0000-0000-0000-000000000cc1';
const MATCH_ID = '00000000-0000-0000-0000-000000000dd1';

let _bearer = 0;
function freshBearer() {
  _bearer += 1;
  return `Bearer t-${Date.now()}-${_bearer}`;
}

function makeReq(over: Partial<any> = {}, includeAuth = true): any {
  const headers: Record<string, string> = { host: 'h' };
  if (includeAuth) headers.authorization = freshBearer();
  return { method: 'GET', headers, query: {}, body: {}, ...over };
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

function seedCaptain() {
  store.teams = [
    { id: TEAM_ID, captain_id: USER_ID, is_active: true, name: 'Phenix' },
  ];
  // Captain is also a member.
  store.team_members = [
    { id: 'tm-cap', team_id: TEAM_ID, user_id: USER_ID, role: 'player' },
  ];
}

function seedMember() {
  store.teams = [];
  store.team_members = [
    { id: 'tm-mem', team_id: TEAM_ID, user_id: USER_ID, role: 'player' },
  ];
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: USER_ID });
});

describe('/api/player/notifications — guards', () => {
  it('rejects POST with 405', async () => {
    const res = makeRes();
    await notificationsHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = makeRes();
    await notificationsHandler(makeReq({}, false), res);
    expect(res.statusCode).toBe(401);
  });
});

describe('/api/player/notifications — no-team and member-only paths', () => {
  it('returns all-zero counts when the user has no team', async () => {
    store.teams = [];
    store.team_members = [];
    const res = makeRes();
    await notificationsHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      hasTeam: false,
      isCaptain: false,
      unreadMessages: 0,
      pendingScrims: 0,
      pendingJoinRequests: 0,
      checkinPending: 0,
      total: 0,
    });
  });

  it('member (not captain) gets zero captain-only counters', async () => {
    seedMember();
    // Even if there were unread messages or scrims targeting the team, a
    // non-captain shouldn't see them.
    store.demandes = [
      {
        id: 'msg-1',
        team_id: TEAM_ID,
        type: 'captain_message',
        status: 'pending',
      },
      {
        id: 'd-1',
        team_id: TEAM_ID,
        type: 'scrim',
        status: 'pending',
      },
    ];
    const res = makeRes();
    await notificationsHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.hasTeam).toBe(true);
    expect(res.body.isCaptain).toBe(false);
    expect(res.body.unreadMessages).toBe(0);
    expect(res.body.pendingScrims).toBe(0);
    expect(res.body.pendingJoinRequests).toBe(0);
  });
});

describe('/api/player/notifications — captain counters', () => {
  it('counts unread inter-captain messages addressed to the team', async () => {
    seedCaptain();
    store.demandes = [
      {
        id: 'm1',
        team_id: TEAM_ID,
        type: 'captain_message',
        status: 'pending',
      },
      {
        id: 'm2',
        team_id: TEAM_ID,
        type: 'captain_message',
        status: 'pending',
      },
      {
        id: 'm3',
        team_id: TEAM_ID,
        type: 'captain_message',
        status: 'approved', // already read → ignored
      },
    ];
    const res = makeRes();
    await notificationsHandler(makeReq(), res);
    expect(res.body.unreadMessages).toBe(2);
  });

  it('counts pending scrim and join requests targeting the team', async () => {
    seedCaptain();
    store.demandes = [
      {
        id: 'd1',
        team_id: TEAM_ID,
        type: 'scrim',
        status: 'pending',
      },
      {
        id: 'd2',
        team_id: TEAM_ID,
        type: 'scrim',
        status: 'approved', // ignored
      },
      {
        id: 'd3',
        team_id: TEAM_ID,
        type: 'join',
        status: 'pending',
      },
    ];
    const res = makeRes();
    await notificationsHandler(makeReq(), res);
    expect(res.body.pendingScrims).toBe(1);
    expect(res.body.pendingJoinRequests).toBe(1);
  });

  it('aggregates everything into a `total`', async () => {
    seedCaptain();
    store.demandes = [
      {
        id: 'm1',
        team_id: TEAM_ID,
        type: 'captain_message',
        status: 'pending',
      },
      {
        id: 'd1',
        team_id: TEAM_ID,
        type: 'scrim',
        status: 'pending',
      },
      {
        id: 'd2',
        team_id: TEAM_ID,
        type: 'join',
        status: 'pending',
      },
    ];
    const res = makeRes();
    await notificationsHandler(makeReq(), res);
    // 1 message + 1 scrim + 1 join + 0 checkin (no match seeded)
    expect(res.body.total).toBe(3);
  });
});

describe('/api/player/notifications — invitee pending invites', () => {
  it('counts pending invitations addressed to the user (un-scoped to a team)', async () => {
    // No team at all — invitee counter is independent of captain/manager status.
    store.teams = [];
    store.team_members = [];
    store.demandes = [
      {
        id: 'inv-1',
        user_id: USER_ID,
        team_id: TEAM_ID,
        type: 'invite',
        status: 'pending',
      },
      {
        id: 'inv-2',
        user_id: USER_ID,
        team_id: OTHER_TEAM_ID,
        type: 'invite',
        status: 'pending',
      },
      // already processed → ignored
      {
        id: 'inv-3',
        user_id: USER_ID,
        team_id: TEAM_ID,
        type: 'invite',
        status: 'approved',
      },
      // addressed to someone else → ignored
      {
        id: 'inv-4',
        user_id: '00000000-0000-0000-0000-0000000000ff',
        team_id: TEAM_ID,
        type: 'invite',
        status: 'pending',
      },
    ];
    const res = makeRes();
    await notificationsHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.pendingInvites).toBe(2);
    // No captain counters, no checkin → total is just the invites.
    expect(res.body.total).toBe(2);
  });
});

describe('/api/player/notifications — check-in pending flag', () => {
  function seedMatchInWindow(over: Record<string, unknown> = {}) {
    store.matches = [
      {
        id: MATCH_ID,
        status: 'pending',
        // 30 min from now → window is open
        scheduled_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        team1_id: TEAM_ID,
        team2_id: OTHER_TEAM_ID,
        team1_checked_in_at: null,
        team2_checked_in_at: null,
        ...over,
      },
    ];
  }

  it('flags checkinPending=1 when next match is open and not redeemed', async () => {
    seedCaptain();
    seedMatchInWindow();
    const res = makeRes();
    await notificationsHandler(makeReq(), res);
    expect(res.body.checkinPending).toBe(1);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it('flags checkinPending=0 when team1 already checked in', async () => {
    seedCaptain();
    seedMatchInWindow({
      team1_checked_in_at: new Date().toISOString(),
    });
    const res = makeRes();
    await notificationsHandler(makeReq(), res);
    expect(res.body.checkinPending).toBe(0);
  });

  it('flags checkinPending=0 when match is scheduled outside the window', async () => {
    seedCaptain();
    seedMatchInWindow({
      // 4 hours away — window not yet open
      scheduled_at: new Date(Date.now() + 4 * 3600_000).toISOString(),
    });
    const res = makeRes();
    await notificationsHandler(makeReq(), res);
    expect(res.body.checkinPending).toBe(0);
  });

  it("uses team2's checked_in_at when the captain's team is team2", async () => {
    seedCaptain();
    seedMatchInWindow({
      team1_id: OTHER_TEAM_ID,
      team2_id: TEAM_ID,
      team2_checked_in_at: new Date().toISOString(),
    });
    const res = makeRes();
    await notificationsHandler(makeReq(), res);
    expect(res.body.checkinPending).toBe(0);
  });
});
