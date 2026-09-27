// Les règles de la FORGE — `utils/tcg/forge.ts`, module pur.
//
// CE QUE CES CAS PROTÈGENT. La forge DÉTRUIT des cartes contre de la monnaie :
// c'est la seule action du TCG qui retire définitivement quelque chose d'une
// collection. Un refus manquant ne se voit pas dans les données — la carte a
// simplement disparu, et personne ne saura qu'elle n'aurait pas dû.
//
// Le refus central est `not_a_duplicate`, hérité du recyclage : « forger un
// doublon » ne doit jamais devenir « détruire sa collection », même par un clic
// mal placé. Il se vérifie APRÈS coup — il doit rester un exemplaire de chaque
// sujet une fois la forge passée — et pas seulement sur l'état de départ.

import { describe, expect, it } from 'vitest';
import {
  FORGE_DUPLICATES_REQUIRED,
  FORGE_FEE_COINS,
  nextRarity,
  planForge,
  type ForgeCandidate,
} from '../../utils/tcg/forge';
import {
  BOOSTER_PRICE_COINS,
  RECYCLE_REFUND_COINS,
} from '../../utils/tcg/economy';

/** Une carte possédée. `n` distingue deux exemplaires du même sujet. */
function card(
  subjectKey: string,
  rarity: ForgeCandidate['rarity'],
  n = 0,
  recycled = false
): ForgeCandidate {
  return {
    packId: `pack-${subjectKey}-${n}`,
    position: n,
    rarity,
    subjectKey,
    recycled,
  };
}
const pick = (c: ForgeCandidate) => ({
  packId: c.packId,
  position: c.position,
});

describe('nextRarity', () => {
  it('monte d’un cran', () => {
    expect(nextRarity('common')).toBe('rare');
    expect(nextRarity('rare')).toBe('epic');
    expect(nextRarity('epic')).toBe('legendary');
  });

  it('refuse au sommet, plutôt que de retomber sur le même palier', () => {
    // Sans ce null, on prendrait trois légendaires pour en rendre une.
    expect(nextRarity('legendary')).toBeNull();
  });
});

describe('planForge — le barème', () => {
  it('coûte moins qu’un booster, mais plus que ce que rapportent les doublons', () => {
    // Le rapport se défend dans les deux sens, et ce test le fige : 3 doublons
    // (90 pièces au recyclage) + 150 payées = 240, contre 300 pour cinq cartes
    // au hasard. Moins cher, moins de cartes, mais une certitude.
    const abandonne = FORGE_DUPLICATES_REQUIRED * RECYCLE_REFUND_COINS;
    expect(abandonne + FORGE_FEE_COINS).toBeLessThan(BOOSTER_PRICE_COINS);
    expect(FORGE_FEE_COINS).toBeGreaterThan(abandonne);
  });
});

