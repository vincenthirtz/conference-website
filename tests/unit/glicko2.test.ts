import { describe, it, expect } from 'vitest';
import {
  updateGlicko,
  DEFAULT_RATING,
  DEFAULT_RD,
  DEFAULT_VOLATILITY,
  type Glicko,
} from '../../utils/rating/glicko2';

describe('updateGlicko — canonical Glickman vector', () => {
  it('matches the worked example from « Example of the Glicko-2 system »', () => {
    const player: Glicko = { rating: 1500, rd: 200, volatility: 0.06 };
    const result = updateGlicko(
      player,
      [
        { opponentRating: 1400, opponentRd: 30, score: 1 },
        { opponentRating: 1550, opponentRd: 100, score: 0 },
        { opponentRating: 1700, opponentRd: 300, score: 0 },
      ],
      0.5
    );

    // Valeurs attendues de l'article de Glickman. Le papier arrondit ses
    // etapes intermediaires ; notre calcul non-arrondi donne 1464.0507 /
    // 151.517, ce qui coincide avec l'article a 1 decimale pres (l'ecart ~0.01
    // sur le rating vient de l'arrondi du papier, pas d'une erreur d'algo).
    // La volatilite calculee = 0.0599960, qui arrondit bien a 0.05999 comme
    // dans l'article (toBeCloseTo(_,4) verifie cette egalite ; le 5e chiffre
    // depend d'arrondis intermediaires du papier).
    expect(result.rating).toBeCloseTo(1464.06, 1);
    expect(result.rd).toBeCloseTo(151.52, 1);
    expect(result.volatility).toBeCloseTo(0.05999, 4);
  });
});

describe('updateGlicko — empty period', () => {
  it('keeps rating and volatility, grows RD via phi* = sqrt(phi^2 + sigma^2)', () => {
    const player: Glicko = { rating: 1500, rd: 200, volatility: 0.06 };
    const result = updateGlicko(player, [], 0.5);

    expect(result.rating).toBe(1500);
    expect(result.volatility).toBe(0.06);
    // RD augmente strictement.
    expect(result.rd).toBeGreaterThan(200);

    // Verification numerique de phi* reconverti.
    const GLICKO2_SCALE = 173.7178;
    const phi = 200 / GLICKO2_SCALE;
    const phiStar = Math.sqrt(phi * phi + 0.06 * 0.06);
    expect(result.rd).toBeCloseTo(phiStar * GLICKO2_SCALE, 4);
  });

  it('caps RD at 350 for a very uncertain player on an empty period', () => {
    const player: Glicko = { rating: 1500, rd: 350, volatility: 0.06 };
    const result = updateGlicko(player, [], 0.5);
    expect(result.rd).toBe(DEFAULT_RD);
    expect(result.rating).toBe(1500);
  });
});

describe('updateGlicko — fresh player', () => {
  it('handles a brand-new player {1500,350,0.06} vs a single opponent', () => {
    const player: Glicko = {
      rating: DEFAULT_RATING,
      rd: DEFAULT_RD,
      volatility: DEFAULT_VOLATILITY,
    };
    const win = updateGlicko(player, [
      { opponentRating: 1500, opponentRd: 350, score: 1 },
    ]);
    const loss = updateGlicko(player, [
      { opponentRating: 1500, opponentRd: 350, score: 0 },
    ]);

    // Une victoire monte le rating, une defaite le baisse ; RD diminue apres
    // un match (l'incertitude se resorbe).
    expect(win.rating).toBeGreaterThan(DEFAULT_RATING);
    expect(loss.rating).toBeLessThan(DEFAULT_RATING);
    expect(win.rd).toBeLessThan(DEFAULT_RD);
    expect(loss.rd).toBeLessThan(DEFAULT_RD);
    // RD reste borne.
    expect(win.rd).toBeLessThanOrEqual(DEFAULT_RD);
  });
});
