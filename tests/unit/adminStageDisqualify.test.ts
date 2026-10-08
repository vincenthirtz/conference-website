// tests/unit/adminStageDisqualify.test.ts — disqualifier une équipe d'une
// phase (POST …/disqualify) et la réintégrer (DELETE), plus l'effet au
// classement (rang, mode « annul »), à l'avancement et au classement public.
//
// `applyMatchScore` et `settleMatchPredictions` sont simulés : leurs propres
// effets (forfait, bot, pronostics) ont leurs tests ; ici on vérifie QUE le
// service les appelle, sur les bons matchs, dans le bon ordre.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

const { applyMatchScore, settleMatchPredictions } = vi.hoisted(() => ({
  applyMatchScore: vi.fn(async (input: { matchId: string }) => ({
    matchId: input.matchId,
    updated: true,
    winnerTeamId: null,
  })),
  settleMatchPredictions: vi.fn(
    async (_tenantId: string, _matchId: string) => ({
      ok: true,
      settled: 0,
      credited: 0,
    })
  ),
}));
vi.mock('../../utils/matches/applyScore', () => ({ applyMatchScore }));
vi.mock('../../utils/predictions/settle', () => ({ settleMatchPredictions }));

import handler from '../../pages/api/admin/stages/[stageId]/disqualify';
import teamsHandler from '../../pages/api/admin/stages/[stageId]/teams';
import { computeStageStandings } from '../../utils/stages/standings';
import { readPublicStandings } from '../../utils/stages/publicStandings';
import { tryAutoAdvanceFromMatch } from '../../utils/stages/autoAdvance';
import { invalidateAllStandingsCache } from '../../utils/stages/standingsCache';

const TID = '550e8400-e29b-41d4-a716-446655440000';
const STAGE = '6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const TARGET = '9c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const T1 = '7a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
const T2 = '8b2c3d4e-5f6a-4b7c-9d8e-9f0a1b2c3d4e';
const T3 = '9c3d4e5f-6a7b-4c8d-8e9f-0a1b2c3d4e5f';
const OUTSIDER = 'a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d';

