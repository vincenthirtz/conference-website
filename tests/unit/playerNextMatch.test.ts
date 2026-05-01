import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import nextMatchHandler from '../../pages/api/player/next-match';
import { CHECKIN_OPEN_MINUTES } from '../../utils/checkin';

const USER_ID = '00000000-0000-0000-0000-0000000000aa';
const TEAM_ID = '00000000-0000-0000-0000-0000000000bb';
const OTHER_TEAM_ID = '00000000-0000-0000-0000-0000000000cc';
const TOURNAMENT_ID = '00000000-0000-0000-0000-0000000000dd';
const MATCH_ID = '00000000-0000-0000-0000-0000000000ee';

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

function seedTeamMembership() {
  store.team_members = [
    {
      id: 'tm-1',
      team_id: TEAM_ID,
      user_id: USER_ID,
      role: 'player',
    },
  ];
}

function seedMatch(over: Record<string, unknown> = {}) {
  store.matches = [
    {
      id: MATCH_ID,
      tournament_id: TOURNAMENT_ID,
      status: 'pending',
      scheduled_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      match_format: 'bo3',
      round_name: 'Round 1',
      stream_url: null,
      team1_id: TEAM_ID,
      team2_id: OTHER_TEAM_ID,
      team1_checkin_token: 'token-team1',
      team2_checkin_token: 'token-team2',
      team1_checked_in_at: null,
      team2_checked_in_at: null,
      // Embedded relations consumed by the handler. The mock returns these
      // verbatim because PostgREST embeds (`team1:team1_id(...)`) are passed
      // through unchanged.
      team1: { id: TEAM_ID, name: 'Phenix' },
      team2: { id: OTHER_TEAM_ID, name: 'Avoidgers' },
      tournament: {
        id: TOURNAMENT_ID,
        name: 'OW Womens Cup 2026',
        slug: 'ow-womens-cup-2026',
      },
      ...over,
    },
  ];
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: USER_ID });
});

describe('/api/player/next-match — guards', () => {
  it('rejects POST with 405', async () => {
    const res = makeRes();
    await nextMatchHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = makeRes();
    await nextMatchHandler(makeReq({}, /* includeAuth */ false), res);
    expect(res.statusCode).toBe(401);
  });

  it('returns null payload when the user has no team', async () => {
    store.team_members = [];
    const res = makeRes();
    await nextMatchHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      match: null,
      team: null,
      opponent: null,
      tournament: null,
      checkin: null,
    });
  });

  it('returns null payload when the team has no upcoming match', async () => {
    seedTeamMembership();
    store.matches = [];
    const res = makeRes();
    await nextMatchHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.match).toBeNull();
    expect(res.body.team).toBeNull();
  });
});

describe('/api/player/next-match — payload shape', () => {
  it('returns the next pending match with tournament/round/format', async () => {
    seedTeamMembership();
    seedMatch();
    const res = makeRes();
    await nextMatchHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.match.id).toBe(MATCH_ID);
    expect(res.body.match.format).toBe('bo3');
    expect(res.body.match.bestOf).toBe(3);
    expect(res.body.match.roundName).toBe('Round 1');
    expect(res.body.match.streamUrl).toBeNull();
    expect(res.body.tournament).toEqual({
      id: TOURNAMENT_ID,
      name: 'OW Womens Cup 2026',
      slug: 'ow-womens-cup-2026',
    });
  });

  it('infers bestOf from "BO5" uppercase format strings', async () => {
    seedTeamMembership();
    seedMatch({ match_format: 'BO5' });
    const res = makeRes();
    await nextMatchHandler(makeReq(), res);
    expect(res.body.match.bestOf).toBe(5);
  });

  it('returns null bestOf when match_format is unparseable', async () => {
    seedTeamMembership();
    seedMatch({ match_format: 'custom' });
    const res = makeRes();
    await nextMatchHandler(makeReq(), res);
    expect(res.body.match.bestOf).toBeNull();
  });

  it('reports the user as team1 (slot 1) and the other side as opponent', async () => {
    seedTeamMembership();
    seedMatch();
    const res = makeRes();
    await nextMatchHandler(makeReq(), res);
    expect(res.body.team).toEqual({
      id: TEAM_ID,
      name: 'Phenix',
      slot: 1,
    });
    expect(res.body.opponent).toEqual({
      id: OTHER_TEAM_ID,
      name: 'Avoidgers',
    });
  });

  it('reports the user as team2 (slot 2) when only team2 matches the membership', async () => {
    seedTeamMembership();
    seedMatch({
      team1_id: OTHER_TEAM_ID,
      team2_id: TEAM_ID,
      team1: { id: OTHER_TEAM_ID, name: 'Avoidgers' },
      team2: { id: TEAM_ID, name: 'Phenix' },
    });
    const res = makeRes();
    await nextMatchHandler(makeReq(), res);
    expect(res.body.team.slot).toBe(2);
    expect(res.body.team.name).toBe('Phenix');
    expect(res.body.opponent.name).toBe('Avoidgers');
  });
});

