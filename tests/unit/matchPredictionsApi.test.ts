// Pronostics — routes de l'espace joueuse.
// Target: pages/api/player/predictions/[matchId].ts, pages/api/player/predictions/index.ts
//
// CE QUE CES CAS PROTÈGENT.
//   1. ON NE PRONOSTIQUE PAS SON PROPRE MATCH (roster, capitaine) et le staff
//      ne pronostique pas : ce sont les personnes qui peuvent orienter ou saisir
//      le résultat.
//   2. TROP TARD, C'EST TROP TARD : un match lancé refuse l'écriture, et le
//      message du déclencheur en base est traduit en code lisible.
//   3. LA RÉPARTITION RESTE CACHÉE TANT QUE C'EST OUVERT, pour ne pas
//      transformer le pronostic en suivi de foule.
//   4. UN MATCH D'UN AUTRE ESPACE N'EXISTE PAS (404).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetSupabaseMock,
  setAuthUser,
  setTableWriteError,
  store,
} from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import { invalidateStaffCache } from '../../utils/staff';
import { MATCH_PREDICTION_COINS } from '../../utils/tcg/earnSources';

import matchHandler from '../../pages/api/player/predictions/[matchId]';
import listHandler from '../../pages/api/player/predictions/index';

const PLAYER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const TEAM_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const TEAM_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const TEAM_C = 'cccccccc-0000-4000-8000-000000000003';
const MATCH = '33333333-3333-4333-8333-333333333333';
const MATCH_OWN = '44444444-4444-4444-8444-444444444444';
const TOURNAMENT = '55555555-5555-4555-8555-555555555555';
const OTHER_TENANT = '66666666-6666-4666-8666-666666666666';

const inOneDay = () => new Date(Date.now() + 86_400_000).toISOString();

