// Unit tests — score de compatibilité d'adversaire (N4).
//
// Ce qui est réellement testé ici n'est pas « le score vaut 63 » : c'est
// l'ensemble des ARBITRAGES qui rendent un classement juste ou injuste —
//   - une équipe sans rating ne doit pas être punie de n'avoir jamais joué ;
//   - « 0 créneau commun » ne doit compter que si les deux camps ont déclaré ;
//   - le score doit rester explicable, donc porter ses raisons.

import { describe, it, expect } from 'vitest';

import {
  computeOpponentMatch,
  LEVEL_SPAN,
  type OpponentMatchInput,
} from '../../utils/teams/opponentMatch';

/** Cas neutre : rien de connu, aucun affrontement. */
function input(
  overrides: Partial<OpponentMatchInput> = {}
): OpponentMatchInput {
  return {
    commonSearchSlots: 0,
    commonRhythmSlots: 0,
    slotsComparable: false,
    myRating: null,
    theirRating: null,
    responseRate: null,
    encountersRecent: 0,
    ...overrides,
  };
}

describe('facteurs inconnus', () => {
  it('expose l’ignorance comme telle plutôt qu’en la déguisant en zéro', () => {
    const result = computeOpponentMatch(input());
    expect(result.factors.level).toBeNull();
    expect(result.factors.reliability).toBeNull();
    expect(result.factors.slots).toBeNull();
  });

  it('place une équipe totalement inconnue au milieu, pas en tête', () => {
    // Le piège que ce test verrouille : retirer les facteurs inconnus et
    // renormaliser les poids ferait remonter l'équipe dont on ne sait RIEN
    // devant celle avec qui on a un créneau commun confirmé — son score se
    // réduirait à la seule nouveauté, maximale par construction.
    const unknown = computeOpponentMatch(input());
    const playable = computeOpponentMatch(
      input({ commonSearchSlots: 1, slotsComparable: true })
    );
    expect(unknown.score).toBeLessThan(playable.score);
    expect(unknown.score).toBeGreaterThan(30);
    expect(unknown.score).toBeLessThan(70);
  });

  it('ne compte « aucun créneau commun » que si les deux camps ont déclaré', () => {
    const unknown = computeOpponentMatch(input({ slotsComparable: false }));
    const known = computeOpponentMatch(input({ slotsComparable: true }));
    expect(unknown.factors.slots).toBeNull();
    expect(known.factors.slots).toBe(0);
    expect(known.score).toBeLessThan(unknown.score);
    expect(known.reasons).toContain('no_common_slots');
  });
});

describe('disponibilité', () => {
  it('place un seul créneau commun au-dessus de l’a priori neutre', () => {
    // Sinon « je peux jouer contre elles » vaudrait moins que « je ne sais
    // rien d'elles », et le classement conseillerait l'inconnu.
    const one = computeOpponentMatch(
      input({ commonSearchSlots: 1, slotsComparable: true })
    );
    expect(one.factors.slots).toBeGreaterThan(0.5);
  });

  it('sature à trois créneaux datés communs', () => {
    const three = computeOpponentMatch(
      input({ commonSearchSlots: 3, slotsComparable: true })
    );
    const five = computeOpponentMatch(
      input({ commonSearchSlots: 5, slotsComparable: true })
    );
    expect(three.factors.slots).toBe(1);
    expect(five.factors.slots).toBe(1);
  });

  it('compte un créneau récurrent moins qu’un créneau daté', () => {
    const dated = computeOpponentMatch(
      input({ commonSearchSlots: 2, slotsComparable: true })
    );
    const recurring = computeOpponentMatch(
      input({ commonRhythmSlots: 2, slotsComparable: true })
    );
    expect(recurring.factors.slots).toBeLessThan(dated.factors.slots!);
    expect(recurring.factors.slots).toBeGreaterThan(0);
  });

  it('cite l’annonce datée plutôt que l’habitude quand les deux existent', () => {
    const result = computeOpponentMatch(
      input({
        commonSearchSlots: 1,
        commonRhythmSlots: 2,
        slotsComparable: true,
      })
    );
    expect(result.reasons[0]).toBe('common_slots');
  });

  it('cite l’habitude en repli — le cas normal d’un réseau peu dense', () => {
    const result = computeOpponentMatch(
      input({ commonRhythmSlots: 2, slotsComparable: true })
    );
    expect(result.reasons[0]).toBe('common_rhythm');
  });
});

