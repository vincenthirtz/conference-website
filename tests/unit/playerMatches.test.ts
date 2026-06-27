import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import matchesHandler from '../../pages/api/player/matches';
import { CHECKIN_OPEN_MINUTES } from '../../utils/checkin';

const USER_ID = '00000000-0000-0000-0000-0000000000aa';
const TEAM_ID = '00000000-0000-0000-0000-0000000000bb';
const OTHER_TEAM_ID = '00000000-0000-0000-0000-0000000000cc';
const TOURNAMENT_ID = '00000000-0000-0000-0000-0000000000dd';
const UPCOMING_ID = '00000000-0000-0000-0000-0000000000e1';
const PAST_WIN_ID = '00000000-0000-0000-0000-0000000000e2';
const PAST_LOSS_ID = '00000000-0000-0000-0000-0000000000e3';

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

const teamPhenix = { id: TEAM_ID, name: 'Phenix' };
const teamAvoid = { id: OTHER_TEAM_ID, name: 'Avoidgers' };

function seedTeamMembership() {
  store.team_members = [
    { id: 'tm-1', team_id: TEAM_ID, user_id: USER_ID, role: 'player' },
  ];
  // The handler resolves the team name from `teams` (independent of matches),
  // so a player with a team but zero matches still gets a non-null team.
  store.teams = [teamPhenix, teamAvoid];
}

const tournament = {
  id: TOURNAMENT_ID,
  name: 'OW Womens Cup 2026',
  slug: 'ow-womens-cup-2026',
};

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: USER_ID });
});

describe('/api/player/matches — guards', () => {
  it('rejects POST with 405', async () => {
    const res = makeRes();
    await matchesHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = makeRes();
    await matchesHandler(makeReq({}, /* includeAuth */ false), res);
    expect(res.statusCode).toBe(401);
  });

  it('returns { team: null, matches: [] } when the user has no team', async () => {
    store.team_members = [];
    const res = makeRes();
    await matchesHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ team: null, matches: [] });
  });

  it('returns the team with an empty matches array when no matches exist', async () => {
    seedTeamMembership();
    store.matches = [];
    const res = makeRes();
    await matchesHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.matches).toEqual([]);
    // Team name comes from the `teams` lookup, so it's present even with zero
    // matches — the UI relies on this to tell "no team" from "no matches".
    expect(res.body.team).toEqual({ id: TEAM_ID, name: 'Phenix' });
  });
});