describe('planForge — ce qu’elle accepte', () => {
  it('forge trois doublons de même rareté vers le palier au-dessus', () => {
    const owned = [
      card('alice', 'common', 0),
      card('alice', 'common', 1),
      card('bea', 'common', 2),
      card('bea', 'common', 3),
      card('chloe', 'common', 4),
      card('chloe', 'common', 5),
    ];
    const plan = planForge({
      selection: [owned[0], owned[2], owned[4]].map(pick),
      owned,
      balance: FORGE_FEE_COINS,
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.fromRarity).toBe('common');
    expect(plan.targetRarity).toBe('rare');
    expect(plan.consume).toHaveLength(3);
    expect(plan.feeCoins).toBe(FORGE_FEE_COINS);
  });

  it('accepte deux exemplaires du MÊME sujet s’il en reste un', () => {
    // Trois exemplaires d'Alice : en consommer deux en laisse un. La collection
    // ne perd rien, seuls les surnuméraires partent.
    const owned = [
      card('alice', 'rare', 0),
      card('alice', 'rare', 1),
      card('alice', 'rare', 2),
      card('bea', 'rare', 3),
      card('bea', 'rare', 4),
    ];
    const plan = planForge({
      selection: [owned[0], owned[1], owned[3]].map(pick),
      owned,
      balance: 10_000,
    });
    expect(plan.ok).toBe(true);
  });
});

describe('planForge — ce qu’elle refuse', () => {
  const base = [
    card('alice', 'common', 0),
    card('alice', 'common', 1),
    card('bea', 'common', 2),
    card('bea', 'common', 3),
    card('chloe', 'common', 4),
    card('chloe', 'common', 5),
  ];

  it('refuse un exemplaire UNIQUE — le refus central', () => {
    // `dana` n'existe qu'en un exemplaire : la forger effacerait une carte de
    // la collection, pas un surplus.
    const owned = [...base, card('dana', 'common', 6)];
    const plan = planForge({
      selection: [owned[0], owned[2], owned[6]].map(pick),
      owned,
      balance: 10_000,
    });
    expect(plan).toEqual({ ok: false, reason: 'not_a_duplicate' });
  });

  it('refuse de vider un sujet, même quand chaque carte est un doublon au départ', () => {
    // LE CAS QUI SE GLISSE ENTRE LES MAILLES : Alice a DEUX exemplaires, donc
    // chacun est bien un doublon dans l'état initial — mais en consommer deux
    // n'en laisse aucun. Le contrôle doit porter sur l'état d'ARRIVÉE.
    const owned = [
      card('alice', 'common', 0),
      card('alice', 'common', 1),
      card('bea', 'common', 2),
      card('bea', 'common', 3),
    ];
    const plan = planForge({
      selection: [owned[0], owned[1], owned[2]].map(pick),
      owned,
      balance: 10_000,
    });
    expect(plan).toEqual({ ok: false, reason: 'not_a_duplicate' });
  });

  it('refuse un mélange de raretés', () => {
    const owned = [...base, card('dana', 'rare', 6), card('dana', 'rare', 7)];
    const plan = planForge({
      selection: [owned[0], owned[2], owned[6]].map(pick),
      owned,
      balance: 10_000,
    });
    expect(plan).toEqual({ ok: false, reason: 'mixed_rarity' });
  });

  it('refuse au sommet de l’échelle', () => {
    const owned = [
      card('a', 'legendary', 0),
      card('a', 'legendary', 1),
      card('b', 'legendary', 2),
      card('b', 'legendary', 3),
      card('c', 'legendary', 4),
      card('c', 'legendary', 5),
    ];
    const plan = planForge({
      selection: [owned[0], owned[2], owned[4]].map(pick),
      owned,
      balance: 10_000,
    });
    expect(plan).toEqual({ ok: false, reason: 'top_rarity' });
  });

  it('refuse un solde insuffisant', () => {
    const plan = planForge({
      selection: [base[0], base[2], base[4]].map(pick),
      owned: base,
      balance: FORGE_FEE_COINS - 1,
    });
    expect(plan).toEqual({ ok: false, reason: 'insufficient_funds' });
  });

  it('refuse un compte de cartes qui n’est pas celui du barème', () => {
    expect(
      planForge({
        selection: [base[0], base[2]].map(pick),
        owned: base,
        balance: 10_000,
      })
    ).toEqual({ ok: false, reason: 'not_enough' });
  });

  it('refuse la même carte désignée trois fois', () => {
    // Sans cette garde, une seule carte suffirait à en forger une autre.
    const plan = planForge({
      selection: [base[0], base[0], base[0]].map(pick),
      owned: base,
      balance: 10_000,
    });
    expect(plan).toEqual({ ok: false, reason: 'not_enough' });
  });

  it('ignore une carte déjà recyclée', () => {
    // La ligne reste en base, la carte n'existe plus : la désigner doit
    // échouer comme si elle était introuvable.
    const owned = [
      ...base,
      card('dana', 'common', 6, true),
      card('dana', 'common', 7),
    ];
    const plan = planForge({
      selection: [owned[0], owned[2], owned[6]].map(pick),
      owned,
      balance: 10_000,
    });
    expect(plan).toEqual({ ok: false, reason: 'not_a_duplicate' });
  });
});
