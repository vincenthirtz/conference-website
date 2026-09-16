// tests/unit/scoreReportReopenPaths.test.ts
//
// Lot 1, reprise : fermer COMPLÈTEMENT la faille « un résultat écarté par le
// staff est rétabli par la seule capitaine gagnante ». Les routes de dispute
// purgeaient déjà ; restaient trois chemins de réouverture :
//   * PATCH /api/admin/matches/[matchId]         (finished → pending, mode meta ou score)
//   * PUT   /api/admin/stages/[stageId]/bulk-matches (statut en masse)
//   * PATCH /api/bot/v1/scrims/[scrimId]/matches/[matchId]
// Et le report depuis Discord (POST /api/bot/v1/matches/[matchId]/report)
// reçoit les gardes des constats 2, 4 et 5.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const {
  resetPropagationForMatch,
  propagateBracketForMatch,
  restorePropagationSlots,
  logStaffAction,
} = vi.hoisted(() => ({
  resetPropagationForMatch: vi.fn(async () => undefined),
  propagateBracketForMatch: vi.fn(async (_t: string, matchId: string) => ({
    matchId,
    winnerTeamId: null,
    loserTeamId: null,
    updatedWinMatchId: null,
    updatedLoseMatchId: null,
  })),
  restorePropagationSlots: vi.fn(async () => undefined),
  logStaffAction: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock('../../utils/bracket/propagate', () => ({
  resetPropagationForMatch,
  propagateBracketForMatch,
  snapshotPropagationSlots: vi.fn(async () => ({
    winMatchId: null,
    winSlotField: null,
    winSlotValue: null,
    loseMatchId: null,
    loseSlotField: null,
    loseSlotValue: null,
  })),
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
vi.mock('@/utils/staffLogs', () => ({ logStaffAction }));
vi.mock('../../utils/stages/standingsCache', () => ({
  invalidateStandingsCache: vi.fn(),
  setCachedStandings: vi.fn(),
  getCachedStandings: vi.fn(() => null),
  invalidateAllStandingsCache: vi.fn(),
}));
vi.mock('../../utils/stages/autoAdvance', () => ({
  tryAutoAdvanceFromMatch: vi.fn(async () => undefined),
}));
vi.mock('../../utils/discord', () => ({
  notifyMatchResult: vi.fn(async () => undefined),
  notifyBracketUpdate: vi.fn(async () => undefined),
  postMvpPoll: vi.fn(async () => ({ posted: false })),
  notifyScoreReportDispute: vi.fn(async () => undefined),
  notifyMatchStarting: vi.fn(async () => undefined),
}));
vi.mock('@/utils/discord', () => ({
  notifyMatchResult: vi.fn(async () => undefined),
  notifyBracketUpdate: vi.fn(async () => undefined),
  postMvpPoll: vi.fn(async () => ({ posted: false })),
  notifyScoreReportDispute: vi.fn(async () => undefined),
  notifyMatchStarting: vi.fn(async () => undefined),
}));
vi.mock('../../utils/botEvents', () => ({
  emitBotEvent: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../utils/matches/botEventEnrich', () => ({
  enrichMatchEvent: vi.fn(async () => null),
}));
vi.mock('../../utils/rating/applyMatchRating', () => ({
  applyMatchRatingIncremental: vi.fn(async () => undefined),
}));
vi.mock('../../utils/predictions/settle', () => ({
  settleMatchPredictions: vi.fn(async () => undefined),
}));
vi.mock('../../utils/broadcast/autoDirector', () => ({
  reactToMatchStatus: vi.fn(async () => undefined),
}));
vi.mock('@/utils/broadcast/autoDirector', () => ({
  reactToMatchStatus: vi.fn(async () => undefined),
}));
vi.mock('@/utils/matches/scheduleEvents', () => ({
  emitScheduleEventsInBackground: vi.fn(),
  emitScheduleEvents: vi.fn(async () => undefined),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  seedBotAuth,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { __resetBotIdempotencyCache } from '../../utils/botAuth';
import { __resetMaintenanceCache } from '../../utils/maintenance';
import { matchTransitionPurgesReports } from '../../utils/matches/scoreReports';
import reportScoreHandler from '../../pages/api/player/matches/[matchId]/report-score';
import adminMatchHandler from '../../pages/api/admin/matches/[matchId]';
import bulkMatchesHandler from '../../pages/api/admin/stages/[stageId]/bulk-matches';
import botScrimMatchHandler from '../../pages/api/bot/v1/scrims/[scrimId]/matches/[matchId]';
import botReportHandler from '../../pages/api/bot/v1/matches/[matchId]/report';

const TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const MATCH_ID = '550e8400-e29b-41d4-a716-446655440a01';
const MATCH_2 = '550e8400-e29b-41d4-a716-446655440a02';
const MATCH_3 = '550e8400-e29b-41d4-a716-446655440a03';
const STAGE_ID = '550e8400-e29b-41d4-a716-446655440e01';
const SCRIM_ID = '550e8400-e29b-41d4-a716-446655440f01';
const TEAM_1 = '550e8400-e29b-41d4-a716-446655440b01';
const TEAM_2 = '550e8400-e29b-41d4-a716-446655440b02';
const CAP1 = '00000000-0000-0000-0000-0000000000c1';
const CAP2 = '00000000-0000-0000-0000-0000000000c2';
const STAFF_AUTH = '00000000-0000-0000-0000-0000000000d1';
const DISCORD_1 = '900000000000000001';
const DISCORD_2 = '900000000000000002';
const STAFF_DISCORD = '900000000000000077';
const TOURNAMENT_ID = '550e8400-e29b-41d4-a716-446655440d01';

let _bearer = 0;
function bearer() {
  _bearer += 1;
  return `Bearer t-${Date.now()}-${_bearer}`;
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

function staffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: STAFF_AUTH,
    email: 'staff@example.com',
    role: 'admin',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function matchRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    tenant_id: TENANT_ID,
    tournament_id: TOURNAMENT_ID,
    scrim_id: null,
    stage_id: STAGE_ID,
    status: 'pending',
    is_bye: false,
    match_format: 'bo3',
    best_of: null,
    scheduled_at: '2026-09-01T18:00:00.000Z',
    team1_id: TEAM_1,
    team2_id: TEAM_2,
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    forfeit_team_id: null,
    completed_at: null,
    updated_at: '2026-09-01T17:00:00.000Z',
    veto_locked_at: null,
    next_match_win_id: null,
    next_match_win_slot: null,
    next_match_lose_id: null,
    next_match_lose_slot: null,
    team1: { id: TEAM_1, name: 'Phenix', captain_id: CAP1 },
    team2: { id: TEAM_2, name: 'Avoidgers', captain_id: CAP2 },
    tournament: { id: TOURNAMENT_ID, name: 'OW Womens Cup' },
    ...over,
  };
}

function report(matchId: string, side: 1 | 2, t1: number, t2: number) {
  return {
    tenant_id: TENANT_ID,
    match_id: matchId,
    team_side: side,
    reported_by_auth_user_id: side === 1 ? CAP1 : CAP2,
    team1_score: t1,
    team2_score: t2,
  };
}

const matchById = (id: string) =>
  (store.matches as any[]).find((m) => m.id === id);
const reportsOf = (id: string) =>
  ((store.match_score_reports as any[]) ?? []).filter((r) => r.match_id === id);

beforeEach(() => {
  resetSupabaseMock();
  __resetMaintenanceCache();
  invalidateStaffCache();
  seedBotAuth({ tenantId: TENANT_ID, withTenantRow: false });
  store.site_settings = [
    { key: 'bot_maintenance_mode', value: 'false' },
  ] as any;
  store.tenants = [
    {
      id: TENANT_ID,
      plan: 'foundation',
      plan_status: 'active',
      plan_expires_at: null,
      dispute_sla_minutes: 60,
    },
  ] as any;
  store.staff = [staffRow()] as any;
  store.tournaments = [
    { id: TOURNAMENT_ID, tenant_id: TENANT_ID, status: 'in_progress' },
  ] as any;
  store.tournament_stages = [
    { id: STAGE_ID, tenant_id: TENANT_ID, tournament_id: TOURNAMENT_ID },
  ] as any;
  store.teams = [
    { id: TEAM_1, tenant_id: TENANT_ID, name: 'Phenix', captain_id: CAP1 },
    { id: TEAM_2, tenant_id: TENANT_ID, name: 'Avoidgers', captain_id: CAP2 },
  ] as any;
  store.user_discord_links = [
    { auth_user_id: CAP1, discord_user_id: DISCORD_1 },
    { auth_user_id: CAP2, discord_user_id: DISCORD_2 },
    { auth_user_id: STAFF_AUTH, discord_user_id: STAFF_DISCORD },
  ] as any;
  store.match_evidence = [] as any;
  store.match_score_reports = [] as any;
  store.matches = [matchRow(MATCH_ID)] as any;
  for (const fn of [
    resetPropagationForMatch,
    propagateBracketForMatch,
    restorePropagationSlots,
    logStaffAction,
  ]) {
    fn.mockClear();
  }
});

afterEach(async () => {
  await __resetBotIdempotencyCache();
});

async function captainReportWeb(captain: string, t1: number, t2: number) {
  setAuthUser({ id: captain });
  const res = makeRes();
  await reportScoreHandler(
    {
      method: 'POST',
      headers: { host: 'h', authorization: bearer() },
      query: { matchId: MATCH_ID },
      body: { team1Score: t1, team2Score: t2 },
    } as any,
    res
  );
  return res;
}

async function adminPatch(body: Record<string, unknown>) {
  setAuthUser({ id: STAFF_AUTH });
  const res = makeRes();
  await adminMatchHandler(
    {
      method: 'PATCH',
      headers: { host: 'h', authorization: bearer() },
      query: { matchId: MATCH_ID },
      body,
    } as any,
    res
  );
  return res;
}

function botReportReq(discordUserId: string, t1: number, t2: number): any {
  return {
    method: 'POST',
    headers: { host: 'h', 'x-api-key': 'test-key', 'x-tenant-id': TENANT_ID },
    query: { matchId: MATCH_ID },
    body: { discordUserId, team1Score: t1, team2Score: t2 },
  };
}

/* -----------------------------------------------------------
 * Règle pure
 * ---------------------------------------------------------*/

describe('matchTransitionPurgesReports', () => {
  it.each([
    ['finished', 'pending'],
    ['finished', 'ongoing'],
    ['walkover', 'pending'],
    ['cancelled', 'pending'],
    ['cancelled', 'postponed'],
    ['disputed', 'pending'],
    ['finished', 'disputed'],
  ])('%s → %s : purge', (from, to) => {
    expect(matchTransitionPurgesReports(from, to)).toBe(true);
  });
  it.each([
    ['pending', 'ongoing'],
    ['ongoing', 'finished'],
    ['pending', 'disputed'],
    ['finished', 'cancelled'],
    ['disputed', 'finished'],
    ['finished', 'finished'],
    [undefined, 'pending'],
    ['finished', undefined],
  ])('%s → %s : pas de purge', (from, to) => {
    expect(matchTransitionPurgesReports(from, to)).toBe(false);
  });
});

/* -----------------------------------------------------------
 * PATCH admin
 * ---------------------------------------------------------*/

describe('PATCH /api/admin/matches/[matchId] — réouverture', () => {
  async function finishThreeZero() {
    store.matches = [matchRow(MATCH_ID, { match_format: 'bo5' })] as any;
    await captainReportWeb(CAP1, 3, 0);
    expect((await captainReportWeb(CAP2, 3, 0)).body.status).toBe('finalized');
    expect(matchById(MATCH_ID).status).toBe('finished');
    expect(reportsOf(MATCH_ID)).toHaveLength(2);
    propagateBracketForMatch.mockClear();
  }

  it('SCÉNARIO : finished → pending (« à rejouer ») puis renvoi du 3-0 → pas de refinalisation', async () => {
    await finishThreeZero();

    const res = await adminPatch({ mode: 'meta', status: 'pending' });
    expect(res.statusCode).toBe(200);
    expect(matchById(MATCH_ID).status).toBe('pending');
    expect(reportsOf(MATCH_ID)).toHaveLength(0);
    const log = logStaffAction.mock.calls
      .map((c) => c[0] as any)
      .find((e) => e.payload?.mode === 'meta');
    expect(log.payload.purged_reports).toHaveLength(2);

    const replay = await captainReportWeb(CAP1, 3, 0);
    expect(replay.body.status).toBe('awaiting_opponent');
    expect(matchById(MATCH_ID).status).toBe('pending');
    expect(propagateBracketForMatch).not.toHaveBeenCalled();
  });

  it('mode score avec un statut reportable (remise à 0-0 pending) : purge aussi', async () => {
    await finishThreeZero();
    const res = await adminPatch({
      mode: 'score',
      team1Score: 0,
      team2Score: 0,
      status: 'pending',
      propagate: false,
    });
    expect(res.statusCode).toBe(200);
    expect(matchById(MATCH_ID).status).toBe('pending');
    expect(reportsOf(MATCH_ID)).toHaveLength(0);

    const replay = await captainReportWeb(CAP1, 3, 0);
    expect(replay.body.status).toBe('awaiting_opponent');
  });

  it('mode score qui FIXE un résultat clos (défaut finished) : pas de purge', async () => {
    await finishThreeZero();
    const res = await adminPatch({
      mode: 'score',
      team1Score: 3,
      team2Score: 1,
    });
    expect(res.statusCode).toBe(200);
    expect(matchById(MATCH_ID).team2_score).toBe(1);
    expect(reportsOf(MATCH_ID)).toHaveLength(2);
  });

  it('un PATCH meta sans changement de statut ne purge rien', async () => {
    store.match_score_reports = [report(MATCH_ID, 1, 2, 0)] as any;
    const res = await adminPatch({ mode: 'meta', notes: 'lobby 12' });
    expect(res.statusCode).toBe(200);
    expect(reportsOf(MATCH_ID)).toHaveLength(1);
  });

  it('purge en échec → match non modifié', async () => {
    await finishThreeZero();
    const { setTableWriteError } = await import('./__helpers__/supabaseMock');
    setTableWriteError('match_score_reports', { message: 'boom' });
    try {
      const res = await adminPatch({ mode: 'meta', status: 'pending' });
      expect(res.statusCode).toBe(500);
      expect(matchById(MATCH_ID).status).toBe('finished');
    } finally {
      setTableWriteError('match_score_reports', null);
    }
  });
});

/* -----------------------------------------------------------
 * PUT bulk-matches
 * ---------------------------------------------------------*/

describe('PUT /api/admin/stages/[stageId]/bulk-matches — réouverture en masse', () => {
  it('purge les seuls matchs rouverts, en UNE requête', async () => {
    store.matches = [
      matchRow(MATCH_ID, { status: 'finished' }),
      matchRow(MATCH_2, { status: 'pending' }),
      matchRow(MATCH_3, { status: 'cancelled' }),
    ] as any;
    store.match_score_reports = [
      report(MATCH_ID, 1, 2, 0),
      report(MATCH_ID, 2, 2, 0),
      report(MATCH_2, 1, 2, 1),
      report(MATCH_3, 1, 0, 2),
    ] as any;

    const fromSpy = vi.spyOn(supabaseAdmin, 'from');
    try {
      setAuthUser({ id: STAFF_AUTH });
      const res = makeRes();
      await bulkMatchesHandler(
        {
          method: 'PUT',
          headers: { host: 'h', authorization: bearer() },
          query: { stageId: STAGE_ID },
          body: {
            matchIds: [MATCH_ID, MATCH_2, MATCH_3],
            fields: { status: 'pending' },
          },
        } as any,
        res
      );
      expect(res.statusCode).toBe(200);

      const reportTableCalls = fromSpy.mock.calls.filter(
        (c) => c[0] === 'match_score_reports'
      );
      expect(reportTableCalls).toHaveLength(1);
    } finally {
      fromSpy.mockRestore();
    }

    expect(reportsOf(MATCH_ID)).toHaveLength(0);
    expect(reportsOf(MATCH_3)).toHaveLength(0);
    // MATCH_2 était déjà pending : son report en cours reste valable.
    expect(reportsOf(MATCH_2)).toHaveLength(1);
    expect((store.matches as any[]).every((m) => m.status === 'pending')).toBe(
      true
    );
    const log = logStaffAction.mock.calls.map((c) => c[0] as any)[0];
    expect(log.payload.purged_reports).toHaveLength(3);
  });

  it('un PUT sans statut ne touche pas aux reports', async () => {
    store.matches = [matchRow(MATCH_ID, { status: 'finished' })] as any;
    store.match_score_reports = [report(MATCH_ID, 1, 2, 0)] as any;
    setAuthUser({ id: STAFF_AUTH });
    const res = makeRes();
    await bulkMatchesHandler(
      {
        method: 'PUT',
        headers: { host: 'h', authorization: bearer() },
        query: { stageId: STAGE_ID },
        body: { matchIds: [MATCH_ID], fields: { notes: 'x' } },
      } as any,
      res
    );
    expect(res.statusCode).toBe(200);
    expect(reportsOf(MATCH_ID)).toHaveLength(1);
  });
});

/* -----------------------------------------------------------
 * PATCH bot scrim match
 * ---------------------------------------------------------*/

describe('PATCH /api/bot/v1/scrims/[scrimId]/matches/[matchId] — réouverture', () => {
  it('finished → pending purge les reports du match de scrim', async () => {
    store.matches = [
      matchRow(MATCH_ID, {
        scrim_id: SCRIM_ID,
        tournament_id: null,
        stage_id: null,
        status: 'finished',
      }),
    ] as any;
    store.match_score_reports = [
      report(MATCH_ID, 1, 2, 0),
      report(MATCH_ID, 2, 2, 0),
    ] as any;

    const res = makeRes();
    await botScrimMatchHandler(
      {
        method: 'PATCH',
        headers: {
          host: 'h',
          'x-api-key': 'test-key',
          'x-tenant-id': TENANT_ID,
        },
        query: { scrimId: SCRIM_ID, matchId: MATCH_ID },
        body: { actorDiscordUserId: STAFF_DISCORD, status: 'pending' },
      } as any,
      res
    );
    expect(res.statusCode).toBe(200);
    expect(matchById(MATCH_ID).status).toBe('pending');
    expect(reportsOf(MATCH_ID)).toHaveLength(0);
  });
});

/* -----------------------------------------------------------
 * Report Discord : constats 2, 4, 5
 * ---------------------------------------------------------*/

describe('POST /api/bot/v1/matches/[matchId]/report — gardes', () => {
  it('409 MATCH_NOT_STARTED avant le coup d’envoi, message lisible, rien d’écrit', async () => {
    store.matches = [
      matchRow(MATCH_ID, {
        scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ] as any;
    const res = makeRes();
    await botReportHandler(botReportReq(DISCORD_1, 2, 0), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('MATCH_NOT_STARTED');
    expect(res.body.error).toContain('pas encore commencé');
    expect(reportsOf(MATCH_ID)).toHaveLength(0);
  });

  it('match `ongoing` : reportable même avant l’heure', async () => {
    store.matches = [
      matchRow(MATCH_ID, {
        status: 'ongoing',
        scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ] as any;
    const res = makeRes();
    await botReportHandler(botReportReq(DISCORD_1, 2, 0), res);
    expect(res.statusCode).toBe(200);
  });

  it('400 INVALID_SCORE_FOR_FORMAT sur 3-3 en BO3', async () => {
    const res = makeRes();
    await botReportHandler(botReportReq(DISCORD_1, 3, 3), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_SCORE_FOR_FORMAT');
    expect(res.body.error).toContain('BO3');
    expect(reportsOf(MATCH_ID)).toHaveLength(0);
  });

  it('format inconnu : pas de borne', async () => {
    store.matches = [matchRow(MATCH_ID, { match_format: null })] as any;
    const res = makeRes();
    await botReportHandler(botReportReq(DISCORD_1, 3, 3), res);
    expect(res.statusCode).toBe(200);
  });

  it('deux capitaines valident à la même seconde → une seule finalisation', async () => {
    store.match_score_reports = [
      { ...report(MATCH_ID, 1, 2, 0), reported_at: '2026-09-01T20:00:00.000Z' },
      { ...report(MATCH_ID, 2, 2, 1), reported_at: '2026-09-01T20:00:00.000Z' },
    ] as any;
    const r1 = makeRes();
    const r2 = makeRes();
    await Promise.all([
      botReportHandler(botReportReq(DISCORD_1, 2, 0), r1),
      botReportHandler(botReportReq(DISCORD_2, 2, 0), r2),
    ]);

    expect(resetPropagationForMatch).toHaveBeenCalledTimes(1);
    expect(propagateBracketForMatch).toHaveBeenCalledTimes(1);
    expect(restorePropagationSlots).not.toHaveBeenCalled();
    expect(matchById(MATCH_ID).status).toBe('finished');
    const outcomes = [r1, r2].map(
      (r) => `${r.statusCode}:${r.body.status ?? r.body.code}`
    );
    expect(outcomes).toContain('200:finalized');
    for (const o of outcomes) {
      expect(['200:finalized', '409:FINALIZATION_IN_PROGRESS']).toContain(o);
    }
  });

  it('SCÉNARIO constat 1 via Discord : réouverture admin puis renvoi du report → attente', async () => {
    store.matches = [matchRow(MATCH_ID, { status: 'finished' })] as any;
    store.match_score_reports = [
      report(MATCH_ID, 1, 2, 0),
      report(MATCH_ID, 2, 2, 0),
    ] as any;
    expect(
      (await adminPatch({ mode: 'meta', status: 'pending' })).statusCode
    ).toBe(200);
    const res = makeRes();
    await botReportHandler(botReportReq(DISCORD_1, 2, 0), res);
    expect(res.body.status).toBe('awaiting_opponent');
    expect(matchById(MATCH_ID).status).toBe('pending');
  });
});

describe('POST /api/bot/v1/matches/[matchId]/report — dispute ouverte par le staff', () => {
  it('l’accord via Discord ne referme pas une dispute staff', async () => {
    store.matches = [
      matchRow(MATCH_ID, { status: 'disputed', dispute_opened_by: 'staff-1' }),
    ] as any;
    store.match_score_reports = [report(MATCH_ID, 1, 2, 0)] as any;

    const res = makeRes();
    await botReportHandler(botReportReq(DISCORD_2, 2, 0), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('DISPUTE_UNDER_STAFF_REVIEW');
    // Le bot affiche `error` tel quel : il doit se lire sur Discord.
    expect(res.body.error).toContain('examen par le staff');
    expect(matchById(MATCH_ID).status).toBe('disputed');
    expect(propagateBracketForMatch).not.toHaveBeenCalled();
  });

  it('régression : une dispute automatique se referme toujours via Discord', async () => {
    store.matches = [
      matchRow(MATCH_ID, { status: 'disputed', dispute_opened_by: null }),
    ] as any;
    store.match_score_reports = [report(MATCH_ID, 1, 2, 0)] as any;

    const res = makeRes();
    await botReportHandler(botReportReq(DISCORD_2, 2, 0), res);

    expect(res.statusCode).toBe(200);
    expect(matchById(MATCH_ID).status).toBe('finished');
  });
});