describe('/api/player/matches — list shaping', () => {
  it('returns upcoming (check-in populated) + completed (score/result derived)', async () => {
    seedTeamMembership();
    const upcomingScheduledAt = new Date(
      Date.now() + 30 * 60_000
    ).toISOString();

    store.matches = [
      // Upcoming pending match — user is team1, check-in window open.
      {
        id: UPCOMING_ID,
        tournament_id: TOURNAMENT_ID,
        status: 'pending',
        scheduled_at: upcomingScheduledAt,
        match_format: 'bo3',
        round_name: 'Quarterfinal',
        stream_url: null,
        team1_id: TEAM_ID,
        team2_id: OTHER_TEAM_ID,
        team1_score: null,
        team2_score: null,
        winner_team_id: null,
        team1_checkin_token: 'token-team1',
        team2_checkin_token: 'token-team2',
        team1_checked_in_at: null,
        team2_checked_in_at: null,
        team1: teamPhenix,
        team2: teamAvoid,
        tournament,
      },
      // Completed WIN — user is team1, won 2-1.
      {
        id: PAST_WIN_ID,
        tournament_id: TOURNAMENT_ID,
        status: 'completed',
        scheduled_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
        match_format: 'BO3',
        round_name: 'Group Stage',
        stream_url: 'https://twitch.tv/x',
        team1_id: TEAM_ID,
        team2_id: OTHER_TEAM_ID,
        team1_score: 2,
        team2_score: 1,
        winner_team_id: TEAM_ID,
        team1_checkin_token: null,
        team2_checkin_token: null,
        team1_checked_in_at: null,
        team2_checked_in_at: null,
        team1: teamPhenix,
        team2: teamAvoid,
        tournament,
      },
      // Completed LOSS — user is team2, lost 0-2.
      {
        id: PAST_LOSS_ID,
        tournament_id: TOURNAMENT_ID,
        status: 'completed',
        scheduled_at: new Date(Date.now() - 5 * 3600_000).toISOString(),
        match_format: 'bo3',
        round_name: 'Group Stage',
        stream_url: null,
        team1_id: OTHER_TEAM_ID,
        team2_id: TEAM_ID,
        team1_score: 2,
        team2_score: 0,
        winner_team_id: OTHER_TEAM_ID,
        team1_checkin_token: null,
        team2_checkin_token: null,
        team1_checked_in_at: null,
        team2_checked_in_at: null,
        team1: teamAvoid,
        team2: teamPhenix,
        tournament,
      },
    ];

    const res = makeRes();
    await matchesHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('private, max-age=15');
    expect(res.body.team).toEqual({ id: TEAM_ID, name: 'Phenix' });
    expect(res.body.matches).toHaveLength(3);

    const byId = Object.fromEntries(
      res.body.matches.map((m: any) => [m.id, m])
    );

    // --- Upcoming ---
    const up = byId[UPCOMING_ID];
    expect(up.status).toBe('pending');
    expect(up.slot).toBe(1);
    expect(up.opponent).toEqual({ id: OTHER_TEAM_ID, name: 'Avoidgers' });
    expect(up.bestOf).toBe(3);
    expect(up.score).toBeNull();
    expect(up.result).toBeNull();
    expect(up.checkin).not.toBeNull();
    expect(up.checkin.token).toBe('token-team1');
    expect(up.checkin.isOpen).toBe(true);
    expect(up.checkin.isPassed).toBe(false);
    expect(up.checkin.alreadyCheckedIn).toBe(false);
    const expectedOpens = new Date(
      new Date(upcomingScheduledAt).getTime() - CHECKIN_OPEN_MINUTES * 60_000
    ).toISOString();
    expect(up.checkin.opensAt).toBe(expectedOpens);
    expect(up.checkin.closesAt).toBe(upcomingScheduledAt);

    // --- Completed WIN (team1) ---
    const win = byId[PAST_WIN_ID];
    expect(win.slot).toBe(1);
    expect(win.opponent).toEqual({ id: OTHER_TEAM_ID, name: 'Avoidgers' });
    expect(win.score).toEqual({ mine: 2, opponent: 1 });
    expect(win.result).toBe('win');
    expect(win.checkin).toBeNull();
    expect(win.streamUrl).toBe('https://twitch.tv/x');

    // --- Completed LOSS (team2) ---
    const loss = byId[PAST_LOSS_ID];
    expect(loss.slot).toBe(2);
    expect(loss.opponent).toEqual({ id: OTHER_TEAM_ID, name: 'Avoidgers' });
    // score is relative to the user's slot (team2): mine=0, opponent=2
    expect(loss.score).toEqual({ mine: 0, opponent: 2 });
    expect(loss.result).toBe('loss');
    expect(loss.checkin).toBeNull();
  });

  it('derives a draw for a completed match with equal scores and no winner', async () => {
    seedTeamMembership();
    store.matches = [
      {
        id: PAST_WIN_ID,
        tournament_id: TOURNAMENT_ID,
        status: 'completed',
        scheduled_at: new Date(Date.now() - 3600_000).toISOString(),
        match_format: 'bo2',
        round_name: 'Group Stage',
        stream_url: null,
        team1_id: TEAM_ID,
        team2_id: OTHER_TEAM_ID,
        team1_score: 1,
        team2_score: 1,
        winner_team_id: null,
        team1_checkin_token: null,
        team2_checkin_token: null,
        team1_checked_in_at: null,
        team2_checked_in_at: null,
        team1: teamPhenix,
        team2: teamAvoid,
        tournament,
      },
    ];

    const res = makeRes();
    await matchesHandler(makeReq(), res);
    const m = res.body.matches[0];
    expect(m.result).toBe('draw');
    expect(m.score).toEqual({ mine: 1, opponent: 1 });
  });
});
