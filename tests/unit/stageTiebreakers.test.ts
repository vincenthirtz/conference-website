import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TIEBREAKER_ORDER,
  parseTiebreakerOrder,
  rankWithTiebreakers,
  type TiebreakerMatch,
  type TiebreakerTeam,
} from '../../utils/stages/tiebreakers';

function team(
  teamId: string,
  points: number,
  over: Partial<TiebreakerTeam> = {}
): TiebreakerTeam {
  return { teamId, points, wins: 0, scoreDiff: 0, scored: 0, seed: null, ...over };
}

function win(winner: string, loser: string, s1 = 2, s2 = 0): TiebreakerMatch {
  return {
    team1Id: winner,
    team2Id: loser,
    team1Score: s1,
    team2Score: s2,
    winnerTeamId: winner,
  };
}

describe('parseTiebreakerOrder', () => {
  it('accepte une liste valide et la dédoublonne', () => {
    expect(parseTiebreakerOrder(['wins', 'wins', 'score_diff'])).toEqual([
      'wins',
      'score_diff',
      'seed',
    ]);
  });

  it('ferme toujours par seed — sinon l’ordre dépendrait de la base', () => {
    expect(parseTiebreakerOrder(['head_to_head'])).toEqual([
      'head_to_head',
      'seed',
    ]);
  });

  it('ne réordonne pas ce que l’admin a choisi', () => {
    expect(parseTiebreakerOrder(['score_diff', 'head_to_head'])).toEqual([
      'score_diff',
      'head_to_head',
      'seed',
    ]);
  });

  it('rend null sur une entrée inexploitable', () => {
    expect(parseTiebreakerOrder(null)).toBeNull();
    expect(parseTiebreakerOrder('head_to_head')).toBeNull();
    expect(parseTiebreakerOrder([])).toBeNull();
    expect(parseTiebreakerOrder(['inconnu', 42])).toBeNull();
  });
});

describe('rankWithTiebreakers · les points d’abord', () => {
  it('ne renverse jamais un écart de points', () => {
    // B a une meilleure différence, mais un point de moins : elle reste derrière.
    const r = rankWithTiebreakers(
      [team('A', 6, { scoreDiff: -5 }), team('B', 3, { scoreDiff: +10 })],
      []
    );
    expect(r.map((x) => x.teamId)).toEqual(['A', 'B']);
  });

  it('ne marque aucun départage quand personne n’est à égalité', () => {
    const r = rankWithTiebreakers([team('A', 6), team('B', 3)], []);
    expect(r.every((x) => x.tiebrokenBy === null)).toBe(true);
  });
});

describe('rankWithTiebreakers · confrontation directe', () => {
  it('fait passer devant celle qui a battu l’autre', () => {
    // Même total, même différence : seul le face-à-face les sépare.
    const r = rankWithTiebreakers(
      [team('A', 3, { wins: 1, scoreDiff: 0 }), team('B', 3, { wins: 1, scoreDiff: 0 })],
      [win('B', 'A')]
    );
    expect(r.map((x) => x.teamId)).toEqual(['B', 'A']);
    expect(r[0].tiebrokenBy).toBe('head_to_head');
  });

  it('ne compte QUE les matchs entre les équipes à égalité', () => {
    // A a battu C (hors du groupe à égalité) ; B a battu A. Le face-à-face
    // interne donne B devant, la victoire de A sur C ne pèse pas ici.
    const r = rankWithTiebreakers(
      [team('A', 3, { scoreDiff: 0 }), team('B', 3, { scoreDiff: 0 }), team('C', 9)],
      [win('A', 'C'), win('B', 'A')]
    );
    expect(r.map((x) => x.teamId)).toEqual(['C', 'B', 'A']);
  });

  it('laisse la main au critère suivant sur un cycle à trois', () => {
    // A bat B, B bat C, C bat A : chacune 3 points de face-à-face. Le critère
    // ne tranche rien — c'est le comportement attendu, pas un défaut.
    const r = rankWithTiebreakers(
      [
        team('A', 3, { scoreDiff: 1 }),
        team('B', 3, { scoreDiff: 3 }),
        team('C', 3, { scoreDiff: 2 }),
      ],
      [win('A', 'B'), win('B', 'C'), win('C', 'A')]
    );
    expect(r.map((x) => x.teamId)).toEqual(['B', 'C', 'A']);
    expect(r.map((x) => x.tiebrokenBy)).toEqual([
      'score_diff',
      'score_diff',
      'score_diff',
    ]);
  });

  it('compte le nul 1 point de chaque côté', () => {
    const nul: TiebreakerMatch = {
      team1Id: 'A',
      team2Id: 'B',
      team1Score: 1,
      team2Score: 1,
      winnerTeamId: null,
    };
    const r = rankWithTiebreakers(
      [team('A', 3, { scoreDiff: 0 }), team('B', 3, { scoreDiff: 0 })],
      [nul]
    );
    // Face-à-face nul → départage par le critère suivant, puis le seed.
    expect(r[0].tiebrokenBy).not.toBe('head_to_head');
  });
});

