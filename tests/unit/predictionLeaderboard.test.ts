// Classement des pronostiqueuses.
// Targets : utils/predictions/leaderboard.ts (pur),
//           utils/predictions/readLeaderboard.ts,
//           pages/api/player/predictions/leaderboard.ts
//
// CE QUE CES CAS PROTÈGENT, par ordre d'importance :
//   1. ON NE NOMME PERSONNE SANS ACCORD. Le classement fait apparaître des
//      spectatrices ; la règle du dépôt est constante — opt-in, derrière
//      connexion, jamais d'annuaire. Le test qui compte est celui qui vérifie
//      qu'un pseudo n'apparaît QUE pour qui l'a accepté.
//   2. LE CLASSEMENT RESTE JUSTE : tout le monde est compté, même anonyme,
//      sinon les rangs mentent.
//   3. LES PRONOSTICS SANS SUITE (forfait, annulation) ne comptent ni en bien
//      ni en mal.
//   4. LES EX ÆQUO PARTAGENT LEUR RANG, et le seuil d'entrée évite qu'un seul
//      pronostic juste prenne la première place.

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import { MATCH_PREDICTION_COINS } from '../../utils/tcg/earnSources';
import {
  MIN_SETTLED_FOR_RANK,
  buildLeaderboard,
  tallyPredictions,
} from '../../utils/predictions/leaderboard';
import handler from '../../pages/api/player/predictions/leaderboard';

const U = (n: number) =>
  `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ME = U(1);
const MATCH = 'cccccccc-0000-4000-8000-000000000001';
const TOURNAMENT = 'dddddddd-0000-4000-8000-000000000002';

let _token = 0;
function makeReq(over: Partial<any> = {}): any {
  _token += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_token}` },
    cookies: {},
    query: {},
    body: {},
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

let _row = 0;
function prediction(userId: string, result: 'won' | 'lost' | 'void' | null) {
  _row += 1;
  return {
    id: `p-${_row}`,
    tenant_id: DEFAULT_TENANT_ID,
    match_id: MATCH,
    user_id: userId,
    predicted_winner_team_id: 'bbbbbbbb-0000-4000-8000-000000000009',
    result,
    settled_at: result ? '2026-09-16T10:00:00.000Z' : null,
    updated_at: '2026-09-15T10:00:00.000Z',
  };
}

