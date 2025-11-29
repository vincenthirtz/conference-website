// lib/matches/computeRequiredWins.ts
// Helpers pour savoir combien de maps/manches sont nécessaires
// pour gagner une série (BO1 / BO3 / BO5 / etc.)

/**
 * Formats typiques supportés.
 * Tu peux passer n'importe quelle string (ex: "bo9"),
 * la fonction essaiera de parser automatiquement.
 */
export type MatchSeriesFormat =
  | "bo1"
  | "bo2"
  | "bo3"
  | "bo5"
  | "bo7"
  | "single_map"
  | "map_decider"
  | string
  | null
  | undefined;

/**
 * Calcule le nombre de maps/manches à gagner pour remporter la série.
 *
 * Ex :
 * - "bo1" → 1
 * - "bo3" → 2
 * - "bo5" → 3
 * - "bo7" → 4
 * - "single_map" / "map_decider" → 1
 * - "bo9" → 5
 * - format inconnu → 1 (fallback safe)
 */
export function computeRequiredWins(
  format: MatchSeriesFormat
): number {
  if (!format) return 1;

  const f = format.toLowerCase().trim();

  // Formats alias "single map"
  if (f === "single_map" || f === "map_decider") {
    return 1;
  }

  // Formats type "bo3", "bo5", "bo7", "bo9", etc.
  const boMatch = /^bo(\d+)$/.exec(f);
  if (boMatch) {
    const total = parseInt(boMatch[1], 10);
    if (!isNaN(total) && total > 0) {
      // Best-of-N → il faut floor(N/2) + 1 victoires
      return Math.floor(total / 2) + 1;
    }
  }

  // Fallback safe : 1 victoire
  return 1;
}

/**
 * Vérifie si une équipe a atteint le nombre de victoires requis
 * pour remporter la série.
 */
export function hasTeamReachedRequiredWins(
  teamWins: number,
  format: MatchSeriesFormat
): boolean {
  const required = computeRequiredWins(format);
  return teamWins >= required;
}

/**
 * Vérifie si une série est terminée à partir des scores actuels.
 * Retourne true dès qu'une équipe a atteint le nombre de victoires requis.
 */
export function isSeriesFinished(
  team1Wins: number,
  team2Wins: number,
  format: MatchSeriesFormat
): boolean {
  const required = computeRequiredWins(format);
  return (
    team1Wins >= required || team2Wins >= required
  );
}

/**
 * Détermine le vainqueur de la série (si elle est terminée).
 * - "team1" si team1 a atteint les wins requis et strictement plus que team2
 * - "team2" si team2 a atteint les wins requis et strictement plus que team1
 * - "tie" si les deux atteignent le seuil (cas exotique)
 * - null si la série n'est pas encore décidée
 */
export function getSeriesWinnerFromScores(
  team1Wins: number,
  team2Wins: number,
  format: MatchSeriesFormat
): "team1" | "team2" | "tie" | null {
  const required = computeRequiredWins(format);

  const t1Reached = team1Wins >= required;
  const t2Reached = team2Wins >= required;

  if (!t1Reached && !t2Reached) return null;

  if (t1Reached && !t2Reached) return "team1";
  if (!t1Reached && t2Reached) return "team2";

  if (t1Reached && t2Reached) {
    if (team1Wins > team2Wins) return "team1";
    if (team2Wins > team1Wins) return "team2";
    return "tie";
  }

  return null;
}
