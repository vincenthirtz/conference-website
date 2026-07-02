// utils/rating/glicko2.ts
//
// Moteur Glicko-2 PUR (aucune I/O) implementant l'algorithme canonique de
// Mark Glickman, « Example of the Glicko-2 system ».
//
// Vue d'ensemble :
//  - Le rating public est sur l'echelle « originale » (autour de 1500).
//  - Les calculs internes se font sur l'echelle Glicko-2 :
//        mu  = (r - 1500) / GLICKO2_SCALE
//        phi = rd / GLICKO2_SCALE
//  - La volatilite sigma est estimee via l'algorithme d'Illinois (dichotomie
//    reguliere) avec convergence eps = 1e-6.
//  - Cas special « aucun match dans la periode » : rating et volatilite
//    inchanges, RD augmente via phi* = sqrt(phi^2 + sigma^2).
//  - RD est borne a DEFAULT_RD (350) apres update.

export const DEFAULT_RATING = 1500;
export const DEFAULT_RD = 350;
export const DEFAULT_VOLATILITY = 0.06;
export const DEFAULT_TAU = 0.5;
export const GLICKO2_SCALE = 173.7178;

/** Etat de rating d'un joueur sur l'echelle publique (originale). */
export type Glicko = { rating: number; rd: number; volatility: number };

/**
 * Resultat d'un match du point de vue du joueur note.
 * score : 1 = victoire, 0.5 = nul, 0 = defaite.
 */
export type GlickoOutcome = {
  opponentRating: number;
  opponentRd: number;
  score: number;
};

/** Precision de convergence de l'iteration d'Illinois pour sigma'. */
const CONVERGENCE_EPS = 1e-6;

/** g(phi) — facteur d'attenuation lie a l'incertitude de l'adversaire. */
function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

/** E(mu, mu_j, phi_j) — probabilite attendue de victoire du joueur. */
function expectedScore(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/**
 * Met a jour l'etat Glicko-2 d'un joueur pour une periode de notation.
 *
 * @param player   etat courant (echelle publique)
 * @param outcomes matches joues durant la periode (vide => periode « a vide »)
 * @param tau      contrainte sur le changement de volatilite (systeme-dependant)
 */
export function updateGlicko(
  player: Glicko,
  outcomes: GlickoOutcome[],
  tau = DEFAULT_TAU
): Glicko {
  // Etape 2 : conversion vers l'echelle Glicko-2.
  const mu = (player.rating - DEFAULT_RATING) / GLICKO2_SCALE;
  const phi = player.rd / GLICKO2_SCALE;
  const sigma = player.volatility;

  // Cas special : aucun match dans la periode.
  // Le rating et la volatilite restent ; seul le RD grandit.
  if (outcomes.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    let newRd = phiStar * GLICKO2_SCALE;
    if (newRd > DEFAULT_RD) newRd = DEFAULT_RD;
    return { rating: player.rating, rd: newRd, volatility: sigma };
  }

  // Etape 3 : variance v de la note fondee sur les resultats du jeu seul.
  let vInv = 0;
  // Etape 4 : quantite delta (composante d'amelioration de la note).
  let deltaSum = 0;

  for (const o of outcomes) {
    const muJ = (o.opponentRating - DEFAULT_RATING) / GLICKO2_SCALE;
    const phiJ = o.opponentRd / GLICKO2_SCALE;
    const gJ = g(phiJ);
    const eJ = expectedScore(mu, muJ, phiJ);
    vInv += gJ * gJ * eJ * (1 - eJ);
    deltaSum += gJ * (o.score - eJ);
  }

  const v = 1 / vInv;
  const delta = v * deltaSum;

  // Etape 5 : determination de la nouvelle volatilite sigma' (Illinois).
  const a = Math.log(sigma * sigma);
  const phi2 = phi * phi;
  const delta2 = delta * delta;

  const f = (x: number): number => {
    const ex = Math.exp(x);
    const num = ex * (delta2 - phi2 - v - ex);
    const den = 2 * (phi2 + v + ex) * (phi2 + v + ex);
    return num / den - (x - a) / (tau * tau);
  };

  let A = a;
  let B: number;
  if (delta2 > phi2 + v) {
    B = Math.log(delta2 - phi2 - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) {
      k += 1;
    }
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > CONVERGENCE_EPS) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }

  const sigmaPrime = Math.exp(A / 2);

  // Etape 6 : pre-mise a jour du RD a la nouvelle volatilite.
  const phiStar = Math.sqrt(phi2 + sigmaPrime * sigmaPrime);

  // Etape 7 : nouvelles phi' et mu'.
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * deltaSum;

  // Etape 8 : reconversion vers l'echelle publique.
  const newRating = muPrime * GLICKO2_SCALE + DEFAULT_RATING;
  let newRd = phiPrime * GLICKO2_SCALE;
  if (newRd > DEFAULT_RD) newRd = DEFAULT_RD;

  return { rating: newRating, rd: newRd, volatility: sigmaPrime };
}
