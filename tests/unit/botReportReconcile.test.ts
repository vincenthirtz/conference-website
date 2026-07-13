// tests/unit/botReportReconcile.test.ts
//
// POST /api/bot/v1/matches/[matchId]/report — wiring of the pure
// reconciliation logic (utils/matches/reconcile.ts) into the bot report
// handler (feature "Integrite des resultats & anti-triche", slice 1).
//
// Couvre les branches de ReconcileResult :
//   * agreed              -> applyMatchScore finalise (status finished)
//   * captain_disagreement -> match disputed + notif + event
//   * opponent_silent past deadline WITH evidence -> auto_resolved -> finalize
//   * opponent_silent past deadline WITHOUT evidence -> needs_arbitration
//
// Meme stratégie de mocks que playerReportScore.test.ts : applyMatchScore et
// ses dépendances (bracket/propagate, staffLogs, discord, botEvents…) sont
// mockés pour rester deterministe et hors-reseau.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  seedBotAuth,
} from './__helpers__/supabaseMock';
import { __resetBotIdempotencyCache } from '../../utils/botAuth';
import { __resetMaintenanceCache } from '../../utils/maintenance';
import handler from '../../pages/api/bot/v1/matches/[matchId]/report';

const TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const MATCH_ID = '550e8400-e29b-41d4-a716-446655440a01';
const TEAM_1 = '550e8400-e29b-41d4-a716-446655440b01';
const TEAM_2 = '550e8400-e29b-41d4-a716-446655440b02';
const CAP1 = '00000000-0000-0000-0000-0000000000c1';
const CAP2 = '00000000-0000-0000-0000-0000000000c2';
const DISCORD_1 = '900000000000000001';
const DISCORD_2 = '900000000000000002';
const TOURNAMENT_ID = '550e8400-e29b-41d4-a716-446655440d01';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'h', 'x-api-key': 'test-key', 'x-tenant-id': TENANT_ID },
    query: { matchId: MATCH_ID },
    body: { discordUserId: DISCORD_1, team1Score: 2, team2Score: 1 },
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
      team1: { id: TEAM_1, name: 'Phenix', captain_id: CAP1 },
      team2: { id: TEAM_2, name: 'Avoidgers', captain_id: CAP2 },
      tournament: { id: TOURNAMENT_ID, name: 'OW Womens Cup' },
      ...over,
    },
  ] as any;
  store.tournaments = [
    {
      id: TOURNAMENT_ID,
      tenant_id: TENANT_ID,
      status: 'in_progress',
      dispute_sla_minutes: 60,
    },
  ] as any;
  // dispute_sla_minutes lives on tenants; seed it so getSlaMinutes returns 60.
  store.tenants = [
    {
      id: TENANT_ID,
      plan: 'foundation',
      plan_status: 'active',
      plan_expires_at: null,
      dispute_sla_minutes: 60,
    },
  ] as any;
  store.teams = [
    { id: TEAM_1, tenant_id: TENANT_ID, name: 'Phenix', captain_id: CAP1 },
    { id: TEAM_2, tenant_id: TENANT_ID, name: 'Avoidgers', captain_id: CAP2 },
  ] as any;
  store.user_discord_links = [
    { auth_user_id: CAP1, discord_user_id: DISCORD_1 },
    { auth_user_id: CAP2, discord_user_id: DISCORD_2 },
  ] as any;
  store.match_evidence ||= [] as any;
  store.match_score_reports ||= [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  __resetMaintenanceCache();
  seedBotAuth({ tenantId: TENANT_ID, withTenantRow: false });
  store.site_settings = [
    { key: 'bot_maintenance_mode', value: 'false' },
  ] as any;
  seedMatch();
  propagateBracketForMatch.mockClear();
  notifyScoreReportDispute.mockClear();
  emitBotEvent.mockClear();
});

afterEach(async () => {
  await __resetBotIdempotencyCache();
});

