// lib/swiss/utils.ts
// Petits utilitaires communs pour le système Swiss
// - config de points (victoire / nul / défaite / bye)
// - conversion outcome -> SwissMatchResult
// - génération de SwissPastMatch à partir de résultats
// - helpers pour analyser l'historique des joueurs

import type {
  MatchOutcome,
  RawOutcomeInput,
  SwissMatchResult,
  SwissPastMatch,
  SwissScoreConfig,
} from '../../types/swiss';

/* -----------------------------------------------------------
 * Config de points
 * ---------------------------------------------------------*/

/**
 * Config par défaut classique en e-sport :
 * victoire = 3, nul = 1, défaite = 0, bye = 3
 */
export const defaultSwissScoreConfig: SwissScoreConfig = {
  win: 3,
  draw: 1,
  loss: 0,
  bye: 3,
};

/* -----------------------------------------------------------
 * Outcome → SwissMatchResult
 * ---------------------------------------------------------*/

/**
 * Convertit un résultat "brut" (win / loss / draw / bye pour player1)
 * en SwissMatchResult avec points calculés.
 */
export function outcomeToSwissResult(
  input: RawOutcomeInput,
  config: SwissScoreConfig = defaultSwissScoreConfig
): SwissMatchResult {
  const { round, player1Id, player2Id, outcomeForP1 } = input;

  if (!player2Id || outcomeForP1 === 'bye') {
    // Bye : player2Id peut rester null, points de bye pour P1
    return {
      round,
      player1Id,
      player2Id: null,
      player1Score: config.bye,
      player2Score: 0,
    };
  }

  switch (outcomeForP1) {
    case 'win':
      return {
        round,
        player1Id,
        player2Id,
        player1Score: config.win,
        player2Score: config.loss,
      };
    case 'loss':
      return {
        round,
        player1Id,
        player2Id,
        player1Score: config.loss,
        player2Score: config.win,
      };
    case 'draw':
      return {
        round,
        player1Id,
        player2Id,
        player1Score: config.draw,
        player2Score: config.draw,
      };
    default:
      throw new Error(`Outcome inconnu: ${outcomeForP1}`);
  }
}

/**
 * Helper pour convertir une liste d'outcomes bruts en SwissMatchResult[]
 */
export function outcomesToSwissResults(
  inputs: RawOutcomeInput[],
  config: SwissScoreConfig = defaultSwissScoreConfig
): SwissMatchResult[] {
  return inputs.map((input) => outcomeToSwissResult(input, config));
}

/* -----------------------------------------------------------
 * SwissMatchResult -> SwissPastMatch
 * ---------------------------------------------------------*/

/**
 * Convertit un SwissMatchResult en SwissPastMatch pour l'anti-rematch.
 */
export function resultToPastMatch(result: SwissMatchResult): SwissPastMatch {
  return {
    round: result.round,
    player1Id: result.player1Id,
    player2Id: result.player2Id,
  };
}

/**
 * Convertit une liste de SwissMatchResult en SwissPastMatch[]
 */
export function resultsToPastMatches(
  results: SwissMatchResult[]
): SwissPastMatch[] {
  return results.map(resultToPastMatch);
}

/* -----------------------------------------------------------
 * Helpers d'analyse d'historique
 * ---------------------------------------------------------*/

/**
 * Récupère tous les matchs d'un joueur (SwissMatchResult[])
 */
export function getPlayerMatchHistory(
  results: SwissMatchResult[],
  playerId: string
): SwissMatchResult[] {
  return results.filter(
    (m) => m.player1Id === playerId || m.player2Id === playerId
  );
}

/**
 * Récupère les IDs de tous les adversaires d'un joueur,
 * hors bye (player2Id null).
 */
export function getPlayerOpponents(
  results: SwissMatchResult[],
  playerId: string
): string[] {
  const set = new Set<string>();

  for (const m of results) {
    if (m.player1Id === playerId && m.player2Id) {
      set.add(m.player2Id);
    } else if (m.player2Id === playerId) {
      set.add(m.player1Id);
    }
  }

  return Array.from(set);
}

/**
 * Vérifie si deux joueurs se sont déjà rencontrés dans les résultats fournis.
 */
export function havePlayersMet(
  results: SwissMatchResult[],
  playerA: string,
  playerB: string
): boolean {
  if (playerA === playerB) return false;

  for (const m of results) {
    if (!m.player2Id) continue; // bye

    const p1 = m.player1Id;
    const p2 = m.player2Id;

    if (
      (p1 === playerA && p2 === playerB) ||
      (p1 === playerB && p2 === playerA)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Nombre de fois où deux joueurs se sont rencontrés.
 */
export function countMatchesBetween(
  results: SwissMatchResult[],
  playerA: string,
  playerB: string
): number {
  if (playerA === playerB) return 0;
  let count = 0;

  for (const m of results) {
    if (!m.player2Id) continue;

    const p1 = m.player1Id;
    const p2 = m.player2Id;

    if (
      (p1 === playerA && p2 === playerB) ||
      (p1 === playerB && p2 === playerA)
    ) {
      count += 1;
    }
  }

  return count;
}
