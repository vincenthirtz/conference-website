// tests/unit/scoreReportIntegrity.test.ts
//
// Lot 1 « intégrité des scores » (2026-09-16), veille de la Coupe :
//
//   1. un résultat écarté par le staff (dispute « à rejouer » ou annulée) ne
//      peut plus être rétabli par la seule capitaine gagnante — les reports
//      sont purgés à la réouverture (admin PATCH/DELETE, bot resolve-dispute) ;
//   2. pas de report avant le coup d'envoi (409 MATCH_NOT_STARTED) ;
//   4. deux validations simultanées ne finalisent qu'UNE fois ;
//   5. un couple de scores incompatible avec le BO est refusé
//      (400 INVALID_SCORE_FOR_FORMAT), sauf format inconnu.
//
// Le constat 3 (« agreed » sur égalité) et les règles pures sont couverts par
// tests/unit/scoreReportsRules.test.ts ; la variante scrim par
// tests/unit/scrimReportIntegrity.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const {
  resetPropagationForMatch,
  propagateBracketForMatch,
  snapshotPropagationSlots,
  restorePropagationSlots,
  logStaffAction,
  notifyScoreReportDispute,
  emitBotEvent,
} = vi.hoisted(() => ({
  resetPropagationForMatch: vi.fn(async () => undefined),
  propagateBracketForMatch: vi.fn(async (_t: string, matchId: string) => ({
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
  logStaffAction: vi.fn(async (..._args: unknown[]) => undefined),
  notifyScoreReportDispute: vi.fn(async () => undefined),
  emitBotEvent: vi.fn(async () => ({ ok: true })),
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
  notifyScoreReportDispute,
}));
vi.mock('../../utils/botEvents', () => ({ emitBotEvent }));
vi.mock('@/utils/botEvents', () => ({ emitBotEvent }));
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

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  seedBotAuth,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { __resetBotIdempotencyCache } from '../../utils/botAuth';
import {
  applyMatchScore,
  MatchFinalizationConflictError,
} from '../../utils/matches/applyScore';
import reportHandler from '../../pages/api/player/matches/[matchId]/report-score';
import adminDisputeHandler from '../../pages/api/admin/matches/[matchId]/dispute';
import botResolveDisputeHandler from '../../pages/api/bot/v1/matches/[matchId]/resolve-dispute';

const TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const MATCH_ID = '550e8400-e29b-41d4-a716-446655440a01';
const TEAM_1 = '550e8400-e29b-41d4-a716-446655440b01';
const TEAM_2 = '550e8400-e29b-41d4-a716-446655440b02';
const CAP1 = '00000000-0000-0000-0000-0000000000c1';
const CAP2 = '00000000-0000-0000-0000-0000000000c2';
const STAFF_AUTH = '00000000-0000-0000-0000-0000000000d1';
const STAFF_DISCORD = '900000000000000077';
const TOURNAMENT_ID = '550e8400-e29b-41d4-a716-446655440d01';
const PAST = '2026-09-01T18:00:00.000Z';

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

function seedMatch(over: Record<string, unknown> = {}) {
  store.matches = [
    {
      id: MATCH_ID,
      tenant_id: TENANT_ID,
      tournament_id: TOURNAMENT_ID,
      scrim_id: null,
      stage_id: 'stage-1',
      status: 'pending',
      is_bye: false,
      match_format: 'bo5',
      best_of: null,
      scheduled_at: PAST,
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
    },
  ] as any;
  store.tournaments = [
    { id: TOURNAMENT_ID, tenant_id: TENANT_ID, status: 'in_progress' },
  ] as any;
  store.teams = [
    { id: TEAM_1, tenant_id: TENANT_ID, name: 'Phenix', logo_url: null },
    { id: TEAM_2, tenant_id: TENANT_ID, name: 'Avoidgers', logo_url: null },
  ] as any;
  store.match_score_reports = [] as any;
}

const match = () => (store.matches as any[])[0];

async function captainReport(
  captain: string,
  team1Score: number,
  team2Score: number
) {
  setAuthUser({ id: captain });
  const res = makeRes();
  await reportHandler(
    {
      method: 'POST',
      headers: { host: 'h', authorization: bearer() },
      query: { matchId: MATCH_ID },
      body: { team1Score, team2Score },
    } as any,
    res
  );
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

async function adminDispute(
  method: 'POST' | 'PATCH' | 'DELETE',
  body: Record<string, unknown> = {},
  query: Record<string, unknown> = {}
) {
  setAuthUser({ id: STAFF_AUTH });
  const res = makeRes();
  await adminDisputeHandler(
    {
      method,
      headers: { host: 'h', authorization: bearer() },
      query: { matchId: MATCH_ID, ...query },
      body,
    } as any,
    res
  );
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  __resetBotIdempotencyCache();
  store.staff = [staffRow()] as any;
  for (const fn of [
    resetPropagationForMatch,
    propagateBracketForMatch,
    snapshotPropagationSlots,
    restorePropagationSlots,
    logStaffAction,
    notifyScoreReportDispute,
    emitBotEvent,
  ]) {
    fn.mockClear();
  }
  seedMatch();
});

/** Match fini 3-0 validé par les deux capitaines — point de départ du constat 1. */
async function finishThreeZeroByAgreement() {
  expect((await captainReport(CAP1, 3, 0)).body.status).toBe(
    'awaiting_opponent'
  );
  const res = await captainReport(CAP2, 3, 0);
  expect(res.body.status).toBe('finalized');
  expect(match().status).toBe('finished');
  expect(store.match_score_reports).toHaveLength(2);
  propagateBracketForMatch.mockClear();
}

/* -----------------------------------------------------------
 * Constat 1 — un résultat écarté par le staff ne revient pas
 * ---------------------------------------------------------*/

describe('constat 1 — réouverture staff sans score : les reports sont purgés', () => {
  it('SCÉNARIO : dispute tranchée « à rejouer » (PATCH pending) → le renvoi du 3-0 ne refinalise pas', async () => {
    await finishThreeZeroByAgreement();

    expect((await adminDispute('POST', { reason: 'Triche' })).statusCode).toBe(
      200
    );
    expect(match().status).toBe('disputed');

    const resolved = await adminDispute('PATCH', {
      resolution: 'Match à rejouer',
      resumeStatus: 'pending',
    });
    expect(resolved.statusCode).toBe(200);
    expect(match().status).toBe('pending');
    expect(store.match_score_reports).toHaveLength(0);

    // La trace d'audit garde les deux reports effacés.
    const resolveLog = logStaffAction.mock.calls
      .map((c) => c[0] as any)
      .find((e) => e.action === 'resolve_match_dispute');
    expect(resolveLog.payload.purged_reports).toHaveLength(2);

    // L'attaque : la capitaine gagnante renvoie son 3-0.
    const replay = await captainReport(CAP1, 3, 0);
    expect(replay.statusCode).toBe(200);
    expect(replay.body.status).toBe('awaiting_opponent');
    expect(match().status).toBe('pending');
    expect(propagateBracketForMatch).not.toHaveBeenCalled();
  });

  it('SCÉNARIO : dispute ANNULÉE (DELETE) → même protection', async () => {
    await finishThreeZeroByAgreement();
    await adminDispute('POST', { reason: 'Erreur de saisie ?' });

    const cancelled = await adminDispute('DELETE', {}, {});
    expect(cancelled.statusCode).toBe(200);
    expect(match().status).toBe('pending');
    expect(store.match_score_reports).toHaveLength(0);

    const replay = await captainReport(CAP1, 3, 0);
    expect(replay.body.status).toBe('awaiting_opponent');
    expect(match().status).toBe('pending');
    expect(propagateBracketForMatch).not.toHaveBeenCalled();
  });

  it('SCÉNARIO : dispute tranchée depuis Discord sans score (bot resolve-dispute) → même protection', async () => {
    await finishThreeZeroByAgreement();
    await adminDispute('POST', { reason: 'Contestation' });

    seedBotAuth();
    store.tenants = [
      {
        id: TENANT_ID,
        plan: 'foundation',
        plan_status: 'active',
        plan_expires_at: null,
      },
    ] as any;
    store.user_discord_links = [
      { discord_user_id: STAFF_DISCORD, auth_user_id: STAFF_AUTH },
    ] as any;

    const res = makeRes();
    await botResolveDisputeHandler(
      {
        method: 'POST',
        headers: {
          host: 'h',
          'x-api-key': 'test-key',
          'x-tenant-id': TENANT_ID,
        },
        query: { matchId: MATCH_ID },
        body: {
          actorDiscordUserId: STAFF_DISCORD,
          resolution: 'À rejouer',
          resumeStatus: 'pending',
        },
      } as any,
      res
    );
    expect(res.statusCode).toBe(200);
    expect(match().status).toBe('pending');
    expect(store.match_score_reports).toHaveLength(0);

    const replay = await captainReport(CAP1, 3, 0);
    expect(replay.body.status).toBe('awaiting_opponent');
    expect(propagateBracketForMatch).not.toHaveBeenCalled();
  });

  it('une résolution qui FIXE un score ne purge pas (le score staff fait foi)', async () => {
    await finishThreeZeroByAgreement();
    await adminDispute('POST', { reason: 'Score contesté' });

    const res = await adminDispute('PATCH', {
      resolution: 'Score corrigé',
      resumeStatus: 'finished',
      team1Score: 3,
      team2Score: 1,
    });
    expect(res.statusCode).toBe(200);
    expect(match().status).toBe('finished');
    expect(match().team2_score).toBe(1);
    expect(store.match_score_reports).toHaveLength(2);

    // Et le match clos refuse tout report.
    const late = await captainReport(CAP1, 3, 0);
    expect(late.statusCode).toBe(409);
    expect(late.body.code).toBe('MATCH_FINALIZED');
  });

  it('purge en échec → la dispute reste ouverte (rien n’est rouvert sur des reports périmés)', async () => {
    await finishThreeZeroByAgreement();
    await adminDispute('POST', { reason: 'Triche' });

    const { setTableWriteError } = await import('./__helpers__/supabaseMock');
    setTableWriteError('match_score_reports', { message: 'boom' });
    try {
      const res = await adminDispute('PATCH', {
        resolution: 'Match à rejouer',
        resumeStatus: 'pending',
      });
      expect(res.statusCode).toBe(500);
      expect(match().status).toBe('disputed');
    } finally {
      setTableWriteError('match_score_reports', null);
    }
  });
});

/* -----------------------------------------------------------
 * Constat 2 — pas de report avant le coup d'envoi
 * ---------------------------------------------------------*/

describe('constat 2 — MATCH_NOT_STARTED', () => {
  const FUTURE = () => new Date(Date.now() + 2 * 86_400_000).toISOString();

  it('409 MATCH_NOT_STARTED sur un match planifié dans le futur, et rien n’est écrit', async () => {
    seedMatch({ scheduled_at: FUTURE() });
    const res = await captainReport(CAP1, 3, 0);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('MATCH_NOT_STARTED');
    expect(store.match_score_reports).toHaveLength(0);
  });

  it('deux reports concordants sur un match de dimanche ne le finalisent plus', async () => {
    seedMatch({ scheduled_at: FUTURE() });
    await captainReport(CAP1, 3, 0);
    const res = await captainReport(CAP2, 3, 0);
    expect(res.body.code).toBe('MATCH_NOT_STARTED');
    expect(match().status).toBe('pending');
    expect(propagateBracketForMatch).not.toHaveBeenCalled();
  });

  it('un match `ongoing` reste reportable quelle que soit l’heure planifiée', async () => {
    seedMatch({ scheduled_at: FUTURE(), status: 'ongoing' });
    const res = await captainReport(CAP1, 3, 0);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('awaiting_opponent');
  });

  it('sans heure planifiée, pas de garde', async () => {
    seedMatch({ scheduled_at: null });
    const res = await captainReport(CAP1, 3, 0);
    expect(res.statusCode).toBe(200);
  });
});

/* -----------------------------------------------------------
 * Constat 5 — score cohérent avec le BO
 * ---------------------------------------------------------*/

describe('constat 5 — INVALID_SCORE_FOR_FORMAT', () => {
  it('3-3 en BO3 : 400 INVALID_SCORE_FOR_FORMAT, rien d’écrit', async () => {
    seedMatch({ match_format: 'bo3' });
    const res = await captainReport(CAP1, 3, 3);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_SCORE_FOR_FORMAT');
    expect(store.match_score_reports).toHaveLength(0);
  });

  it('deux capitaines d’accord sur 3-3 en BO3 ne finalisent plus un nul', async () => {
    seedMatch({ match_format: 'bo3' });
    await captainReport(CAP1, 3, 3);
    const res = await captainReport(CAP2, 3, 3);
    expect(res.body.code).toBe('INVALID_SCORE_FOR_FORMAT');
    expect(match().status).toBe('pending');
  });

  it('3-0 en BO3 (vainqueur au-delà de 2) : refusé ; 2-1 accepté', async () => {
    seedMatch({ match_format: 'bo3' });
    expect((await captainReport(CAP1, 3, 0)).body.code).toBe(
      'INVALID_SCORE_FOR_FORMAT'
    );
    expect((await captainReport(CAP1, 2, 1)).statusCode).toBe(200);
  });

  it('best_of surcharge match_format', async () => {
    seedMatch({ match_format: null, best_of: 3 });
    expect((await captainReport(CAP1, 3, 1)).body.code).toBe(
      'INVALID_SCORE_FOR_FORMAT'
    );
  });

  it('format inconnu ou absent : aucune borne (on ne bloque pas un soir de tournoi)', async () => {
    seedMatch({ match_format: 'custom_league', best_of: null });
    expect((await captainReport(CAP1, 3, 3)).statusCode).toBe(200);
    seedMatch({ match_format: null, best_of: null });
    expect((await captainReport(CAP1, 7, 2)).statusCode).toBe(200);
  });
});

/* -----------------------------------------------------------
 * Constat 4 — double finalisation concurrente
 * ---------------------------------------------------------*/

describe('constat 4 — deux finalisations simultanées', () => {
  it('applyMatchScore claimFinalization : un seul reset/propagation, le second sort sans toucher au bracket', async () => {
    const input = {
      tenantId: TENANT_ID,
      matchId: MATCH_ID,
      team1Score: 3,
      team2Score: 0,
      markFinished: true,
      staffId: null,
      propagateBracket: true,
      claimFinalization: true,
    };
    const results = await Promise.allSettled([
      applyMatchScore(input),
      applyMatchScore(input),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(MatchFinalizationConflictError);

    // Le perdant n'a NI vidé le slot aval (reset) NI restauré un snapshot
    // antérieur à la propagation du gagnant.
    expect(resetPropagationForMatch).toHaveBeenCalledTimes(1);
    expect(restorePropagationSlots).not.toHaveBeenCalled();
    expect(propagateBracketForMatch).toHaveBeenCalledTimes(1);
    expect(match().status).toBe('finished');
  });

  it('sans l’option, comportement historique inchangé pour les autres appelants', async () => {
    const r = await applyMatchScore({
      tenantId: TENANT_ID,
      matchId: MATCH_ID,
      team1Score: 3,
      team2Score: 1,
      markFinished: true,
      staffId: null,
      propagateBracket: true,
    });
    expect(r.updated).toBe(true);
    expect(match().status).toBe('finished');
    // Un staff peut toujours réécrire un match clos (pas de garde de statut).
    const again = await applyMatchScore({
      tenantId: TENANT_ID,
      matchId: MATCH_ID,
      team1Score: 3,
      team2Score: 2,
      markFinished: true,
      staffId: null,
      propagateBracket: true,
    });
    expect(again.updated).toBe(true);
    expect(match().team2_score).toBe(2);
  });

  it('claimFinalization refuse d’écraser un match clos par le staff sur un autre score', async () => {
    seedMatch({
      status: 'finished',
      team1_score: 3,
      team2_score: 1,
      winner_team_id: TEAM_1,
    });
    await expect(
      applyMatchScore({
        tenantId: TENANT_ID,
        matchId: MATCH_ID,
        team1Score: 3,
        team2Score: 0,
        markFinished: true,
        staffId: null,
        propagateBracket: true,
        claimFinalization: true,
      })
    ).rejects.toBeInstanceOf(MatchFinalizationConflictError);
    expect(match().team2_score).toBe(1);
    expect(resetPropagationForMatch).not.toHaveBeenCalled();
  });

  it('route : les deux capitaines valident à la même seconde → une seule finalisation', async () => {
    store.match_score_reports = [
      {
        tenant_id: TENANT_ID,
        match_id: MATCH_ID,
        team_side: 1,
        team1_score: 3,
        team2_score: 0,
      },
      {
        tenant_id: TENANT_ID,
        match_id: MATCH_ID,
        team_side: 2,
        team1_score: 3,
        team2_score: 1,
      },
    ] as any;

    // setAuthUser est global au mock : on fige chaque requête sur son
    // capitaine en résolvant le jeton → utilisateur à la volée.
    const { supabaseAdmin } = await import('./__helpers__/supabaseMock');
    const tokens: Record<string, string> = {};
    const t1 = bearer();
    const t2 = bearer();
    tokens[t1.slice(7)] = CAP1;
    tokens[t2.slice(7)] = CAP2;
    const spy = vi.spyOn(supabaseAdmin.auth, 'getUser').mockImplementation(
      async (jwt?: string) =>
        ({
          data: { user: { id: tokens[jwt ?? ''] } },
          error: null,
        }) as any
    );

    try {
      const r1 = makeRes();
      const r2 = makeRes();
      await Promise.all([
        reportHandler(
          {
            method: 'POST',
            headers: { host: 'h', authorization: t1 },
            query: { matchId: MATCH_ID },
            body: { team1Score: 3, team2Score: 0 },
          } as any,
          r1
        ),
        reportHandler(
          {
            method: 'POST',
            headers: { host: 'h', authorization: t2 },
            query: { matchId: MATCH_ID },
            body: { team1Score: 3, team2Score: 0 },
          } as any,
          r2
        ),
      ]);

      expect(resetPropagationForMatch).toHaveBeenCalledTimes(1);
      expect(propagateBracketForMatch).toHaveBeenCalledTimes(1);
      expect(restorePropagationSlots).not.toHaveBeenCalled();
      expect(match().status).toBe('finished');

      const outcomes = [r1, r2].map(
        (r) => `${r.statusCode}:${r.body.status ?? r.body.code}`
      );
      expect(outcomes).toContain('200:finalized');
      for (const o of outcomes) {
        expect(['200:finalized', '409:FINALIZATION_IN_PROGRESS']).toContain(o);
      }
    } finally {
      spy.mockRestore();
    }
  });

  it('route : report divergent tardif sur un match clos entre-temps → 409, pas de dispute rouverte', async () => {
    store.match_score_reports = [
      {
        tenant_id: TENANT_ID,
        match_id: MATCH_ID,
        team_side: 2,
        team1_score: 3,
        team2_score: 0,
      },
    ] as any;
    // Le staff clôt le match JUSTE APRÈS la lecture de la route.
    const { supabaseAdmin } = await import('./__helpers__/supabaseMock');
    const real = supabaseAdmin.from.bind(supabaseAdmin);
    let armed = true;
    const spy = vi
      .spyOn(supabaseAdmin, 'from')
      .mockImplementation((name: string) => {
        const builder: any = real(name);
        if (name === 'matches' && armed) {
          const original = builder.maybeSingle.bind(builder);
          builder.maybeSingle = async () => {
            const r = await original();
            armed = false;
            Object.assign(match(), {
              status: 'finished',
              team1_score: 3,
              team2_score: 0,
            });
            return r;
          };
        }
        return builder;
      });
    try {
      const res = await captainReport(CAP1, 3, 1);
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('MATCH_FINALIZED');
      expect(match().status).toBe('finished');
    } finally {
      spy.mockRestore();
    }
  });
});

/* -----------------------------------------------------------
 * Dispute ouverte par le STAFF — l'accord des capitaines ne la referme pas
 *
 * La fermeture automatique « les deux reports concordent » ne regardait pas
 * QUI avait ouvert la dispute. Or le staff ouvre une dispute pour instruire
 * autre chose que le score (joueuse inéligible, triche), et les deux équipes
 * peuvent s'entendre sur le score tout en étant en cause.
 * ---------------------------------------------------------*/

describe('dispute ouverte par le STAFF : l’accord des capitaines ne la referme pas', () => {
  it('SCÉNARIO : enquête staff sur un match fini → les deux capitaines renvoient 3-0 → la dispute tient', async () => {
    await finishThreeZeroByAgreement();

    const opened = await adminDispute('POST', { reason: 'Joueuse inéligible' });
    expect(opened.statusCode).toBe(200);
    expect(match().status).toBe('disputed');
    expect(match().dispute_opened_by).toBe('staff-1');

    // L'attaque : les deux équipes, d'accord sur le score, renvoient 3-0.
    for (const cap of [CAP1, CAP2]) {
      const res = await captainReport(cap, 3, 0);
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('DISPUTE_UNDER_STAFF_REVIEW');
    }

    expect(match().status).toBe('disputed');
    expect(match().dispute_resolved_at ?? null).toBeNull();
    expect(propagateBracketForMatch).not.toHaveBeenCalled();
    // Les reports restent : c'est ce que le staff lit pour instruire.
    expect(store.match_score_reports).toHaveLength(2);
  });

  it('régression : une dispute AUTOMATIQUE (reports divergents) se referme toujours par l’accord', async () => {
    await captainReport(CAP1, 3, 0);
    const diverge = await captainReport(CAP2, 0, 3);
    expect(diverge.body.status).toBe('disputed');
    expect(match().status).toBe('disputed');
    expect(match().dispute_opened_by ?? null).toBeNull();

    const aligned = await captainReport(CAP2, 3, 0);
    expect(aligned.statusCode).toBe(200);
    expect(aligned.body.status).toBe('finalized');
    expect(match().status).toBe('finished');
  });
});
