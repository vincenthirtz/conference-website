// Unit tests — route /api/player/team-reviews (N2).
//
// Ce qui ne se voit que dans le handler :
//
//   - l'écriture ouverte à TOUT membre (une mémoire réservée à la capitaine
//     n'est pas une mémoire d'équipe) ;
//   - le refus d'accrocher une revue à l'affrontement d'une AUTRE équipe —
//     sans cette garde, n'importe qui polluerait l'historique d'autrui ;
//   - les dérivés (`opponent_team_id`, `played_at`) posés par le SERVEUR et
//     jamais lus dans le body ;
//   - la suppression d'une revue vidée, plutôt qu'une coquille marquée
//     « débriefé » sans contenu.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';

import handler from '../../pages/api/player/team-reviews';

const TEAM_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEAM_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TEAM_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PLAYER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const OUTSIDER = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const MATCH_1 = '11111111-1111-1111-1111-111111111111';
const SCRIM_1 = '22222222-2222-2222-2222-222222222222';
/** Match entre deux AUTRES équipes — la cible de la garde d'appartenance. */
const FOREIGN_MATCH = '33333333-3333-3333-3333-333333333333';

let _tok = 0;
function makeReq(over: Partial<any> = {}): any {
  _tok += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_tok}` },
    query: {},
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

function seed() {
  store.teams = [
    {
      id: TEAM_A,
      name: 'Alpha',
      captain_id: 'captain-a',
      tenant_id: CONFERENCE_TENANT_ID,
      is_active: true,
      deleted_at: null,
    },
    {
      id: TEAM_B,
      name: 'Bravo',
      captain_id: 'captain-b',
      tenant_id: CONFERENCE_TENANT_ID,
      is_active: true,
      deleted_at: null,
    },
    {
      id: TEAM_C,
      name: 'Charlie',
      captain_id: 'captain-c',
      tenant_id: CONFERENCE_TENANT_ID,
      is_active: true,
      deleted_at: null,
    },
  ] as any;
  store.team_members = [
    {
      id: 'tm-player',
      team_id: TEAM_A,
      user_id: PLAYER,
      role: 'player',
      display_name: 'Joueuse',
      tenant_id: CONFERENCE_TENANT_ID,
    },
  ] as any;
  store.matches = [
    {
      id: MATCH_1,
      tenant_id: CONFERENCE_TENANT_ID,
      status: 'finished',
      scheduled_at: '2026-07-01T20:00:00.000Z',
      completed_at: '2026-07-01T21:30:00.000Z',
      round_name: 'Quart',
      team1_id: TEAM_A,
      team2_id: TEAM_B,
      team1_score: 3,
      team2_score: 1,
      winner_team_id: TEAM_A,
      deleted_at: null,
    },
    {
      id: FOREIGN_MATCH,
      tenant_id: CONFERENCE_TENANT_ID,
      status: 'finished',
      scheduled_at: '2026-07-02T20:00:00.000Z',
      completed_at: null,
      round_name: null,
      team1_id: TEAM_B,
      team2_id: TEAM_C,
      team1_score: 2,
      team2_score: 2,
      winner_team_id: null,
      deleted_at: null,
    },
  ] as any;
  store.scrims = [
    {
      id: SCRIM_1,
      tenant_id: CONFERENCE_TENANT_ID,
      name: 'Scrim du jeudi',
      status: 'completed',
      scheduled_date: '2026-07-10T19:00:00.000Z',
      completed_at: null,
      team1_id: TEAM_C,
      team2_id: TEAM_A,
      team1_score: 2,
      team2_score: 0,
      winner_team_id: TEAM_C,
      deleted_at: null,
    },
  ] as any;
  store.team_reviews = [] as any;
}

async function call(over: Partial<any> = {}) {
  const req = makeReq(over);
  const res = makeRes();
  await handler(req, res);
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  seed();
  setAuthUser({ id: PLAYER });
});

describe('accès', () => {
  it('laisse un membre sans rôle de gestion écrire une revue', async () => {
    const res = await call({
      method: 'PUT',
      body: {
        subjectType: 'match',
        subjectId: MATCH_1,
        notes: 'On perd le contrôle en milieu de map.',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(store.team_reviews).toHaveLength(1);
  });

  it('répond 200 et vide pour quelqu’un sans équipe', async () => {
    setAuthUser({ id: OUTSIDER });
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.teamId).toBeNull();
    expect(res.body.encounters).toEqual([]);
  });

  it('refuse l’écriture à quelqu’un sans équipe', async () => {
    setAuthUser({ id: OUTSIDER });
    const res = await call({
      method: 'PUT',
      body: { subjectType: 'match', subjectId: MATCH_1, notes: 'x' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejette une méthode non supportée', async () => {
    const res = await call({ method: 'POST' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET, PUT, DELETE');
  });
});

describe('garde d’appartenance', () => {
  it('refuse une revue sur l’affrontement d’une autre équipe', async () => {
    // Sans cette garde, n'importe qui polluerait l'historique d'autrui.
    const res = await call({
      method: 'PUT',
      body: {
        subjectType: 'match',
        subjectId: FOREIGN_MATCH,
        notes: 'pas mon match',
      },
    });
    expect(res.statusCode).toBe(404);
    expect(store.team_reviews).toHaveLength(0);
  });

  it('refuse un sujet inexistant', async () => {
    const res = await call({
      method: 'PUT',
      body: {
        subjectType: 'match',
        subjectId: '99999999-9999-9999-9999-999999999999',
        notes: 'x',
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('refuse un type de sujet inconnu', async () => {
    const res = await call({
      method: 'PUT',
      body: { subjectType: 'tournament', subjectId: MATCH_1, notes: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('écriture', () => {
  it('dérive l’adversaire et la date côté serveur, sans lire le body', async () => {
    await call({
      method: 'PUT',
      body: {
        subjectType: 'match',
        subjectId: MATCH_1,
        notes: 'ok',
        // Valeurs hostiles : elles ne doivent jamais atterrir en base.
        opponent_team_id: TEAM_C,
        played_at: '1999-01-01T00:00:00.000Z',
      },
    });
    const row = store.team_reviews[0] as any;
    expect(row.opponent_team_id).toBe(TEAM_B);
    expect(row.played_at).toBe('2026-07-01T21:30:00.000Z');
    expect(row.team_id).toBe(TEAM_A);
  });

  it('refuse un lien de VOD exécutable', async () => {
    const res = await call({
      method: 'PUT',
      body: {
        subjectType: 'match',
        subjectId: MATCH_1,
        vodUrl: 'javascript:alert(1)',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(store.team_reviews).toHaveLength(0);
  });

  it('met à jour au lieu d’empiler une seconde revue', async () => {
    const put = (notes: string) =>
      call({
        method: 'PUT',
        body: { subjectType: 'match', subjectId: MATCH_1, notes },
      });
    await put('première');
    await put('seconde');
    expect(store.team_reviews).toHaveLength(1);
    expect((store.team_reviews[0] as any).notes).toBe('seconde');
  });

  it('supprime la revue quand on la vide, sans laisser de coquille', async () => {
    await call({
      method: 'PUT',
      body: { subjectType: 'match', subjectId: MATCH_1, notes: 'à effacer' },
    });
    const res = await call({
      method: 'PUT',
      body: { subjectType: 'match', subjectId: MATCH_1, notes: '', vodUrl: '' },
    });
    expect(res.statusCode).toBe(200);
    expect(store.team_reviews).toHaveLength(0);
  });

  it('supprime sur DELETE', async () => {
    await call({
      method: 'PUT',
      body: { subjectType: 'scrim', subjectId: SCRIM_1, notes: 'note' },
    });
    const res = await call({
      method: 'DELETE',
      query: { subjectType: 'scrim', subjectId: SCRIM_1 },
    });
    expect(res.statusCode).toBe(200);
    expect(store.team_reviews).toHaveLength(0);
  });
});

describe('historique', () => {
  it('mêle matchs et scrims, le plus récent d’abord, avec l’adversaire nommé', async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(res.body.encounters.map((e: any) => e.subjectId)).toEqual([
      SCRIM_1,
      MATCH_1,
    ]);
    const scrim = res.body.encounters[0];
    expect(scrim.subjectType).toBe('scrim');
    expect(scrim.opponentName).toBe('Charlie');
    // Score du point de vue de MON équipe (elle est team2 sur ce scrim).
    expect(scrim.myScore).toBe(0);
    expect(scrim.opponentScore).toBe(2);
    expect(scrim.result).toBe('loss');
  });

  it('exclut l’affrontement des autres équipes', async () => {
    const res = await call();
    expect(
      res.body.encounters.some((e: any) => e.subjectId === FOREIGN_MATCH)
    ).toBe(false);
  });

  it('renvoie les adversaires rencontrés pour le filtre', async () => {
    const res = await call();
    const ids = res.body.opponents.map((o: any) => o.id).sort();
    expect(ids).toEqual([TEAM_B, TEAM_C].sort());
  });

  it('compte les affrontements débriefés', async () => {
    expect((await call()).body.reviewedCount).toBe(0);
    await call({
      method: 'PUT',
      body: { subjectType: 'match', subjectId: MATCH_1, notes: 'note' },
    });
    const res = await call();
    expect(res.body.reviewedCount).toBe(1);
    const match = res.body.encounters.find((e: any) => e.subjectId === MATCH_1);
    expect(match.review.notes).toBe('note');
  });
});

/* ---------------------------------------------------------------------------
 * Objectifs d'avant-match — lot J5 (docs/PLAN-espace-joueur.md).
 *
 * La boucle du coach : les objectifs sont posés AVANT le match, sur la même
 * ligne que la revue. Deux invariants en découlent, et ce sont eux qui cassent
 * si quelqu'un traite `objectives` comme un champ ordinaire :
 *   - des objectifs SEULS font exister la revue (sinon ils sont supprimés à
 *     l'enregistrement, la revue étant jugée « vide ») ;
 *   - vider les notes ne doit pas emporter les objectifs.
 * ------------------------------------------------------------------------- */

describe('objectifs d’avant-match', () => {
  it('des objectifs seuls créent la revue', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        method: 'PUT',
        body: {
          subjectType: 'match',
          subjectId: MATCH_1,
          objectives: 'Tenir le premier point',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const rows = store.team_reviews as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].objectives).toBe('Tenir le premier point');
    expect(rows[0].notes).toBeNull();
  });

  it('les objectifs survivent à une revue écrite ensuite', async () => {
    await handler(
      makeReq({
        method: 'PUT',
        body: {
          subjectType: 'match',
          subjectId: MATCH_1,
          objectives: 'Tenir le premier point',
        },
      }),
      makeRes()
    );
    await handler(
      makeReq({
        method: 'PUT',
        body: {
          subjectType: 'match',
          subjectId: MATCH_1,
          objectives: 'Tenir le premier point',
          notes: 'On a tenu.',
        },
      }),
      makeRes()
    );

    const rows = store.team_reviews as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].objectives).toBe('Tenir le premier point');
    expect(rows[0].notes).toBe('On a tenu.');
  });

  it('le GET rend les objectifs sur l’affrontement', async () => {
    await handler(
      makeReq({
        method: 'PUT',
        body: {
          subjectType: 'match',
          subjectId: MATCH_1,
          objectives: 'Ne pas forcer les ultimates',
        },
      }),
      makeRes()
    );

    const res = makeRes();
    await handler(makeReq(), res);
    const encounter = (res.body as any).encounters.find(
      (e: any) => e.subjectId === MATCH_1
    );
    expect(encounter.review.objectives).toBe('Ne pas forcer les ultimates');
  });
});