beforeEach(() => {
  resetSupabaseMock();
  _row = 0;
  setAuthUser({ id: ME });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('réducteur pur', () => {
  it('ignore les pronostics sans suite et ceux qui ne sont pas réglés', () => {
    const tallies = tallyPredictions(
      [
        { userId: U(2), result: 'won' },
        { userId: U(2), result: 'void' },
        { userId: U(2), result: null },
        { userId: U(2), result: 'lost' },
      ],
      MATCH_PREDICTION_COINS
    );
    expect(tallies).toEqual([
      {
        userId: U(2),
        settled: 2,
        correct: 1,
        accuracy: 0.5,
        coins: MATCH_PREDICTION_COINS,
      },
    ]);
  });

  it('classe par justes, puis précision, puis volume', () => {
    const rows = [
      // 4 justes sur 5
      ...Array.from({ length: 4 }, () => ({
        userId: U(2),
        result: 'won' as const,
      })),
      { userId: U(2), result: 'lost' as const },
      // 4 justes sur 4 : même total, meilleure précision → devant
      ...Array.from({ length: 4 }, () => ({
        userId: U(3),
        result: 'won' as const,
      })),
    ];
    const board = buildLeaderboard(rows, {
      rewardCoins: MATCH_PREDICTION_COINS,
    });
    expect(board.ranked.map((r) => r.userId)).toEqual([U(3), U(2)]);
    expect(board.ranked.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('donne le même rang aux ex æquo, et saute le suivant', () => {
    const rows = [
      ...Array.from({ length: 3 }, () => ({
        userId: U(2),
        result: 'won' as const,
      })),
      ...Array.from({ length: 3 }, () => ({
        userId: U(3),
        result: 'won' as const,
      })),
      ...Array.from({ length: 3 }, () => ({
        userId: U(4),
        result: 'lost' as const,
      })),
    ];
    const board = buildLeaderboard(rows, {
      rewardCoins: MATCH_PREDICTION_COINS,
    });
    expect(board.ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it('garde hors classement qui n’a pas atteint le seuil', () => {
    const board = buildLeaderboard(
      [
        { userId: U(2), result: 'won' },
        { userId: U(2), result: 'won' },
      ],
      { rewardCoins: MATCH_PREDICTION_COINS }
    );
    expect(board.ranked).toEqual([]);
    expect(board.pending).toHaveLength(1);
    expect(board.minSettled).toBe(MIN_SETTLED_FOR_RANK);
  });
});

describe('GET /api/player/predictions/leaderboard', () => {
  function seed() {
    store.match_predictions = [
      // U(2) : 4 justes → 1re, et a accepté d'être nommée
      ...Array.from({ length: 4 }, () => prediction(U(2), 'won')),
      // moi : 3 justes, 1 manqué → 2e, sans accord
      ...Array.from({ length: 3 }, () => prediction(ME, 'won')),
      prediction(ME, 'lost'),
      // U(4) : sans suite seulement → jamais classée
      prediction(U(4), 'void'),
    ] as any;
    store.match_prediction_settings = [
      {
        tenant_id: DEFAULT_TENANT_ID,
        user_id: U(2),
        show_in_leaderboard: true,
      },
    ] as any;
  }

  it('ne nomme que les personnes qui l’ont accepté', async () => {
    seed();
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    const rows = res.body.rows as any[];
    expect(rows).toHaveLength(2);
    // La 1re a accepté : son pseudo peut s'afficher (résolu par la RPC ;
    // absent du mock, il vaut null — ce qui compte est qu'on l'ait DEMANDÉ).
    expect(rows[0].isMe).toBe(false);
    // Moi : comptée, classée 2e, et mon nom n'est pas rendu aux autres.
    expect(rows[1].isMe).toBe(true);
    expect(rows[1].displayName).toBeNull();
    expect(res.body.showsMyName).toBe(false);
  });

  it('compte tout le monde : les anonymes tiennent leur rang', async () => {
    seed();
    const res = makeRes();
    await handler(makeReq(), res);
    const rows = res.body.rows as any[];
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
    expect(rows[0].correct).toBe(4);
    expect(rows[1].correct).toBe(3);
    expect(res.body.me).toMatchObject({ rank: 2, correct: 3, settled: 4 });
  });

  it('ne classe pas un pronostic sans suite', async () => {
    seed();
    const res = makeRes();
    await handler(makeReq(), res);
    // U(4) n'a que du `void` : absent du classement ET du décompte.
    expect((res.body.rows as any[]).some((r) => r.correct === 0)).toBe(false);
    expect(res.body.participants).toBe(2);
  });

  it('dit ce qui manque à qui n’est pas encore classée', async () => {
    store.match_predictions = [prediction(ME, 'won')] as any;
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.body.me).toMatchObject({
      rank: null,
      correct: 1,
      missing: MIN_SETTLED_FOR_RANK - 1,
    });
    expect(res.body.rows).toEqual([]);
  });

  it('restreint à un tournoi, et rend vide si aucun match', async () => {
    seed();
    store.matches = [
      {
        id: MATCH,
        tenant_id: DEFAULT_TENANT_ID,
        tournament_id: TOURNAMENT,
      },
    ] as any;
    const withTournament = makeRes();
    await handler(
      makeReq({ query: { tournamentId: TOURNAMENT } }),
      withTournament
    );
    expect((withTournament.body.rows as any[]).length).toBe(2);

    const other = makeRes();
    await handler(
      makeReq({
        query: { tournamentId: 'eeeeeeee-0000-4000-8000-000000000003' },
      }),
      other
    );
    expect(other.body.rows).toEqual([]);
    expect(other.body.participants).toBe(0);
  });
});

describe('PUT /api/player/predictions/leaderboard', () => {
  it('enregistre l’accord d’être nommée, et le retire', async () => {
    const res = makeRes();
    await handler(
      makeReq({ method: 'PUT', body: { showInLeaderboard: true } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.match_prediction_settings as any[])[0]).toMatchObject({
      user_id: ME,
      show_in_leaderboard: true,
    });

    const off = makeRes();
    await handler(
      makeReq({ method: 'PUT', body: { showInLeaderboard: false } }),
      off
    );
    expect(store.match_prediction_settings as any[]).toHaveLength(1);
    expect(
      (store.match_prediction_settings as any[])[0].show_in_leaderboard
    ).toBe(false);
  });

  it('refuse un choix qui n’est pas un booléen', async () => {
    const res = makeRes();
    await handler(
      makeReq({ method: 'PUT', body: { showInLeaderboard: 'oui' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(store.match_prediction_settings ?? []).toHaveLength(0);
  });
});