function staffRow(role: StaffMember['role']): StaffMember {
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

let n = 0;
function makeReq(over: Record<string, unknown> = {}): any {
  n += 1;
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${n}` },
    query: { stageId: STAGE },
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

async function call(over: Record<string, unknown>) {
  const res = makeRes();
  await handler(makeReq(over), res);
  return res;
}

const NAMES: Record<string, string> = {
  [T1]: 'Alpha',
  [T2]: 'Beta',
  [T3]: 'Gamma',
};

function seed(
  stageType = 'round_robin',
  settings: Record<string, unknown> = {}
) {
  store.tournaments = [{ id: TID, status: 'ongoing' }] as any;
  store.tournament_stages = [
    {
      id: STAGE,
      tournament_id: TID,
      name: 'Poule',
      stage_type: stageType,
      order_index: 0,
      is_active: true,
      settings,
    },
  ] as any;
  store.teams = [T1, T2, T3].map((id) => ({
    id,
    name: NAMES[id],
    short_name: null,
  })) as any;
  store.stage_teams = [T1, T2, T3].map((id, i) => ({
    stage_id: STAGE,
    team_id: id,
    seed: i + 1,
    is_substitute: false,
    notes: null,
    disqualified_at: null,
    disqualification_mode: null,
    disqualification_reason: null,
    disqualified_by: null,
    team: { id, name: NAMES[id], short_name: null, logo_url: null },
  })) as any;
}

function m(
  id: string,
  team1: string | null,
  team2: string | null,
  over: Record<string, unknown> = {}
) {
  return {
    id,
    tournament_id: TID,
    stage_id: STAGE,
    status: 'pending',
    is_bye: false,
    round_number: 1,
    team1_id: team1,
    team2_id: team2,
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    forfeit_team_id: null,
    deleted_at: null,
    notes: null,
    scheduled_at: null,
    group_key: null,
    ...over,
  };
}

/** m1 joué (T1 bat T2), m2/m3 à jouer, m4 en litige, m5 sans adversaire, m6 supprimé. */
function seedMatches() {
  store.matches = [
    m('m1', T1, T2, {
      status: 'finished',
      winner_team_id: T1,
      team1_score: 2,
      team2_score: 0,
    }),
    m('m2', T1, T3, {
      round_number: 2,
      round_name: 'Ronde 2',
      scheduled_at: '2026-10-12T18:00:00.000Z',
      notes: 'Report demandé',
    }),
    m('m3', T2, T1, { round_number: 3, status: 'ongoing' }),
    m('m4', T3, T1, { round_number: 4, status: 'disputed' }),
    m('m5', T1, null, { round_number: 5 }),
    m('m6', T1, T2, { round_number: 6, deleted_at: '2026-10-01T00:00:00Z' }),
    m('m7', T2, T3, { round_number: 2 }),
  ] as any;
}

const entry = (teamId: string) =>
  (store.stage_teams as any[]).find((r) => r.team_id === teamId);
const matchById = (id: string) =>
  (store.matches as any[]).find((r) => r.id === id);
const logOf = (action: string) =>
  (store.staff_logs ?? []).find((l: any) => l.action === action) as any;

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  invalidateAllStandingsCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [staffRow('admin')] as any;
  applyMatchScore.mockClear();
  settleMatchPredictions.mockClear();
});

describe('POST /api/admin/stages/[stageId]/disqualify — garde et entrées', () => {
  it('403 sous la permission manage_tournaments', async () => {
    seed();
    store.staff = [staffRow('caster')] as any;
    const res = await call({
      body: { team_id: T1, mode: 'forfeit', reason: 'Abandon' },
    });
    expect(res.statusCode).toBe(403);
    expect(entry(T1).disqualified_at).toBeNull();
  });

  it('405 + Allow sur une méthode non déclarée', async () => {
    const res = await call({ method: 'GET' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST,DELETE');
  });

  it('400 : mode inconnu, motif trop court, team_id invalide', async () => {
    seed();
    for (const body of [
      { team_id: T1, mode: 'ban', reason: 'Abandon' },
      { team_id: T1, mode: 'forfeit', reason: '  x ' },
      { team_id: 'nope', mode: 'annul', reason: 'Abandon' },
      { team_id: T1, mode: 'forfeit' },
    ]) {
      const res = await call({ body });
      expect(res.statusCode).toBe(400);
    }
    expect(entry(T1).disqualified_at).toBeNull();
  });

  it('404 : équipe non inscrite à la phase', async () => {
    seed();
    const res = await call({
      body: { team_id: OUTSIDER, mode: 'forfeit', reason: 'Abandon' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('TEAM_NOT_IN_STAGE');
  });

  it('404 : phase inconnue', async () => {
    seed();
    store.tournament_stages = [];
    const res = await call({
      body: { team_id: T1, mode: 'forfeit', reason: 'Abandon' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('409 : déjà disqualifiée (rien de retraité)', async () => {
    seed();
    seedMatches();
    Object.assign(entry(T1), {
      disqualified_at: '2026-10-01T00:00:00Z',
      disqualification_mode: 'annul',
    });
    const res = await call({
      body: { team_id: T1, mode: 'forfeit', reason: 'Abandon' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('ALREADY_DISQUALIFIED');
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('409 : tournoi terminé, rien écrit', async () => {
    seed();
    seedMatches();
    store.tournaments = [{ id: TID, status: 'completed' }] as any;
    const res = await call({
      body: { team_id: T1, mode: 'forfeit', reason: 'Abandon' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('TOURNAMENT_COMPLETED');
    expect(entry(T1).disqualified_at).toBeNull();
  });
});

describe('POST …/disqualify — mode forfeit', () => {
  it('201 : forfait sur chaque match restant, litige et adversaire inconnu signalés', async () => {
    seed();
    seedMatches();
    const res = await call({
      body: { team_id: T1, mode: 'forfeit', reason: '  Abandon de l’équipe ' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      mode: 'forfeit',
      teamId: T1,
      teamName: 'Alpha',
      forfeited: ['m2', 'm3'],
      cancelled: [],
      skipped: [
        { id: 'm4', reason: 'disputed' },
        { id: 'm5', reason: 'no_opponent' },
      ],
      failed: null,
      notProcessed: [],
      complete: true,
    });

    expect(applyMatchScore.mock.calls.map((c) => c[0])).toEqual([
      {
        tenantId: expect.any(String),
        matchId: 'm2',
        forfeitTeamId: T1,
        staffId: 'staff-1',
      },
      {
        tenantId: expect.any(String),
        matchId: 'm3',
        forfeitTeamId: T1,
        staffId: 'staff-1',
      },
    ]);
    // Joué, supprimé, autre équipe : jamais touchés.
    expect(matchById('m1').status).toBe('finished');

    expect(entry(T1)).toMatchObject({
      disqualification_mode: 'forfeit',
      disqualification_reason: 'Abandon de l’équipe',
      disqualified_by: 'staff-1',
    });
    expect(entry(T1).disqualified_at).toEqual(expect.any(String));

    const log = logOf('disqualify_team');
    expect(log).toMatchObject({
      entity_type: 'stage',
      entity_id: STAGE,
      tournament_id: TID,
    });
    expect(log.payload).toMatchObject({
      team_id: T1,
      team_name: 'Alpha',
      mode: 'forfeit',
      reason: 'Abandon de l’équipe',
      forfeited_match_ids: ['m2', 'm3'],
      complete: true,
    });

    // Chaque match cité est résumé (noms, ronde, date) ; les autres non.
    expect(res.body.matches).toEqual({
      m2: {
        team1Name: 'Alpha',
        team2Name: 'Gamma',
        roundName: 'Ronde 2',
        scheduledAt: '2026-10-12T18:00:00.000Z',
      },
      m3: {
        team1Name: 'Beta',
        team2Name: 'Alpha',
        roundName: null,
        scheduledAt: null,
      },
      m4: {
        team1Name: 'Gamma',
        team2Name: 'Alpha',
        roundName: null,
        scheduledAt: null,
      },
      m5: {
        team1Name: 'Alpha',
        team2Name: null,
        roundName: null,
        scheduledAt: null,
      },
    });
  });

  it('noms illisibles : le résumé reste, avec des noms null', async () => {
    seed();
    seedMatches();
    store.teams = [] as any;
    const res = await call({
      body: { team_id: T1, mode: 'forfeit', reason: 'Abandon' },
    });
    expect(res.statusCode).toBe(201);
    expect(Object.keys(res.body.matches).sort()).toEqual([
      'm2',
      'm3',
      'm4',
      'm5',
    ]);
    expect(res.body.matches.m2).toEqual({
      team1Name: null,
      team2Name: null,
      roundName: 'Ronde 2',
      scheduledAt: '2026-10-12T18:00:00.000Z',
    });
  });

  it('la disqualification est posée AVANT les forfaits (avancement auto)', async () => {
    seed();
    seedMatches();
    let seenAtFirstForfeit: unknown = 'unset';
    applyMatchScore.mockImplementationOnce(
      async (input: { matchId: string }) => {
        seenAtFirstForfeit = entry(T1).disqualified_at;
        return { matchId: input.matchId, updated: true, winnerTeamId: null };
      }
    );
    await call({ body: { team_id: T1, mode: 'forfeit', reason: 'Abandon' } });
    expect(seenAtFirstForfeit).toEqual(expect.any(String));
  });

  it('échec en cours de route : arrêt, détail exact, disqualification gardée', async () => {
    seed();
    seedMatches();
    store.matches!.push(m('m8', T3, T1, { round_number: 8 }) as any);
    applyMatchScore
      .mockImplementationOnce(async (i: { matchId: string }) => ({
        matchId: i.matchId,
        updated: true,
        winnerTeamId: null,
      }))
      .mockImplementationOnce(async () => {
        throw new Error('verrou');
      });
    const res = await call({
      body: { team_id: T1, mode: 'forfeit', reason: 'Abandon' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      forfeited: ['m2'],
      failed: { id: 'm3', error: 'verrou' },
      notProcessed: ['m4', 'm5', 'm8'],
      complete: false,
    });
    // Le résumé couvre aussi le match en échec et les non traités.
    expect(Object.keys(res.body.matches).sort()).toEqual([
      'm2',
      'm3',
      'm4',
      'm5',
      'm8',
    ]);
    expect(res.body.matches.m8).toMatchObject({
      team1Name: 'Gamma',
      team2Name: 'Alpha',
    });
    expect(applyMatchScore).toHaveBeenCalledTimes(2);
    expect(entry(T1).disqualified_at).toEqual(expect.any(String));
    expect(logOf('disqualify_team').payload.complete).toBe(false);
  });
});

describe('POST …/disqualify — mode annul', () => {
  it('201 : matchs restants annulés et pronostics réglés, joués intacts', async () => {
    seed();
    seedMatches();
    const res = await call({
      body: { team_id: T1, mode: 'annul', reason: 'Triche avérée' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      mode: 'annul',
      forfeited: [],
      cancelled: ['m2', 'm3', 'm5'],
      skipped: [{ id: 'm4', reason: 'disputed' }],
      complete: true,
    });
    expect(applyMatchScore).not.toHaveBeenCalled();
    expect(settleMatchPredictions.mock.calls.map((c) => c[1])).toEqual([
      'm2',
      'm3',
      'm5',
    ]);
    expect(matchById('m2')).toMatchObject({
      status: 'cancelled',
      team1_score: null,
      team2_score: null,
      winner_team_id: null,
      notes: 'Report demandé\nAnnulé : Alpha disqualifiée',
    });
    expect(matchById('m3').notes).toBe('Annulé : Alpha disqualifiée');
    expect(matchById('m1')).toMatchObject({
      status: 'finished',
      winner_team_id: T1,
    });
    expect(matchById('m4').status).toBe('disputed');
    expect(matchById('m6').status).toBe('pending'); // supprimé : ignoré
    expect(matchById('m7').status).toBe('pending'); // autre équipe
    expect(entry(T1).disqualification_mode).toBe('annul');
  });
});

describe('DELETE …/disqualify — réintégration', () => {
  it('efface les colonnes, ne restaure rien, journal `reinstate_team`', async () => {
    seed();
    seedMatches();
    await call({
      body: { team_id: T1, mode: 'annul', reason: 'Triche avérée' },
    });

    const res = await call({
      method: 'DELETE',
      query: { stageId: STAGE, team_id: T1 },
      body: undefined,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      teamId: T1,
      reinstated: true,
      matchesNotRestored: 3,
    });
    expect(entry(T1)).toMatchObject({
      disqualified_at: null,
      disqualification_mode: null,
      disqualification_reason: null,
      disqualified_by: null,
    });
    expect(matchById('m2').status).toBe('cancelled');
    expect(logOf('reinstate_team').payload).toMatchObject({
      team_id: T1,
      previous_mode: 'annul',
      previous_reason: 'Triche avérée',
      matches_not_restored: 3,
    });
  });

  it('team_id accepté dans le corps ; absent → 400 ; pas disqualifiée → 409', async () => {
    seed();
    const missing = await call({ method: 'DELETE', body: {} });
    expect(missing.statusCode).toBe(400);

    const notDq = await call({ method: 'DELETE', body: { team_id: T2 } });
    expect(notDq.statusCode).toBe(409);
    expect(notDq.body.code).toBe('NOT_DISQUALIFIED');
  });
});

describe('GET …/teams expose la disqualification', () => {
  it('les quatre colonnes sont dans chaque ligne', async () => {
    seed();
    store.tournaments = [
      { id: TID, name: 'T', slug: 't', status: 'ongoing' },
    ] as any;
    Object.assign(entry(T2), {
      disqualified_at: '2026-10-01T00:00:00Z',
      disqualification_mode: 'forfeit',
      disqualification_reason: 'Abandon',
      disqualified_by: 'staff-1',
    });
    const res = makeRes();
    await teamsHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    const row = res.body.teams.find((t: any) => t.team_id === T2);
    expect(row).toMatchObject({
      disqualified_at: '2026-10-01T00:00:00Z',
      disqualification_mode: 'forfeit',
      disqualification_reason: 'Abandon',
      disqualified_by: 'staff-1',
    });
  });
});

describe('classement d’une phase avec une équipe disqualifiée', () => {
  /** T1 a tout gagné : 2 victoires. T2 bat T3. */
  function seedPlayed() {
    store.matches = [
      m('p1', T1, T2, {
        status: 'finished',
        winner_team_id: T1,
        team1_score: 2,
        team2_score: 0,
      }),
      m('p2', T1, T3, {
        status: 'walkover',
        winner_team_id: T1,
        team1_score: 2,
        team2_score: 0,
      }),
      m('p3', T2, T3, {
        status: 'finished',
        winner_team_id: T2,
        team1_score: 2,
        team2_score: 1,
      }),
    ] as any;
  }

  it('forfeit : ses matchs comptent, mais elle est classée en dernier et marquée', async () => {
    seed();
    seedPlayed();
    Object.assign(entry(T1), {
      disqualified_at: '2026-10-01T00:00:00Z',
      disqualification_mode: 'forfeit',
    });
    const st = await computeStageStandings(TID, STAGE, 'round_robin');
    expect(st.map((s) => s.teamId)).toEqual([T2, T3, T1]);
    expect(st.map((s) => s.rank)).toEqual([1, 2, 3]);
    expect(st[2]).toMatchObject({
      wins: 2,
      disqualified: true,
      disqualificationMode: 'forfeit',
    });
    expect(st[0]).toMatchObject({ wins: 1, losses: 1 });
    expect(st[0].disqualified).toBeUndefined();
  });

  it('annul : tous ses matchs sont ignorés, pour tout le monde', async () => {
    seed();
    seedPlayed();
    Object.assign(entry(T1), {
      disqualified_at: '2026-10-01T00:00:00Z',
      disqualification_mode: 'annul',
    });
    const st = await computeStageStandings(TID, STAGE, 'round_robin');
    expect(st.map((s) => s.teamId)).toEqual([T2, T3, T1]);
    expect(st[0]).toMatchObject({ wins: 1, losses: 0 });
    expect(st[1]).toMatchObject({ wins: 0, losses: 1 });
    expect(st[2]).toMatchObject({
      wins: 0,
      losses: 0,
      disqualified: true,
      disqualificationMode: 'annul',
    });
  });

  it('un override de départage ne remonte pas une disqualifiée', async () => {
    seed();
    store.matches = [] as any;
    Object.assign(entry(T1), {
      disqualified_at: '2026-10-01T00:00:00Z',
      disqualification_mode: 'forfeit',
    });
    store.stage_tiebreaker_overrides = [
      { stage_id: STAGE, winner_team_id: T1, loser_team_id: T2 },
    ] as any;
    const st = await computeStageStandings(TID, STAGE, 'round_robin');
    expect(st[st.length - 1].teamId).toBe(T1);
  });

  it('classement public : lignes marquées, matchs « annul » ni joués ni comptés', async () => {
    seed();
    seedPlayed();
    Object.assign(entry(T1), {
      disqualified_at: '2026-10-01T00:00:00Z',
      disqualification_mode: 'annul',
    });
    const [table] = await readPublicStandings(TID, TID);
    expect(table.rows.map((r) => r.teamId)).toEqual([T2, T3, T1]);
    expect(table.rows[0]).toMatchObject({
      played: 1,
      disqualified: false,
      disqualificationMode: null,
    });
    expect(table.rows[2]).toMatchObject({
      played: 0,
      mapsWon: 0,
      disqualified: true,
      disqualificationMode: 'annul',
    });
  });

  it('avancement automatique : une disqualifiée n’est jamais qualifiée', async () => {
    seed('round_robin', {
      advancement_rules: { advance_top: 3, target_stage_id: TARGET },
    });
    (store.tournament_stages as any[]).push({
      id: TARGET,
      tournament_id: TID,
      name: 'Finale',
      stage_type: 'bracket',
      is_active: true,
      settings: {},
    });
    seedPlayed();
    Object.assign(entry(T1), {
      disqualified_at: '2026-10-01T00:00:00Z',
      disqualification_mode: 'forfeit',
    });
    const out = await tryAutoAdvanceFromMatch({
      tenantId: TID,
      stageId: STAGE,
      staffId: null,
    });
    expect(out.triggered).toBe(true);
    expect(out.advancedTeamIds?.sort()).toEqual([T2, T3].sort());
  });
});

describe('avancement manuel', () => {
  it('409 TEAM_DISQUALIFIED si une équipe choisie est disqualifiée', async () => {
    const { default: advanceHandler } = await import(
      '../../pages/api/admin/stages/[stageId]/advance'
    );
    seed();
    (store.tournament_stages as any[]).push({
      id: TARGET,
      tournament_id: TID,
      name: 'Finale',
      stage_type: 'bracket',
      order_index: 1,
      is_active: true,
      settings: {},
    });
    Object.assign(entry(T1), {
      disqualified_at: '2026-10-01T00:00:00Z',
      disqualification_mode: 'forfeit',
    });
    const res = makeRes();
    await advanceHandler(
      makeReq({ body: { targetStageId: TARGET, teamIds: [T1, T2] } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('TEAM_DISQUALIFIED');
    expect(
      (store.stage_teams as any[]).filter((r) => r.stage_id === TARGET)
    ).toHaveLength(0);
  });
});