describe('bot report — reconciliation branches', () => {
  it('agreed → finalize (applyMatchScore, status finished)', async () => {
    // Opponent (team2) already reported the matching canonical score.
    store.match_score_reports = [
      {
        id: 'rep-2',
        tenant_id: TENANT_ID,
        match_id: MATCH_ID,
        team_side: 2,
        reported_by_auth_user_id: CAP2,
        discord_user_id: DISCORD_2,
        team1_score: 2,
        team2_score: 1,
        reported_at: '2026-07-13T00:00:00.000Z',
      },
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res); // CAP1 reports 2-1, matching

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('finalized');
    expect(res.body.resolution).toBe('agreed');
    expect(store.matches[0].status).toBe('finished');
    expect(store.matches[0].team1_score).toBe(2);
    expect(store.matches[0].team2_score).toBe(1);
    expect(propagateBracketForMatch).toHaveBeenCalledTimes(1);
    expect(notifyScoreReportDispute).not.toHaveBeenCalled();
  });

  it('captain disagreement → match disputed + notif + event', async () => {
    store.match_score_reports = [
      {
        id: 'rep-2',
        tenant_id: TENANT_ID,
        match_id: MATCH_ID,
        team_side: 2,
        reported_by_auth_user_id: CAP2,
        discord_user_id: DISCORD_2,
        team1_score: 0,
        team2_score: 2,
        reported_at: '2026-07-13T00:00:00.000Z',
      },
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res); // CAP1 reports 2-1, conflicting

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('disputed');
    expect(store.matches[0].status).toBe('disputed');
    expect(String(store.matches[0].dispute_reason)).toContain('Desaccord');
    expect(propagateBracketForMatch).not.toHaveBeenCalled();
    expect(notifyScoreReportDispute).toHaveBeenCalledTimes(1);
    expect(emitBotEvent).toHaveBeenCalledWith(
      'match.disputed',
      expect.any(Object),
      TENANT_ID
    );
  });

  it('opponent silent past deadline WITH evidence → auto_resolved → finalize', async () => {
    // CAP1's own report is old (well past the 60-min SLA) and CAP1 attached
    // evidence. Re-reporting now triggers the auto-award branch.
    store.match_score_reports = [
      {
        id: 'rep-1',
        tenant_id: TENANT_ID,
        match_id: MATCH_ID,
        team_side: 1,
        reported_by_auth_user_id: CAP1,
        discord_user_id: DISCORD_1,
        team1_score: 2,
        team2_score: 1,
        reported_at: '2020-01-01T00:00:00.000Z',
      },
    ] as any;
    store.match_evidence = [
      {
        id: 'ev-1',
        tenant_id: TENANT_ID,
        match_id: MATCH_ID,
        team_side: 1,
        kind: 'screenshot',
      },
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res); // CAP1 re-reports 2-1

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('finalized');
    expect(res.body.resolution).toBe('auto_resolved');
    expect(typeof res.body.reason).toBe('string');
    expect(store.matches[0].status).toBe('finished');
    expect(store.matches[0].team1_score).toBe(2);
    expect(store.matches[0].team2_score).toBe(1);
    expect(propagateBracketForMatch).toHaveBeenCalledTimes(1);

    // Flush fire-and-forget logPlayerAction (void) before asserting the audit row.
    await new Promise((r) => setTimeout(r, 0));

    // Auditable: an auto_resolved report_score action was logged.
    const autoLog = (store.bot_player_actions ?? []).find(
      (a: any) => a.payload?.auto_resolved === true
    );
    expect(autoLog).toBeTruthy();
  });

  it('opponent silent past deadline WITHOUT evidence → needs_arbitration (disputed)', async () => {
    store.match_score_reports = [
      {
        id: 'rep-1',
        tenant_id: TENANT_ID,
        match_id: MATCH_ID,
        team_side: 1,
        reported_by_auth_user_id: CAP1,
        discord_user_id: DISCORD_1,
        team1_score: 2,
        team2_score: 1,
        reported_at: '2020-01-01T00:00:00.000Z',
      },
    ] as any;
    store.match_evidence = [] as any;

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('disputed');
    expect(store.matches[0].status).toBe('disputed');
    expect(String(store.matches[0].dispute_reason)).toContain('unilateral');
    expect(propagateBracketForMatch).not.toHaveBeenCalled();
  });

  it('first fresh report with no opponent → awaiting_opponent (no-op)', async () => {
    store.match_score_reports = [] as any;
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('awaiting_opponent');
    expect(store.matches[0].status).toBe('pending');
    expect(propagateBracketForMatch).not.toHaveBeenCalled();
  });
});
