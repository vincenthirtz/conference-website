// GET /api/player/matches/[matchId] — le fil du match (docs/PLAN-espace-joueur.md § J1).
//
// Ce que ces tests protègent, dans l'ordre d'importance :
//
//  1. LA GARDE. Un match qu'on ne joue pas répond 404 — pas 403 : « ce match
//     ne te regarde pas » n'a pas à confirmer qu'il existe.
//  2. LE CÔTÉ. Tout le reste (jeton de check-in, score, report) est relatif au
//     slot. Se tromper de côté fait rapporter le score de l'adversaire, et
//     c'est indétectable à l'œil dans la réponse.
//  3. LES PERMISSIONS. L'écran s'y fie pour n'afficher que des gestes qui
//     aboutiront : elles doivent suivre EXACTEMENT les routes d'écriture
//     (report = capitaine au sens strict, feuille = `validate_lineup`).

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import handler from '../../pages/api/player/matches/[matchId]';

const USER_ID = '00000000-0000-0000-0000-0000000000aa';
const CAPTAIN_ID = '00000000-0000-0000-0000-0000000000a1';
const OUTSIDER_ID = '00000000-0000-0000-0000-0000000000a2';
const TEAM_ID = '00000000-0000-0000-0000-0000000000bb';
const OTHER_TEAM_ID = '00000000-0000-0000-0000-0000000000cc';
const TOURNAMENT_ID = '00000000-0000-0000-0000-0000000000dd';
const MATCH_ID = '00000000-0000-0000-0000-0000000000ee';

