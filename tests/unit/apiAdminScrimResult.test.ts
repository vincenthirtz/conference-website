// tests/unit/apiAdminScrimResult.test.ts
//
// POST /api/admin/scrims/[scrimId]/result — le staff saisit ou corrige le score
// final d'un scrim.
//
// Ce que ces tests verrouillent :
//   * le cas d'origine : un scrim contre une équipe EXTÉRIEURE (sans capitaine)
//     peut enfin recevoir un résultat ;
//   * un litige se tranche avec un score, et les reports capitaines partent ;
//   * les refus (annulé, équipes manquantes, scores invalides, scrim modifié
//     entre la lecture et l'écriture) n'écrivent rien ;
//   * une CORRECTION ne paie pas deux fois (clé `scrim:<id>`, correctif du
//     2026-09-15) et ne ré-annonce pas la fin du scrim.
//
// Le miroir noté est RÉEL (rating + récompenses TCG sur le mock en mémoire) :
// c'est lui qui porte l'idempotence des gains, le simuler viderait le test de
// son objet. On l'enveloppe seulement d'un espion pour vérifier l'appel.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { logStaffActionMock, emitScrimEventMock, syncSpy } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async (..._args: unknown[]) => undefined),
  emitScrimEventMock: vi.fn(async (..._args: unknown[]) => undefined),
  syncSpy: vi.fn(),
}));
vi.mock('@/utils/staffLogs', () => ({ logStaffAction: logStaffActionMock }));
vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: vi.fn(async () => undefined),
}));
vi.mock('@/utils/scrimEvents', () => ({
  emitScrimEvent: emitScrimEventMock,
  statusTransitionEvent: () => null,
}));
vi.mock('@/utils/scrims/ratedMatch', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('../../utils/scrims/ratedMatch')>();
  return {
    ...real,
    syncScrimRatedMatch: async (tenantId: string, scrimId: string) => {
      syncSpy(tenantId, scrimId);
      return real.syncScrimRatedMatch(tenantId, scrimId);
    },
  };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import resultHandler from '../../pages/api/admin/scrims/[scrimId]/result';
import { applyStaffScrimResult } from '../../utils/scrims/scrimResult';

const TENANT = CONFERENCE_TENANT_ID;
const SCRIM_ID = '11111111-1111-4111-8111-111111111111';
const TEAM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXTERNAL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CAPTAIN_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const A1 = 'd0000000-0000-4000-8000-00000000000a';
const A2 = 'd0000000-0000-4000-8000-00000000000b';
const STAFF_AUTH = 'user-staff-1';

let _tok = 0;
function bearer() {
  _tok += 1;
  return `Bearer t-${Date.now()}-${_tok}`;
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

function staffRow(): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: STAFF_AUTH,
    email: 'a@a.com',
    role: 'admin',
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

const scrim = () => (store.scrims as any[])[0];
const mirrors = () =>
  ((store.matches as any[]) || []).filter((m) => m.scrim_id === SCRIM_ID);
const packsOf = (u: string) =>
  ((store.tcg_packs as any[]) || []).filter((p) => p.user_id === u);
const coinsOf = (u: string) =>
  ((store.tcg_wallet_entries as any[]) || []).filter((e) => e.user_id === u);

/**
 * Alpha (vraie équipe, deux joueuses) contre une équipe EXTÉRIEURE : créée à
 * la volée, inactive, sans capitaine ni effectif — personne pour rapporter.
 */
function seed(over: Record<string, unknown> = {}) {
  store.staff = [staffRow()] as any;
  store.teams = [
    {
      id: TEAM_A,
      name: 'Alpha',
      captain_id: CAPTAIN_A,
      tenant_id: TENANT,
      is_active: true,
    },
    {
      id: EXTERNAL,
      name: 'Les Invitées',
      captain_id: null,
      tenant_id: TENANT,
      is_active: false,
    },
  ] as any;
  store.team_members = [
    {
      tenant_id: TENANT,
      team_id: TEAM_A,
      user_id: A1,
      role: 'player',
      is_substitute: false,
      battle_tag: null,
    },
    {
      tenant_id: TENANT,
      team_id: TEAM_A,
      user_id: A2,
      role: 'player',
      is_substitute: false,
      battle_tag: null,
    },
  ] as any;
  store.scrims = [
    {
      id: SCRIM_ID,
      tenant_id: TENANT,
      name: 'Alpha vs Les Invitées',
      slug: 'alpha-invitees',
      status: 'scheduled',
      ranked: true,
      scheduled_date: '2026-09-01T18:00:00.000Z',
      completed_at: null,
      stream_url: null,
      team1_id: TEAM_A,
      team2_id: EXTERNAL,
      team1_score: null,
      team2_score: null,
      winner_team_id: null,
      dispute_reason: null,
      deleted_at: null,
      ...over,
    },
  ] as any;
  store.scrim_score_reports = [] as any;
  store.matches = [] as any;
  store.match_participants = [] as any;
  store.player_ratings = [] as any;
  store.player_rating_history = [] as any;
}

async function postResult(body: unknown, method = 'POST') {
  setAuthUser({ id: STAFF_AUTH });
  const res = makeRes();
  await resultHandler(
    {
      method,
      headers: { host: 'h', authorization: bearer() },
      query: { scrimId: SCRIM_ID },
      body,
    } as any,
    res
  );
  return res;
}

const lastLog = () =>
  logStaffActionMock.mock.calls.map((c) => c[0] as any).at(-1);

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  emitScrimEventMock.mockClear();
  syncSpy.mockClear();
  seed();
});