describe('/api/player/next-match — check-in window', () => {
  it('marks the window as open when scheduled in 30 min', async () => {
    seedTeamMembership();
    seedMatch({
      scheduled_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
    const res = makeRes();
    await nextMatchHandler(makeReq(), res);
    expect(res.body.checkin.isOpen).toBe(true);
    expect(res.body.checkin.isPassed).toBe(false);
    expect(res.body.checkin.alreadyCheckedIn).toBe(false);
    expect(res.body.checkin.token).toBe('token-team1');
  });

  it('marks the window as not yet open when scheduled in 2 hours', async () => {
    seedTeamMembership();
    seedMatch({
      scheduled_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
    });
    const res = makeRes();
    await nextMatchHandler(makeReq(), res);
    expect(res.body.checkin.isOpen).toBe(false);
    expect(res.body.checkin.isPassed).toBe(false);
  });

  it('exposes opensAt = scheduledAt - CHECKIN_OPEN_MINUTES', async () => {
    seedTeamMembership();
    const scheduledAt = new Date(Date.now() + 30 * 60_000).toISOString();
    seedMatch({ scheduled_at: scheduledAt });
    const res = makeRes();
    await nextMatchHandler(makeReq(), res);
    const expectedOpens = new Date(
      new Date(scheduledAt).getTime() - CHECKIN_OPEN_MINUTES * 60_000
    ).toISOString();
    expect(res.body.checkin.opensAt).toBe(expectedOpens);
    expect(res.body.checkin.closesAt).toBe(scheduledAt);
  });

  it('marks alreadyCheckedIn=true when team1_checked_in_at is set', async () => {
    seedTeamMembership();
    seedMatch({
      team1_checked_in_at: '2026-09-18T19:00:00.000Z',
    });
    const res = makeRes();
    await nextMatchHandler(makeReq(), res);
    expect(res.body.checkin.alreadyCheckedIn).toBe(true);
    expect(res.body.checkin.checkedInAt).toBe('2026-09-18T19:00:00.000Z');
  });

  it("uses team2's check-in token/state when the user is team2", async () => {
    seedTeamMembership();
    seedMatch({
      team1_id: OTHER_TEAM_ID,
      team2_id: TEAM_ID,
      team1: { id: OTHER_TEAM_ID, name: 'Avoidgers' },
      team2: { id: TEAM_ID, name: 'Phenix' },
      team2_checked_in_at: '2026-09-18T19:05:00.000Z',
    });
    const res = makeRes();
    await nextMatchHandler(makeReq(), res);
    expect(res.body.checkin.token).toBe('token-team2');
    expect(res.body.checkin.alreadyCheckedIn).toBe(true);
    expect(res.body.checkin.checkedInAt).toBe('2026-09-18T19:05:00.000Z');
  });
});
