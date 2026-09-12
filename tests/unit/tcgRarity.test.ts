// Rareté d'une carte TCG.
// Target: utils/tcg/rarity.ts
//
// Réducteur pur : aucun mock, aucune base. Ce qui compte ici, c'est que le
// barème reste COHÉRENT avec les badges affichés sur la fiche de la joueuse —
// une carte légendaire doit correspondre à un fait visible sur son profil, sans
// quoi le TCG raconterait un prestige que le site contredit.

import { describe, expect, it } from 'vitest';

import {
  FOIL_CHANCE,
  RARITY_ORDER,
  cardRarity,
  isFoil,
  teamCardRarity,
} from '../../utils/tcg/rarity';
import type { ProfileBadge, ProfileBadgeTier } from '@/types/rating';

function badge(key: string, tier: ProfileBadgeTier | null): ProfileBadge {
  return { key, label: key, description: key, tier };
}

describe('cardRarity', () => {
  it('rend `common` sans aucun badge — toute joueuse a une carte', () => {
    // Plancher, pas échec : une joueuse qui débute existe dans le TCG.
    expect(cardRarity([])).toBe('common');
  });

  it('traduit chaque palier de badge', () => {
    expect(cardRarity([badge('peak_master', 'platinum')])).toBe('legendary');
    expect(cardRarity([badge('peak_elite', 'gold')])).toBe('epic');
    expect(cardRarity([badge('peak_contender', 'silver')])).toBe('rare');
    expect(cardRarity([badge('regular', 'bronze')])).toBe('common');
  });

  it('classe un TITRE en légendaire, au-dessus de son palier', () => {
    // `champion` et `league_winner` sont `gold` dans le calcul des badges. Un
    // tournoi gagné est un fait unique et daté ; un rating est un état qui
    // redescend. Les traiter à égalité ferait valoir moins la victoire.
    expect(cardRarity([badge('champion', 'gold')])).toBe('legendary');
    expect(cardRarity([badge('league_winner', 'gold')])).toBe('legendary');
    // Le finaliste, lui, reste à son palier.
    expect(cardRarity([badge('finalist', 'silver')])).toBe('rare');
  });

  it('garde le MEILLEUR badge quand la joueuse en cumule', () => {
    const badges = [
      badge('regular', 'bronze'),
      badge('peak_elite', 'gold'),
      badge('veteran', 'silver'),
    ];
    expect(cardRarity(badges)).toBe('epic');
  });

  it("ne dépend pas de l'ordre des badges", () => {
    const a = [badge('peak_contender', 'silver'), badge('champion', 'gold')];
    const b = [badge('champion', 'gold'), badge('peak_contender', 'silver')];
    expect(cardRarity(a)).toBe('legendary');
    expect(cardRarity(b)).toBe('legendary');
  });

  it('tolère un badge sans palier', () => {
    // `tier: null` est permis par le type : il ne doit pas produire `undefined`.
    expect(cardRarity([badge('mystere', null)])).toBe('common');
    expect(
      cardRarity([badge('mystere', null), badge('finalist', 'silver')])
    ).toBe('rare');
  });

  it('rend toujours une valeur de RARITY_ORDER', () => {
    const all: ProfileBadge[] = [
      badge('champion', 'gold'),
      badge('peak_master', 'platinum'),
      badge('regular', 'bronze'),
    ];
    expect(RARITY_ORDER).toContain(cardRarity(all));
    expect(RARITY_ORDER).toContain(cardRarity([]));
  });
});

describe('isFoil', () => {
  it('brille en dessous du seuil, mate au-dessus', () => {
    expect(isFoil(0)).toBe(true);
    expect(isFoil(FOIL_CHANCE - 0.001)).toBe(true);
    expect(isFoil(FOIL_CHANCE)).toBe(false);
    expect(isFoil(0.99)).toBe(false);
  });

  it('refuse un tirage aberrant plutôt que de distribuer un brillant', () => {
    // Mieux vaut une carte mate qu'un foil offert par accident : le second est
    // irrattrapable une fois dans une collection.
    expect(isFoil(Number.NaN)).toBe(false);
    expect(isFoil(-0.5)).toBe(false);
    expect(isFoil(1)).toBe(false);
    expect(isFoil(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('teamCardRarity', () => {
  it('rend `common` pour une équipe sans palmarès ni rating', () => {
    expect(teamCardRarity({ bestRank: null, rating: null })).toBe('common');
  });

  it('classe le palmarès comme celui des joueuses', () => {
    // Rang 1 = titre → legendary (comme `champion`).
    expect(teamCardRarity({ bestRank: 1, rating: null })).toBe('legendary');
    // Rang 2 = finaliste (silver) → rare.
    expect(teamCardRarity({ bestRank: 2, rating: null })).toBe('rare');
    // Podium et top_cut sont `bronze` chez les joueuses → common.
    expect(teamCardRarity({ bestRank: 3, rating: null })).toBe('common');
    expect(teamCardRarity({ bestRank: 8, rating: null })).toBe('common');
  });

  it('applique au rating les MÊMES seuils que les paliers peak_* joueuses', () => {
    expect(teamCardRarity({ bestRank: null, rating: 2000 })).toBe('legendary');
    expect(teamCardRarity({ bestRank: null, rating: 1800 })).toBe('epic');
    expect(teamCardRarity({ bestRank: null, rating: 1600 })).toBe('rare');
    expect(teamCardRarity({ bestRank: null, rating: 1599 })).toBe('common');
  });

  it('garde la meilleure des deux dimensions', () => {
    // Une équipe modeste au classement mais championne reste légendaire…
    expect(teamCardRarity({ bestRank: 1, rating: 1200 })).toBe('legendary');
    // …et une équipe jamais titrée mais très bien classée monte quand même.
    expect(teamCardRarity({ bestRank: 12, rating: 1850 })).toBe('epic');
  });

  it('ignore une donnée aberrante au lieu de la prendre pour une victoire', () => {
    // Un rang 0 ou négatif ne doit surtout pas valoir « première ».
    expect(teamCardRarity({ bestRank: 0, rating: null })).toBe('common');
    expect(teamCardRarity({ bestRank: -1, rating: null })).toBe('common');
    expect(teamCardRarity({ bestRank: Number.NaN, rating: null })).toBe(
      'common'
    );
    expect(teamCardRarity({ bestRank: null, rating: Number.NaN })).toBe(
      'common'
    );
  });

  it('rend toujours une valeur de RARITY_ORDER', () => {
    expect(RARITY_ORDER).toContain(
      teamCardRarity({ bestRank: 1, rating: 2100 })
    );
    expect(RARITY_ORDER).toContain(
      teamCardRarity({ bestRank: null, rating: null })
    );
  });
});