describe('POST /api/admin/scrims/[scrimId]/result — saisie', () => {
  it('scrim planifié contre une équipe extérieure : clos, vainqueur, miroir, annonce, audit', async () => {
    const res = await postResult({ team1_score: 2, team2_score: 1 });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      winner_team_id: TEAM_A,
      correction: false,
      rating_rebuild_advised: false,
    });
    expect(scrim()).toMatchObject({
      status: 'completed',
      team1_score: 2,
      team2_score: 1,
      winner_team_id: TEAM_A,
      dispute_reason: null,
    });
    expect(scrim().completed_at).toBeTruthy();

    // Miroir noté réaligné (appel vérifié ET effet observé).
    expect(syncSpy).toHaveBeenCalledWith(TENANT, SCRIM_ID);
    expect(mirrors()).toHaveLength(1);
    expect(mirrors()[0]).toMatchObject({
      status: 'finished',
      winner_team_id: TEAM_A,
    });

    // Annonce de fin : une seule, avec les scores.
    expect(emitScrimEventMock).toHaveBeenCalledTimes(1);
    const [eventName, row, tenant, extras] = emitScrimEventMock.mock
      .calls[0] as any[];
    expect(eventName).toBe('scrim.finished');
    expect(row.id).toBe(SCRIM_ID);
    expect(tenant).toBe(TENANT);
    expect(extras).toMatchObject({
      previousStatus: 'scheduled',
      team1Score: 2,
      team2Score: 1,
      winnerTeamId: TEAM_A,
      ranked: true,
      decidedBy: 'staff',
    });

    expect(lastLog()).toMatchObject({
      staff_id: 'staff-1',
      entity_type: 'scrim',
      entity_id: SCRIM_ID,
      payload: {
        subject: 'scrim_result',
        before: { status: 'scheduled', team1_score: null, team2_score: null },
        after: {
          status: 'completed',
          team1_score: 2,
          team2_score: 1,
          winner_team_id: TEAM_A,
        },
        correction: false,
      },
    });
  });

  it('match nul : vainqueur null, pas de miroir noté', async () => {
    const res = await postResult({ team1_score: 1, team2_score: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.body.winner_team_id).toBeNull();
    expect(scrim()).toMatchObject({
      status: 'completed',
      winner_team_id: null,
    });
    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(mirrors()).toHaveLength(0);
  });

  it('litige tranché : completed, raison effacée, reports purgés et journalisés', async () => {
    seed({
      status: 'disputed',
      dispute_reason: 'Reports divergents : 2-0 vs 0-2.',
    });
    store.scrim_score_reports = [
      {
        tenant_id: TENANT,
        scrim_id: SCRIM_ID,
        team_side: 1,
        team1_score: 2,
        team2_score: 0,
      },
      {
        tenant_id: TENANT,
        scrim_id: SCRIM_ID,
        team_side: 2,
        team1_score: 0,
        team2_score: 2,
      },
    ] as any;

    const res = await postResult({ team1_score: 2, team2_score: 0 });
    expect(res.statusCode).toBe(200);
    expect(res.body.purged_reports).toBe(2);
    expect(scrim()).toMatchObject({
      status: 'completed',
      dispute_reason: null,
      winner_team_id: TEAM_A,
    });
    expect(store.scrim_score_reports).toHaveLength(0);
    const log = lastLog();
    expect(log.payload.before).toMatchObject({
      status: 'disputed',
      dispute_reason: 'Reports divergents : 2-0 vs 0-2.',
    });
    expect(log.payload.purged_reports).toHaveLength(2);
    expect(emitScrimEventMock).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/admin/scrims/[scrimId]/result — refus', () => {
  it('405 hors POST', async () => {
    const res = await postResult({}, 'GET');
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('scrim annulé → 409 SCRIM_CANCELLED, rien d’écrit', async () => {
    seed({ status: 'cancelled' });
    const res = await postResult({ team1_score: 2, team2_score: 0 });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('SCRIM_CANCELLED');
    expect(scrim()).toMatchObject({ status: 'cancelled', team1_score: null });
    expect(syncSpy).not.toHaveBeenCalled();
    expect(emitScrimEventMock).not.toHaveBeenCalled();
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('équipe manquante → 400', async () => {
    seed({ team2_id: null });
    const res = await postResult({ team1_score: 2, team2_score: 0 });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('SCRIM_TEAMS_MISSING');
    expect(scrim().status).toBe('scheduled');
  });

  it('scrim supprimé ou inconnu → 404', async () => {
    seed({ deleted_at: '2026-09-10T00:00:00.000Z' });
    const res = await postResult({ team1_score: 2, team2_score: 0 });
    expect(res.statusCode).toBe(404);
  });

  it.each([
    [{ team1_score: -1, team2_score: 0 }],
    [{ team1_score: 100, team2_score: 0 }],
    [{ team1_score: 1.5, team2_score: 0 }],
    [{ team1_score: '2', team2_score: 0 }],
    [{ team1_score: 2 }],
    [null],
  ])('scores invalides %j → 400', async (body) => {
    const res = await postResult(body);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
    expect(scrim().status).toBe('scheduled');
  });

  it('statut changé entre la lecture et l’écriture → 409 SCRIM_CHANGED, rien d’écrit ni resynchronisé', async () => {
    // La route a lu `scheduled` ; les capitaines ont clos le scrim entre-temps.
    seed({
      status: 'completed',
      team1_score: 0,
      team2_score: 2,
      winner_team_id: EXTERNAL,
    });
    const out = await applyStaffScrimResult(
      TENANT,
      { id: SCRIM_ID, team1_id: TEAM_A, team2_id: EXTERNAL },
      'scheduled',
      2,
      0
    );
    expect(out).toMatchObject({
      ok: false,
      status: 409,
      code: 'SCRIM_CHANGED',
    });
    expect(scrim()).toMatchObject({
      team1_score: 0,
      team2_score: 2,
      winner_team_id: EXTERNAL,
    });
    expect(syncSpy).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/scrims/[scrimId]/result — correction', () => {
  it('ne repaie pas, ne ré-annonce pas, ne re-note pas ; signale le rebuild si le vainqueur change', async () => {
    // 1) Première saisie : Alpha gagne, ses deux joueuses sont payées.
    expect(
      (await postResult({ team1_score: 2, team2_score: 0 })).statusCode
    ).toBe(200);
    expect(packsOf(A1)).toHaveLength(1);
    expect(coinsOf(A1)).toHaveLength(1);
    expect(coinsOf(A1)[0]).toMatchObject({
      source_kind: 'scrim_win',
      source_ref: `scrim:${SCRIM_ID}`,
    });
    const mirrorId = mirrors()[0].id;
    const gamesPlayed = () =>
      ((store.player_ratings as any[]) || []).find((r) => r.user_id === A1)
        ?.games_played;
    expect(gamesPlayed()).toBe(1);

    // 2) Correction du score, même vainqueur.
    const same = await postResult({ team1_score: 3, team2_score: 1 });
    expect(same.statusCode).toBe(200);
    expect(same.body).toMatchObject({
      correction: true,
      rating_rebuild_advised: false,
    });
    expect(scrim()).toMatchObject({ team1_score: 3, team2_score: 1 });
    expect(mirrors()).toHaveLength(1);
    expect(mirrors()[0]).toMatchObject({
      id: mirrorId,
      team1_score: 3,
      team2_score: 1,
    });
    expect(lastLog().payload).toMatchObject({
      correction: true,
      before: { status: 'completed', team1_score: 2, team2_score: 0 },
      after: { team1_score: 3, team2_score: 1 },
    });

    // 3) Correction qui renverse le vainqueur.
    const flipped = await postResult({ team1_score: 0, team2_score: 2 });
    expect(flipped.statusCode).toBe(200);
    expect(flipped.body).toMatchObject({
      correction: true,
      winner_team_id: EXTERNAL,
      rating_rebuild_advised: true,
    });

    // Une seule annonce de fin sur les trois écritures.
    expect(emitScrimEventMock).toHaveBeenCalledTimes(1);
    // Le miroir a été resynchronisé à chaque écriture…
    expect(syncSpy).toHaveBeenCalledTimes(3);
    // …sans rien repayer ni re-noter.
    expect(packsOf(A1)).toHaveLength(1);
    expect(packsOf(A2)).toHaveLength(1);
    expect(coinsOf(A1)).toHaveLength(1);
    expect(coinsOf(A2)).toHaveLength(1);
    expect(gamesPlayed()).toBe(1);
    expect(mirrors()).toHaveLength(1);
  });
});