describe('rankWithTiebreakers · cascade', () => {
  it('retient le PREMIER critère qui sépare, pas le dernier', () => {
    const r = rankWithTiebreakers(
      [
        team('A', 3, { scoreDiff: 5, wins: 1 }),
        team('B', 3, { scoreDiff: 1, wins: 9 }),
      ],
      []
    );
    expect(r.map((x) => x.teamId)).toEqual(['A', 'B']);
    expect(r[0].tiebrokenBy).toBe('score_diff');
  });

  it('descend jusqu’au seed quand rien d’autre ne sépare', () => {
    const r = rankWithTiebreakers(
      [team('A', 3, { seed: 4 }), team('B', 3, { seed: 2 })],
      []
    );
    expect(r.map((x) => x.teamId)).toEqual(['B', 'A']);
    expect(r[0].tiebrokenBy).toBe('seed');
  });

  it('place un seed absent derrière un seed connu', () => {
    const r = rankWithTiebreakers(
      [team('A', 3, { seed: null }), team('B', 3, { seed: 8 })],
      []
    );
    expect(r.map((x) => x.teamId)).toEqual(['B', 'A']);
  });

  it('suit l’ordre configuré plutôt que le défaut', () => {
    // score_diff avant head_to_head : A passe devant malgré la défaite directe.
    const r = rankWithTiebreakers(
      [team('A', 3, { scoreDiff: 5 }), team('B', 3, { scoreDiff: 1 })],
      [win('B', 'A')],
      ['score_diff', 'head_to_head', 'seed']
    );
    expect(r.map((x) => x.teamId)).toEqual(['A', 'B']);
    expect(r[0].tiebrokenBy).toBe('score_diff');
  });

  it('numérote les rangs sans trou', () => {
    const r = rankWithTiebreakers(
      [team('A', 9), team('B', 6), team('C', 3), team('D', 0)],
      []
    );
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
  });

  it('ne mute pas l’entrée', () => {
    const input = [team('A', 3, { seed: 2 }), team('B', 3, { seed: 1 })];
    const copy = JSON.parse(JSON.stringify(input));
    rankWithTiebreakers(input, []);
    expect(input).toEqual(copy);
  });
});

describe('rankWithTiebreakers · Cup 2025 (données réelles)', () => {
  // Le seul classement de poule terminé en base. Vérifie que l'ajout de la
  // confrontation directe NE RÉÉCRIT PAS l'histoire : les trois équipes à
  // 3 points forment un cycle parfait, donc le face-à-face ne tranche rien et
  // la différence de score garde l'ordre d'avant.
  const HIN = 'hinode';
  const AVO = 'avoidgers';
  const VEN = 'venom';
  const ONN = 'onna';

  const teams = [
    team(HIN, 9, { wins: 3, scoreDiff: 6, scored: 6 }),
    team(AVO, 3, { wins: 1, scoreDiff: -2, scored: 3 }),
    team(VEN, 3, { wins: 1, scoreDiff: -3, scored: 2 }),
    team(ONN, 3, { wins: 1, scoreDiff: -1, scored: 3 }),
  ];
  const matches: TiebreakerMatch[] = [
    win(AVO, ONN, 2, 1),
    win(VEN, AVO, 2, 1),
    win(ONN, VEN, 2, 0),
    win(HIN, VEN, 2, 0),
    win(HIN, AVO, 2, 0),
    win(HIN, ONN, 2, 0),
  ];

  it('garde le classement historique', () => {
    const r = rankWithTiebreakers(teams, matches, DEFAULT_TIEBREAKER_ORDER);
    expect(r.map((x) => x.teamId)).toEqual([HIN, ONN, AVO, VEN]);
  });

  it('attribue le départage à la différence de score, pas au face-à-face', () => {
    const r = rankWithTiebreakers(teams, matches, DEFAULT_TIEBREAKER_ORDER);
    expect(r[0].tiebrokenBy).toBeNull(); // seule à 9 points
    expect(r.slice(1).map((x) => x.tiebrokenBy)).toEqual([
      'score_diff',
      'score_diff',
      'score_diff',
    ]);
  });
});
