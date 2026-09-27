// Les cosmétiques de vitrine — `utils/tcg/cosmetics.ts`, module pur.
//
// CE QUI EST PROTÉGÉ ICI. Un cosmétique est un DÉBIT : la règle décide quand on
// prélève des pièces gagnées. Les deux erreurs coûteuses sont symétriques et
// toutes deux silencieuses — faire payer deux fois le même objet, et laisser
// poser un habillage qu'on n'a pas acheté. La première se voit dans un solde
// qu'on ne sait plus expliquer, la seconde nulle part.
//
// La distinction ACHETÉ / POSÉ est le cœur : changer d'habillage ne doit rien
// coûter, sinon chaque essai se paie et personne n'essaie.

import { describe, expect, it } from 'vitest';
import {
  COSMETICS,
  canEquip,
  findCosmetic,
  planCosmeticPurchase,
} from '../../utils/tcg/cosmetics';
import { BOOSTER_PRICE_COINS } from '../../utils/tcg/economy';

const FRAME = COSMETICS.find((c) => c.kind === 'frame')!;
const BACKGROUND = COSMETICS.find((c) => c.kind === 'background')!;

describe('le catalogue', () => {
  it('a des clés uniques', () => {
    const keys = COSMETICS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('propose les deux natures', () => {
    expect(COSMETICS.some((c) => c.kind === 'frame')).toBe(true);
    expect(COSMETICS.some((c) => c.kind === 'background')).toBe(true);
  });

  it('a une pente : tous les prix ne sont pas les mêmes', () => {
    // Un catalogue plat ne se parcourt pas.
    expect(new Set(COSMETICS.map((c) => c.priceCoins)).size).toBeGreaterThan(1);
  });

  it('garde l’entrée de gamme SOUS le prix d’un paquet', () => {
    // Un habillage qui coûterait plus cher que des cartes ne se vend pas, et
    // un débit que personne ne déclenche ne dépense rien.
    const cheapest = Math.min(...COSMETICS.map((c) => c.priceCoins));
    expect(cheapest).toBeLessThan(BOOSTER_PRICE_COINS);
  });

  it('ne connaît pas une clé inventée', () => {
    expect(findCosmetic('frame_nimportequoi')).toBeNull();
    expect(findCosmetic(42)).toBeNull();
    expect(findCosmetic(null)).toBeNull();
  });
});

describe('planCosmeticPurchase', () => {
  it('accepte un achat couvert', () => {
    const plan = planCosmeticPurchase({
      key: FRAME.key,
      owned: [],
      balance: FRAME.priceCoins,
    });
    expect(plan).toEqual({ ok: true, cosmetic: FRAME });
  });

  it('REFUSE un second achat du même objet', () => {
    // Un achat silencieux plutôt qu'un refus prélèverait deux fois : la façon
    // la plus sûre de perdre la confiance dans une monnaie.
    const plan = planCosmeticPurchase({
      key: FRAME.key,
      owned: [FRAME.key],
      balance: 100_000,
    });
    expect(plan).toEqual({ ok: false, reason: 'already_owned' });
  });

  it('refuse un solde d’une pièce trop court', () => {
    const plan = planCosmeticPurchase({
      key: FRAME.key,
      owned: [],
      balance: FRAME.priceCoins - 1,
    });
    expect(plan).toEqual({ ok: false, reason: 'insufficient_funds' });
  });

  it('refuse une clé hors catalogue', () => {
    const plan = planCosmeticPurchase({
      key: 'frame_or_massif',
      owned: [],
      balance: 100_000,
    });
    expect(plan).toEqual({ ok: false, reason: 'unknown_cosmetic' });
  });
});

describe('canEquip', () => {
  it('pose ce qu’on a acheté', () => {
    expect(
      canEquip({ key: FRAME.key, kind: 'frame', owned: [FRAME.key] })
    ).toBe(true);
  });

  it('refuse de poser ce qu’on n’a pas acheté', () => {
    expect(canEquip({ key: FRAME.key, kind: 'frame', owned: [] })).toBe(false);
  });

  it('refuse un fond dans l’emplacement d’un cadre', () => {
    // Sans ce contrôle, l'emplacement rendrait n'importe quoi — et la vitrine
    // publique afficherait un habillage que personne ne sait dessiner.
    expect(
      canEquip({
        key: BACKGROUND.key,
        kind: 'frame',
        owned: [BACKGROUND.key],
      })
    ).toBe(false);
  });

  it('accepte TOUJOURS le retrait', () => {
    // Un retrait ne dépend de rien : s'il échouait, il laisserait en place
    // exactement ce qu'on demande d'enlever.
    expect(canEquip({ key: null, kind: 'frame', owned: [] })).toBe(true);
    expect(canEquip({ key: null, kind: 'background', owned: [] })).toBe(true);
  });
});