let _token = 0;
function makeReq(over: any = {}): any {
  _token += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_token}` },
    cookies: {},
    query: { matchId: MATCH },
    body: undefined,
    ...over,
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function matchRow(over: Record<string, unknown> = {}) {
  return {
    id: MATCH,
    tenant_id: DEFAULT_TENANT_ID,
    tournament_id: TOURNAMENT,
    scrim_id: null,
    team1_id: TEAM_A,
    team2_id: TEAM_B,
    winner_team_id: null,
    forfeit_team_id: null,
    status: 'pending',
    is_bye: false,
    deleted_at: null,
    scheduled_at: inOneDay(),
    started_at: null,
    completed_at: null,
    ...over,
  };
}

const predictions = () => (store.match_predictions ?? []) as any[];

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: PLAYER });
  store.matches = [matchRow()] as any;
  store.teams = [
    {
      id: TEAM_A,
      tenant_id: DEFAULT_TENANT_ID,
      name: 'Alpha',
      captain_id: null,
    },
    {
      id: TEAM_B,
      tenant_id: DEFAULT_TENANT_ID,
      name: 'Bravo',
      captain_id: null,
    },
    {
      id: TEAM_C,
      tenant_id: DEFAULT_TENANT_ID,
      name: 'Charlie',
      captain_id: PLAYER,
    },
  ] as any;
  store.tournaments = [
    { id: TOURNAMENT, tenant_id: DEFAULT_TENANT_ID, name: 'Cup 2026' },
  ] as any;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PUT /api/player/predictions/{matchId}', () => {
  it('enregistre un pronostic puis accepte un changement d’avis', async () => {
    const res = makeRes();
    await matchHandler(
      makeReq({ method: 'PUT', body: { teamId: TEAM_A } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.prediction.teamId).toBe(TEAM_A);
    expect(predictions()).toHaveLength(1);

    const again = makeRes();
    await matchHandler(
      makeReq({ method: 'PUT', body: { teamId: TEAM_B } }),
      again
    );
    expect(again.statusCode).toBe(200);
    // Toujours UNE ligne : un pronostic par personne et par match.
    expect(predictions()).toHaveLength(1);
    expect(predictions()[0].predicted_winner_team_id).toBe(TEAM_B);
    // Aucune pièce au clic : le crédit vient au résultat.
    expect(store.tcg_wallet_entries ?? []).toHaveLength(0);
  });

  it('refuse une joueuse d’un des deux rosters', async () => {
    store.team_members = [
      { team_id: TEAM_B, user_id: PLAYER, tenant_id: DEFAULT_TENANT_ID },
    ] as any;
    const res = makeRes();
    await matchHandler(
      makeReq({ method: 'PUT', body: { teamId: TEAM_A } }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('participant');
    expect(predictions()).toHaveLength(0);
  });

  it('refuse la capitaine d’une des deux équipes', async () => {
    store.teams = [
      {
        id: TEAM_A,
        tenant_id: DEFAULT_TENANT_ID,
        name: 'Alpha',
        captain_id: PLAYER,
      },
      {
        id: TEAM_B,
        tenant_id: DEFAULT_TENANT_ID,
        name: 'Bravo',
        captain_id: null,
      },
    ] as any;
    const res = makeRes();
    await matchHandler(
      makeReq({ method: 'PUT', body: { teamId: TEAM_B } }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('participant');
  });

  it('refuse le staff actif', async () => {
    store.staff = [
      {
        id: 's1',
        auth_user_id: PLAYER,
        role: 'admin',
        is_active: true,
        deleted_at: null,
      },
    ] as any;
    const res = makeRes();
    await matchHandler(
      makeReq({ method: 'PUT', body: { teamId: TEAM_A } }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('staff');
  });

  it('refuse un match lancé ou dont l’heure est passée', async () => {
    store.matches = [
      matchRow({ scheduled_at: new Date(Date.now() - 60_000).toISOString() }),
    ] as any;
    const res = makeRes();
    await matchHandler(
      makeReq({ method: 'PUT', body: { teamId: TEAM_A } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('locked');
  });

  it('traduit le refus du déclencheur en base en code lisible', async () => {
    // La fenêtre entre la lecture du match et l'écriture : c'est la base qui
    // tranche, et l'interface doit pouvoir dire « trop tard ».
    setTableWriteError('match_predictions', {
      message: 'prediction_locked',
    });
    const res = makeRes();
    await matchHandler(
      makeReq({ method: 'PUT', body: { teamId: TEAM_A } }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('locked');
  });

  it('refuse une équipe qui ne joue pas ce match', async () => {
    const res = makeRes();
    await matchHandler(
      makeReq({ method: 'PUT', body: { teamId: TEAM_C } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('invalid_team');
  });

  it('ne connaît pas un match d’un autre espace', async () => {
    store.matches = [matchRow({ tenant_id: OTHER_TENANT })] as any;
    const res = makeRes();
    await matchHandler(
      makeReq({ method: 'PUT', body: { teamId: TEAM_A } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/player/predictions/{matchId}', () => {
  it('rend l’état ouvert, sans répartition', async () => {
    store.match_predictions = [
      {
        id: 'p1',
        tenant_id: DEFAULT_TENANT_ID,
        match_id: MATCH,
        user_id: OTHER,
        predicted_winner_team_id: TEAM_A,
        result: null,
        updated_at: new Date().toISOString(),
      },
    ] as any;
    const res = makeRes();
    await matchHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.window).toBe('open');
    expect(res.body.reward).toBe(MATCH_PREDICTION_COINS);
    expect(res.body.prediction).toBeNull();
    expect(res.body.ineligibility).toBeNull();
    expect(res.body.distribution).toBeNull();
  });

  it('rend la répartition une fois verrouillé', async () => {
    store.matches = [matchRow({ status: 'ongoing' })] as any;
    const row = (user: string, team: string) => ({
      id: `p-${user}-${team}`,
      tenant_id: DEFAULT_TENANT_ID,
      match_id: MATCH,
      user_id: user,
      predicted_winner_team_id: team,
      result: null,
      updated_at: new Date().toISOString(),
    });
    store.match_predictions = [
      row(PLAYER, TEAM_A),
      row(OTHER, TEAM_A),
      row('77777777-7777-4777-8777-777777777777', TEAM_B),
    ] as any;
    const res = makeRes();
    await matchHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.window).toBe('locked');
    expect(res.body.prediction.teamId).toBe(TEAM_A);
    expect(res.body.distribution).toEqual({ team1: 2, team2: 1 });
  });
});

describe('DELETE /api/player/predictions/{matchId}', () => {
  it('retire son pronostic tant que c’est ouvert', async () => {
    store.match_predictions = [
      {
        id: 'p1',
        tenant_id: DEFAULT_TENANT_ID,
        match_id: MATCH,
        user_id: PLAYER,
        predicted_winner_team_id: TEAM_A,
        result: null,
        settled_at: null,
        updated_at: new Date().toISOString(),
      },
    ] as any;
    const res = makeRes();
    await matchHandler(makeReq({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(200);
    expect(predictions()).toHaveLength(0);
  });
});

describe('GET /api/player/predictions', () => {
  it('liste les matchs ouverts hors matchs de ses équipes', async () => {
    store.matches = [
      matchRow(),
      matchRow({ id: MATCH_OWN, team1_id: TEAM_C, team2_id: TEAM_B }),
    ] as any;
    const res = makeRes();
    await listHandler(makeReq({ query: {} }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.open.map((m: any) => m.matchId)).toEqual([MATCH]);
    expect(res.body.open[0].team1.name).toBe('Alpha');
    expect(res.body.open[0].tournamentName).toBe('Cup 2026');
    expect(res.body.recent).toEqual([]);
    expect(res.body.ineligibility).toBeNull();
  });
});
