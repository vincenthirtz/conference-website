// Barème de la monnaie du TCG.
// Target: utils/tcg/economy.ts
//
// CE QUE CES TESTS PROTÈGENT. Le rapport scrim/match n'est pas une valeur
// choisie ici : il est DÉRIVÉ de `SCRIM_RATING_WEIGHT`, la pondération que le
// dépôt applique déjà au rating. Le test le vérifie explicitement, pour qu'un
// futur ajustement de la pondération entraîne le barème avec lui au lieu de le
// laisser dériver en silence.

import { describe, expect, it } from 'vitest';

import { SCRIM_RATING_WEIGHT } from '../../utils/rating/computePlayerRatings';
import {
  BOOSTER_PRICE_COINS,
  MATCH_WIN_COINS,
  SCRIM_WIN_COINS,
  canAfford,
  coinsForWin,
} from '../../utils/tcg/economy';

describe('barème', () => {
  it('dérive le gain de scrim de la pondération du rating', () => {
    // Si quelqu'un change SCRIM_RATING_WEIGHT, ce test suit — c'est le but.
    expect(SCRIM_WIN_COINS).toBe(
      Math.round(MATCH_WIN_COINS * SCRIM_RATING_WEIGHT)
    );
  });

  it('rend des montants entiers', () => {
    // Un solde fractionnaire n'a pas de sens : les pièces se comptent.
    expect(Number.isInteger(MATCH_WIN_COINS)).toBe(true);
    expect(Number.isInteger(SCRIM_WIN_COINS)).toBe(true);
    expect(Number.isInteger(BOOSTER_PRICE_COINS)).toBe(true);
  });

  it('fait valoir un scrim moins qu’un match officiel', () => {
    expect(SCRIM_WIN_COINS).toBeLessThan(MATCH_WIN_COINS);
    expect(SCRIM_WIN_COINS).toBeGreaterThan(0);
  });

  it('fixe le booster à plusieurs victoires, pas à une', () => {
    // Sinon la monnaie doublerait mécaniquement les paquets et la voie
    // « offerte à la victoire » perdrait son sens.
    expect(BOOSTER_PRICE_COINS).toBeGreaterThan(MATCH_WIN_COINS);
  });
});

describe('coinsForWin', () => {
  it('distingue les deux natures de rencontre', () => {
    expect(coinsForWin(false)).toBe(MATCH_WIN_COINS);
    expect(coinsForWin(true)).toBe(SCRIM_WIN_COINS);
  });
});

describe('canAfford', () => {
  it('autorise à partir du prix exact', () => {
    expect(canAfford(BOOSTER_PRICE_COINS, BOOSTER_PRICE_COINS)).toBe(true);
    expect(canAfford(BOOSTER_PRICE_COINS + 1, BOOSTER_PRICE_COINS)).toBe(true);
  });

  it('refuse en dessous', () => {
    expect(canAfford(BOOSTER_PRICE_COINS - 1, BOOSTER_PRICE_COINS)).toBe(false);
    expect(canAfford(0, BOOSTER_PRICE_COINS)).toBe(false);
  });

  it('refuse une donnée aberrante plutôt que de livrer un booster', () => {
    // Un booster ouvert ne se reprend pas : dans le doute, on ne vend pas.
    expect(canAfford(Number.NaN, 300)).toBe(false);
    expect(canAfford(300, Number.NaN)).toBe(false);
    expect(canAfford(-1, 300)).toBe(false);
    expect(canAfford(300, 0)).toBe(false);
    expect(canAfford(300, -50)).toBe(false);
    expect(canAfford(Number.POSITIVE_INFINITY, 300)).toBe(false);
  });
});