describe('niveau', () => {
  it('vaut 1 à rating identique', () => {
    const result = computeOpponentMatch(
      input({ myRating: 1500, theirRating: 1500 })
    );
    expect(result.factors.level).toBe(1);
    expect(result.reasons).toContain('similar_level');
  });

  it('tombe à 0 au-delà de l’écart maximal, sans jamais devenir négatif', () => {
    const result = computeOpponentMatch(
      input({ myRating: 1000, theirRating: 1000 + LEVEL_SPAN * 3 })
    );
    expect(result.factors.level).toBe(0);
    expect(result.reasons).toContain('level_gap');
  });

  it('est symétrique', () => {
    const a = computeOpponentMatch(
      input({ myRating: 1200, theirRating: 1500 })
    );
    const b = computeOpponentMatch(
      input({ myRating: 1500, theirRating: 1200 })
    );
    expect(a.score).toBe(b.score);
  });
});

describe('fiabilité et nouveauté', () => {
  it('reprend le taux de réponse tel quel, borné à [0,1]', () => {
    expect(
      computeOpponentMatch(input({ responseRate: 90 })).factors.reliability
    ).toBe(0.9);
    expect(
      computeOpponentMatch(input({ responseRate: 140 })).factors.reliability
    ).toBe(1);
  });

  it('signale une équipe qui répond rarement', () => {
    const result = computeOpponentMatch(input({ responseRate: 30 }));
    expect(result.reasons).toContain('slow_to_answer');
  });

  it('décroît avec les affrontements récents sans jamais annuler l’équipe', () => {
    const never = computeOpponentMatch(input({ encountersRecent: 0 }));
    const once = computeOpponentMatch(input({ encountersRecent: 1 }));
    const many = computeOpponentMatch(input({ encountersRecent: 9 }));
    expect(never.factors.novelty).toBe(1);
    expect(once.factors.novelty).toBeLessThan(never.factors.novelty!);
    expect(many.factors.novelty).toBeGreaterThan(0);
    expect(never.reasons).toContain('never_played');
    expect(many.reasons).toContain('played_recently');
  });
});

describe('score et raisons', () => {
  it('classe l’adversaire idéal devant l’adversaire injouable', () => {
    const ideal = computeOpponentMatch(
      input({
        commonSearchSlots: 3,
        slotsComparable: true,
        myRating: 1500,
        theirRating: 1520,
        responseRate: 95,
        encountersRecent: 0,
      })
    );
    const poor = computeOpponentMatch(
      input({
        slotsComparable: true,
        myRating: 1500,
        theirRating: 2400,
        responseRate: 10,
        encountersRecent: 5,
      })
    );
    expect(ideal.score).toBeGreaterThan(poor.score);
    expect(ideal.score).toBeGreaterThan(90);
    expect(poor.score).toBeLessThan(20);
  });

  it('reste borné à 0-100 et entier', () => {
    const result = computeOpponentMatch(
      input({
        commonSearchSlots: 1,
        slotsComparable: true,
        myRating: 1400,
        theirRating: 1650,
        responseRate: 62,
        encountersRecent: 2,
      })
    );
    expect(Number.isInteger(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('ne donne jamais plus de trois raisons', () => {
    const result = computeOpponentMatch(
      input({
        commonSearchSlots: 2,
        slotsComparable: true,
        myRating: 1500,
        theirRating: 1500,
        responseRate: 95,
        encountersRecent: 0,
      })
    );
    expect(result.reasons.length).toBeLessThanOrEqual(3);
  });
});