let _bearer = 0;
function makeReq(over: Partial<any> = {}): any {
  _bearer += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_bearer}` },
    query: { matchId: MATCH_ID },
    body: {},
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

/** `slotOfMine` : de quel côté joue MON équipe dans le match semé. */
function seed(opts: { slotOfMine?: 1 | 2; minPlayers?: number | null } = {}) {
  const mineIsTeam1 = (opts.slotOfMine ?? 1) === 1;

  store.teams = [
    { id: TEAM_ID, name: 'Phenix', slug: 'phenix', captain_id: CAPTAIN_ID },
    { id: OTHER_TEAM_ID, name: 'Avoidgers', slug: 'avoidgers', captain_id: null },
  ] as any;

  store.team_members = [
    { id: 'tm-1', team_id: TEAM_ID, user_id: USER_ID, role: 'player' },
    { id: 'tm-2', team_id: TEAM_ID, user_id: CAPTAIN_ID, role: 'player' },
  ] as any;

  store.matches = [
    {
      id: MATCH_ID,
      tournament_id: TOURNAMENT_ID,
      status: 'pending',
      scheduled_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      match_format: 'bo3',
      round_name: 'J1',
      stream_url: null,
      team1_id: mineIsTeam1 ? TEAM_ID : OTHER_TEAM_ID,
      team2_id: mineIsTeam1 ? OTHER_TEAM_ID : TEAM_ID,
      team1_score: null,
      team2_score: null,
      winner_team_id: null,
      team1_checkin_token: 'token-team1',
      team2_checkin_token: 'token-team2',
      team1_checked_in_at: null,
      team2_checked_in_at: null,
      team1: mineIsTeam1
        ? { id: TEAM_ID, name: 'Phenix', slug: 'phenix' }
        : { id: OTHER_TEAM_ID, name: 'Avoidgers', slug: 'avoidgers' },
      team2: mineIsTeam1
        ? { id: OTHER_TEAM_ID, name: 'Avoidgers', slug: 'avoidgers' }
        : { id: TEAM_ID, name: 'Phenix', slug: 'phenix' },
      tournament: {
        id: TOURNAMENT_ID,
        name: 'OW Womens Cup 2026',
        slug: 'ow-womens-cup-2026',
        min_players: opts.minPlayers ?? null,
      },
    },
  ] as any;

  store.match_score_reports = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: USER_ID });
  seed();
});

describe('garde d’accès', () => {
  it('refuse POST', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('404 pour quelqu’un qui ne joue aucune des deux équipes', async () => {
    setAuthUser({ id: OUTSIDER_ID });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(404);
  });

  it('404 sur un match inexistant', async () => {
    const res = makeRes();
    await handler(
      makeReq({ query: { matchId: '00000000-0000-0000-0000-00000000dead' } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('perspective de l’équipe', () => {
  it('donne le jeton et l’adversaire du BON côté quand je suis team1', async () => {
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const b = res.body as any;
    expect(b.team.slot).toBe(1);
    expect(b.team.id).toBe(TEAM_ID);
    expect(b.opponent.id).toBe(OTHER_TEAM_ID);
    expect(b.checkin.token).toBe('token-team1');
    expect(b.checkin.alreadyCheckedIn).toBe(false);
  });

  it('bascule côté team2 sans rien inverser d’autre', async () => {
    seed({ slotOfMine: 2 });
    const res = makeRes();
    await handler(makeReq(), res);

    const b = res.body as any;
    expect(b.team.slot).toBe(2);
    expect(b.team.id).toBe(TEAM_ID);
    expect(b.opponent.id).toBe(OTHER_TEAM_ID);
    expect(b.checkin.token).toBe('token-team2');
  });

  it('n’expose de readiness que si le tournoi impose un minimum', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    expect((res.body as any).readiness).toBeNull();

    seed({ minPlayers: 5 });
    const res2 = makeRes();
    await handler(makeReq(), res2);
    // 2 membres semés, minimum 5 → il en manque 3.
    expect((res2.body as any).readiness).toEqual({
      minPlayers: 5,
      rosterSize: 2,
      shortfall: 3,
    });
  });
});

describe('état du rapport de score', () => {
  it('« none » tant que personne n’a rapporté', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    expect((res.body as any).report).toEqual({ state: 'none', mine: null });
  });

  it('« awaiting_opponent » et mon report relu DE MON CÔTÉ', async () => {
    store.match_score_reports = [
      { match_id: MATCH_ID, team_side: 1, team1_score: 2, team2_score: 1 },
    ] as any;
    const res = makeRes();
    await handler(makeReq(), res);

    const b = res.body as any;
    expect(b.report.state).toBe('awaiting_opponent');
    // Je suis team1 : 2–1 en absolu = 2–1 pour moi.
    expect(b.report.mine).toEqual({ mine: 2, opponent: 1 });
  });

  it('inverse le report quand je suis team2 — c’est tout l’enjeu du slot', async () => {
    seed({ slotOfMine: 2 });
    store.match_score_reports = [
      { match_id: MATCH_ID, team_side: 2, team1_score: 2, team2_score: 1 },
    ] as any;
    const res = makeRes();
    await handler(makeReq(), res);

    // 2–1 en absolu, vu de team2, se lit 1–2.
    expect((res.body as any).report.mine).toEqual({ mine: 1, opponent: 2 });
  });

  it('« awaiting_me » quand seul l’adversaire a rapporté', async () => {
    store.match_score_reports = [
      { match_id: MATCH_ID, team_side: 2, team1_score: 0, team2_score: 3 },
    ] as any;
    const res = makeRes();
    await handler(makeReq(), res);
    expect((res.body as any).report.state).toBe('awaiting_me');
  });

  it('un match en litige prime sur tout le reste', async () => {
    (store.matches as any[])[0].status = 'disputed';
    store.match_score_reports = [
      { match_id: MATCH_ID, team_side: 1, team1_score: 2, team2_score: 0 },
      { match_id: MATCH_ID, team_side: 2, team1_score: 0, team2_score: 2 },
    ] as any;
    const res = makeRes();
    await handler(makeReq(), res);
    expect((res.body as any).report.state).toBe('disputed');
  });
});

describe('permissions annoncées à l’écran', () => {
  it('une joueuse ordinaire ne peut ni aligner ni rapporter', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    expect((res.body as any).permissions).toEqual({
      validateLineup: false,
      reportScore: false,
    });
  });

  it('la capitaine peut les deux', async () => {
    setAuthUser({ id: CAPTAIN_ID });
    const res = makeRes();
    await handler(makeReq(), res);
    expect((res.body as any).permissions).toEqual({
      validateLineup: true,
      reportScore: true,
    });
  });

  it('un coach aligne mais ne rapporte pas — miroir de report-score.ts', async () => {
    (store.team_members as any[])[0].role = 'coach';
    const res = makeRes();
    await handler(makeReq(), res);
    expect((res.body as any).permissions).toEqual({
      validateLineup: true,
      reportScore: false,
    });
  });
});
