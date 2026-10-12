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
  COIN_UNIT,
  FORGE_FEE_COINS,
  MATCH_LOSS_COINS,
  MATCH_WIN_COINS,
  RECYCLE_REFUND_COINS,
  SCRIM_WIN_COINS,
  canAfford,
  coinsForWin,
} from '../../utils/tcg/economy';

describe('barème', () => {
  it('dérive le gain de scrim de la pondération du rating', () => {
    // Si quelqu'un change SCRIM_RATING_WEIGHT, ce test suit — c'est le but.
    // Appliqué à l'UNITÉ du barème, pas à la victoire de tournoi : relever la
    // victoire (2026-10-12) ne devait pas relever les scrims.
    expect(SCRIM_WIN_COINS).toBe(Math.round(COIN_UNIT * SCRIM_RATING_WEIGHT));
  });

  it('fait valoir la victoire de tournoi deux unités (décision du 2026-10-12)', () => {
    expect(MATCH_WIN_COINS).toBe(2 * COIN_UNIT);
    expect(MATCH_WIN_COINS).toBe(200);
  });

  it('fait rapporter une victoire plus qu’une défaite', () => {
    expect(MATCH_WIN_COINS).toBeGreaterThan(MATCH_LOSS_COINS);
  });

  it('paie un booster en trois défaites', () => {
    expect(3 * MATCH_LOSS_COINS).toBe(BOOSTER_PRICE_COINS);
  });

  it('garde au centime près le reste du barème après le relèvement', () => {
    // Seule la victoire a bougé le 2026-10-12. Ces montants sont écrits en
    // clair EXPRÈS : ils figent la décision « le reste ne bouge pas ».
    expect(COIN_UNIT).toBe(100);
    expect(MATCH_LOSS_COINS).toBe(100);
    expect(BOOSTER_PRICE_COINS).toBe(300);
    expect(SCRIM_WIN_COINS).toBe(50);
    expect(RECYCLE_REFUND_COINS).toBe(30);
    expect(FORGE_FEE_COINS).toBe(150);
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

  it('fixe le booster au-dessus d’une victoire, pas à une', () => {
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
