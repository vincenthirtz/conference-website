// tests/unit/overwatchRank.test.ts
//
// Le SR déclaré : paliers, notation « 3k5 », moyenne d'équipe.

import { describe, it, expect } from 'vitest';
import {
  OVERWATCH_TIERS,
  averageTeamSkillRating,
  formatSkillRating,
  isValidSkillRating,
  overwatchTierFromSkillRating,
} from '../../utils/overwatchRank';

describe('isValidSkillRating', () => {
  it('accepte les entiers dans les bornes, bornes comprises', () => {
    expect(isValidSkillRating(0)).toBe(true);
    expect(isValidSkillRating(3500)).toBe(true);
    expect(isValidSkillRating(5000)).toBe(true);
  });

  it('refuse hors bornes, non entier et non nombre', () => {
    expect(isValidSkillRating(-1)).toBe(false);
    expect(isValidSkillRating(5001)).toBe(false);
    expect(isValidSkillRating(3500.5)).toBe(false);
    expect(isValidSkillRating(NaN)).toBe(false);
    expect(isValidSkillRating('3500')).toBe(false);
    expect(isValidSkillRating(null)).toBe(false);
    expect(isValidSkillRating(undefined)).toBe(false);
  });
});

describe('overwatchTierFromSkillRating', () => {
  it('place chaque palier sur ses bornes', () => {
    expect(overwatchTierFromSkillRating(0)).toBe('bronze');
    expect(overwatchTierFromSkillRating(999)).toBe('bronze');
    expect(overwatchTierFromSkillRating(1000)).toBe('silver');
    expect(overwatchTierFromSkillRating(1499)).toBe('silver');
    expect(overwatchTierFromSkillRating(1500)).toBe('gold');
    expect(overwatchTierFromSkillRating(1999)).toBe('gold');
    expect(overwatchTierFromSkillRating(2000)).toBe('platinum');
    expect(overwatchTierFromSkillRating(2499)).toBe('platinum');
    expect(overwatchTierFromSkillRating(3499)).toBe('diamond');
    expect(overwatchTierFromSkillRating(3500)).toBe('master');
    expect(overwatchTierFromSkillRating(4000)).toBe('grandmaster');
    expect(overwatchTierFromSkillRating(5000)).toBe('grandmaster');
  });

  // Le palier ajoute par Overwatch 2, entre Platine et Diamant : c'est lui qui
  // decale tout le bas de l'echelle, donc celui qu'une « correction » vers les
  // bornes d'Overwatch 1 casserait en premier.
  it('intercale l’Émeraude entre Platine et Diamant', () => {
    expect(overwatchTierFromSkillRating(2499)).toBe('platinum');
    expect(overwatchTierFromSkillRating(2500)).toBe('emerald');
    expect(overwatchTierFromSkillRating(2999)).toBe('emerald');
    expect(overwatchTierFromSkillRating(3000)).toBe('diamond');
  });

  it('ne couvre aucun trou : chaque SR de 0 à 5000 tombe dans un palier', () => {
    for (let sr = 0; sr <= 5000; sr += 1) {
      expect(overwatchTierFromSkillRating(sr)).not.toBeNull();
    }
    // Et les paliers s'enchaînent sans chevauchement.
    for (let i = 1; i < OVERWATCH_TIERS.length; i += 1) {
      expect(OVERWATCH_TIERS[i].min).toBe(OVERWATCH_TIERS[i - 1].max + 1);
    }
  });

  it('rend null sur une valeur absente ou aberrante', () => {
    expect(overwatchTierFromSkillRating(null)).toBeNull();
    expect(overwatchTierFromSkillRating(undefined)).toBeNull();
    expect(overwatchTierFromSkillRating(-10)).toBeNull();
    expect(overwatchTierFromSkillRating(9999)).toBeNull();
  });
});

describe('formatSkillRating', () => {
  it('rend la notation parlée', () => {
    expect(formatSkillRating(3500)).toBe('3k5');
    expect(formatSkillRating(3000)).toBe('3k');
    expect(formatSkillRating(4750)).toBe('4k7');
    expect(formatSkillRating(5000)).toBe('5k');
  });

  it('tronque au lieu d’arrondir : 3450 reste 3k4', () => {
    // Arrondir afficherait « 3k5 », donc Maître, à un compte Diamant.
    expect(formatSkillRating(3450)).toBe('3k4');
    expect(formatSkillRating(3499)).toBe('3k4');
  });

  it('rend le nombre brut sous 1000', () => {
    expect(formatSkillRating(850)).toBe('850');
    expect(formatSkillRating(0)).toBe('0');
  });
});

describe('averageTeamSkillRating', () => {
  it('moyenne les fiches jouantes renseignées et en déduit le palier', () => {
    const res = averageTeamSkillRating([
      { role: 'player', skill_rating: 3400 },
      { role: 'player', skill_rating: 3600 },
      { role: 'substitute', skill_rating: 3500 },
    ]);
    expect(res).toEqual({
      average: 3500,
      count: 3,
      eligible: 3,
      tier: 'master',
    });
  });

  it('exclut coachs et managers du calcul comme du dénominateur', () => {
    const res = averageTeamSkillRating([
      { role: 'player', skill_rating: 2000 },
      { role: 'coach', skill_rating: 5000 },
      { role: 'manager', skill_rating: 5000 },
    ]);
    expect(res?.average).toBe(2000);
    expect(res?.eligible).toBe(1);
  });

  it('signale sur combien de fiches la moyenne porte', () => {
    const res = averageTeamSkillRating([
      { role: 'player', skill_rating: 3000 },
      { role: 'player', skill_rating: null },
      { role: 'player' },
      { role: 'substitute', skill_rating: 2000 },
    ]);
    expect(res?.count).toBe(2);
    expect(res?.eligible).toBe(4);
    expect(res?.average).toBe(2500);
  });

  it('arrondit à l’entier', () => {
    const res = averageTeamSkillRating([
      { role: 'player', skill_rating: 3000 },
      { role: 'player', skill_rating: 3001 },
    ]);
    expect(res?.average).toBe(3001);
  });

  it('rend null quand rien n’est renseigné', () => {
    expect(averageTeamSkillRating([])).toBeNull();
    expect(averageTeamSkillRating(null)).toBeNull();
    expect(
      averageTeamSkillRating([{ role: 'player', skill_rating: null }])
    ).toBeNull();
    // Une équipe qui n'a que de l'encadrement n'a pas de moyenne.
    expect(
      averageTeamSkillRating([{ role: 'coach', skill_rating: 4000 }])
    ).toBeNull();
  });

  it('ignore une valeur hors bornes plutôt que de la moyenner', () => {
    const res = averageTeamSkillRating([
      { role: 'player', skill_rating: 3000 },
      { role: 'player', skill_rating: 99999 },
    ]);
    expect(res?.average).toBe(3000);
    expect(res?.count).toBe(1);
  });
});
