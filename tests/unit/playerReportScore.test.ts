// tests/unit/playerReportScore.test.ts
//
// POST /api/player/matches/[matchId]/report-score — self-report de score par
// un capitaine depuis le site (pendant web du handler bot). Couvre :
//   * 401 non authentifie
//   * 403 non-capitaine
//   * 200 premier report (status inchange, awaiting_opponent)
//   * accord -> match finished (applyMatchScore appele)
//   * desaccord -> match disputed
//   * idempotence (re-report met a jour sans creer de doublon)

import { describe, it, expect, vi, beforeEach } from 'vitest';

// applyMatchScore importe bracket/propagate, staffLogs, standingsCache,
// autoAdvance et discord. On les mocke pour garder le test deterministe et
// hors-reseau (meme strategie que applyMatchScoreAsync.test.ts).
const {
  resetPropagationForMatch,
  propagateBracketForMatch,
  snapshotPropagationSlots,
  restorePropagationSlots,
  logStaffAction,
  invalidateStandingsCache,
  tryAutoAdvanceFromMatch,
  notifyMatchResult,
  notifyBracketUpdate,
  postMvpPoll,
  notifyScoreReportDispute,
  emitBotEvent,
  enrichMatchEvent,
} = vi.hoisted(() => ({
  resetPropagationForMatch: vi.fn(async () => undefined),
  propagateBracketForMatch: vi.fn(async (matchId: string) => ({
    matchId,
    winnerTeamId: null,
    loserTeamId: null,
    updatedWinMatchId: null,
    updatedLoseMatchId: null,
  })),
  snapshotPropagationSlots: vi.fn(async () => ({
    winMatchId: null,
    winSlotField: null,
    winSlotValue: null,
    loseMatchId: null,
    loseSlotField: null,
    loseSlotValue: null,
  })),
  restorePropagationSlots: vi.fn(async () => undefined),
  logStaffAction: vi.fn(async () => undefined),
  invalidateStandingsCache: vi.fn(() => undefined),
  tryAutoAdvanceFromMatch: vi.fn(async () => undefined),
  notifyMatchResult: vi.fn(async () => undefined),
  notifyBracketUpdate: vi.fn(async () => undefined),
  postMvpPoll: vi.fn(async () => ({ posted: false })),
  notifyScoreReportDispute: vi.fn(async () => undefined),
  emitBotEvent: vi.fn(async () => ({ ok: true })),
  enrichMatchEvent: vi.fn(async () => null),
}));

vi.mock('../../utils/bracket/propagate', () => ({
  resetPropagationForMatch,
  propagateBracketForMatch,
  snapshotPropagationSlots,
  restorePropagationSlots,
  computeWinnerLoserFromMatch: () => ({
    winnerTeamId: null,
    loserTeamId: null,
  }),
}));
vi.mock('../../utils/bracket/snapshot', () => ({
  createBracketSnapshot: vi.fn(async () => undefined),
}));
vi.mock('../../utils/staffLogs', () => ({ logStaffAction }));
vi.mock('../../utils/stages/standingsCache', () => ({
  invalidateStandingsCache,
  setCachedStandings: vi.fn(),
  getCachedStandings: vi.fn(() => null),
  invalidateAllStandingsCache: vi.fn(),
}));
vi.mock('../../utils/stages/autoAdvance', () => ({ tryAutoAdvanceFromMatch }));
vi.mock('../../utils/discord', () => ({
  notifyMatchResult,
  notifyBracketUpdate,
  postMvpPoll,
  notifyScoreReportDispute,
}));
vi.mock('../../utils/botEvents', () => ({ emitBotEvent }));
vi.mock('../../utils/matches/botEventEnrich', () => ({ enrichMatchEvent }));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import handler from '../../pages/api/player/matches/[matchId]/report-score';

const TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const MATCH_ID = '550e8400-e29b-41d4-a716-446655440a01';
const TEAM_1 = '550e8400-e29b-41d4-a716-446655440b01';
const TEAM_2 = '550e8400-e29b-41d4-a716-446655440b02';
const CAP1 = '00000000-0000-0000-0000-0000000000c1';
const CAP2 = '00000000-0000-0000-0000-0000000000c2';
const OUTSIDER = '00000000-0000-0000-0000-0000000000ff';
const TOURNAMENT_ID = '550e8400-e29b-41d4-a716-446655440d01';

let _bearer = 0;
function freshBearer() {
  _bearer += 1;
  return `Bearer t-${Date.now()}-${_bearer}`;
}

function makeReq(over: Partial<any> = {}, includeAuth = true): any {
  const headers: Record<string, string> = { host: 'h' };
  if (includeAuth) headers.authorization = freshBearer();
  return {
    method: 'POST',
    headers,
    query: { matchId: MATCH_ID },
    body: { team1Score: 2, team2Score: 1 },
    ...over,
  };
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

function seedMatch(over: Partial<Record<string, unknown>> = {}) {
  store.matches = [
    {
      id: MATCH_ID,
      tenant_id: TENANT_ID,
      tournament_id: TOURNAMENT_ID,
      scrim_id: null,
      stage_id: 'stage-1',
      status: 'pending',
      is_bye: false,
      match_format: 'bo3',
      team1_id: TEAM_1,
      team2_id: TEAM_2,
      team1_score: null,
      team2_score: null,
      winner_team_id: null,
      forfeit_team_id: null,
      completed_at: null,
      veto_locked_at: null,
      next_match_win_id: null,
      next_match_win_slot: null,
      next_match_lose_id: null,
      next_match_lose_slot: null,
      // Embedded relations (resolved by the mock's select chain).
      team1: { id: TEAM_1, name: 'Phenix', captain_id: CAP1 },
      team2: { id: TEAM_2, name: 'Avoidgers', captain_id: CAP2 },
      tournament: { id: TOURNAMENT_ID, name: 'OW Womens Cup' },
      ...over,
    },
  ] as any;
  store.tournaments = [
    { id: TOURNAMENT_ID, tenant_id: TENANT_ID, status: 'in_progress' },
  ] as any;
  store.teams = [
    { id: TEAM_1, tenant_id: TENANT_ID, name: 'Phenix', logo_url: null },
    { id: TEAM_2, tenant_id: TENANT_ID, name: 'Avoidgers', logo_url: null },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  setAuthUser({ id: CAP1 });
  resetPropagationForMatch.mockClear();
  propagateBracketForMatch.mockClear();
  notifyMatchResult.mockClear();
  notifyScoreReportDispute.mockClear();
  emitBotEvent.mockClear();
});

describe('/api/player/matches/[matchId]/report-score — guards', () => {
  it('rejects non-POST with 405', async () => {
    seedMatch();
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('rejects unauthenticated requests with 401', async () => {
    seedMatch();
    const res = makeRes();
    await handler(makeReq({}, /* includeAuth */ false), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects invalid scores with 400', async () => {
    seedMatch();
    const res = makeRes();
    await handler(makeReq({ body: { team1Score: -1, team2Score: 0 } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when the match does not exist', async () => {
    store.matches = [];
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when the user is not a captain of either team', async () => {
    seedMatch();
    setAuthUser({ id: OUTSIDER });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(403);
    expect(store.match_score_reports ?? []).toHaveLength(0);
  });

  it('returns 409 when the match is already finished', async () => {
    seedMatch({ status: 'finished' });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('MATCH_FINALIZED');
  });
});

describe('/api/player/matches/[matchId]/report-score — first report', () => {
  it('stores the report and waits for the opponent (status unchanged)', async () => {
    seedMatch();
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('awaiting_opponent');
    expect(res.body.mySide).toBe(1);

    // One report stored, with discord_user_id null + auth user id set.
    expect(store.match_score_reports).toHaveLength(1);
    const rep = store.match_score_reports[0];
    expect(rep.team_side).toBe(1);
    expect(rep.reported_by_auth_user_id).toBe(CAP1);
    expect(rep.discord_user_id).toBeNull();
    expect(rep.team1_score).toBe(2);
    expect(rep.team2_score).toBe(1);

    // Match untouched (still pending), no finalize / dispute.
    expect(store.matches[0].status).toBe('pending');
    expect(propagateBracketForMatch).not.toHaveBeenCalled();
    expect(notifyScoreReportDispute).not.toHaveBeenCalled();
  });

  it('captain 2 reports from the team2 perspective (mySide=2)', async () => {
    seedMatch();
    setAuthUser({ id: CAP2 });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.mySide).toBe(2);
    expect(store.match_score_reports[0].team_side).toBe(2);
  });
});

describe('/api/player/matches/[matchId]/report-score — reconciliation', () => {
  it('finalizes the match when both reports agree', async () => {
    seedMatch();
    // Opponent (team2) already reported the same score.
    store.match_score_reports = [
      {
        id: 'rep-2',
        tenant_id: TENANT_ID,
        match_id: MATCH_ID,
        team_side: 2,
        reported_by_auth_user_id: CAP2,
        discord_user_id: null,
        team1_score: 2,
        team2_score: 1,
      },
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res); // CAP1 reports 2-1, matching

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('finalized');
    expect(res.body.winnerTeamId).toBe(TEAM_1);

    // applyMatchScore ran: status finished + bracket propagation.
    expect(store.matches[0].status).toBe('finished');
    expect(store.matches[0].team1_score).toBe(2);
    expect(store.matches[0].team2_score).toBe(1);
    expect(propagateBracketForMatch).toHaveBeenCalledTimes(1);
    expect(notifyScoreReportDispute).not.toHaveBeenCalled();
  });

  it('marks the match disputed when reports disagree', async () => {
    seedMatch();
    // Opponent reported a different score.
    store.match_score_reports = [
      {
        id: 'rep-2',
        tenant_id: TENANT_ID,
        match_id: MATCH_ID,
        team_side: 2,
        reported_by_auth_user_id: CAP2,
        discord_user_id: null,
        team1_score: 0,
        team2_score: 2,
      },
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res); // CAP1 reports 2-1, conflicting

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('disputed');
    expect(store.matches[0].status).toBe('disputed');
    expect(store.matches[0].dispute_reason).toContain('Desaccord');
    // Not finalized.
    expect(propagateBracketForMatch).not.toHaveBeenCalled();
    // Tournament match -> staff notification fired.
    expect(notifyScoreReportDispute).toHaveBeenCalledTimes(1);
    expect(emitBotEvent).toHaveBeenCalledWith(
      'match.disputed',
      expect.any(Object),
      TENANT_ID
    );
  });
});

describe('/api/player/matches/[matchId]/report-score — idempotence', () => {
  it('re-report updates the existing row without creating a duplicate', async () => {
    seedMatch();
    const res1 = makeRes();
    await handler(makeReq({ body: { team1Score: 2, team2Score: 0 } }), res1);
    expect(res1.statusCode).toBe(200);
    expect(store.match_score_reports).toHaveLength(1);
    expect(store.match_score_reports[0].team1_score).toBe(2);
    expect(store.match_score_reports[0].team2_score).toBe(0);

    // Same captain corrects the score.
    const res2 = makeRes();
    await handler(makeReq({ body: { team1Score: 2, team2Score: 1 } }), res2);
    expect(res2.statusCode).toBe(200);
    // Still a single row (upsert on (match_id, team_side)).
    expect(store.match_score_reports).toHaveLength(1);
    expect(store.match_score_reports[0].team_side).toBe(1);
    expect(store.match_score_reports[0].team1_score).toBe(2);
    expect(store.match_score_reports[0].team2_score).toBe(1);
  });
});
