// utils/groups/roundRobin.ts
// Generation de pairings round-robin pour une poule.
// Algorithme du "circle method" : chaque equipe rencontre toutes les autres une fois.
// Si rounds > 1, on inverse les cotes (home/away) au round suivant.

export type RoundRobinPairing = {
  round: number;
  team1Id: string | null; // null = BYE pour team2
  team2Id: string | null;
};

/**
 * Genere les pairings round-robin pour une liste d'equipes.
 *
 * - n equipes paires : (n-1) rounds, n/2 matchs par round, pas de BYE
 * - n equipes impaires : n rounds, (n-1)/2 matchs par round + 1 BYE par round
 *
 * @param teamIds Equipes de la poule (au moins 2)
 * @param rounds Nombre de rounds (1 = simple, 2 = aller-retour, etc.)
 * @returns Liste de pairings ordonnee par round
 */
export function generateRoundRobinPairings(
  teamIds: string[],
  rounds: number = 1
): RoundRobinPairing[] {
  if (teamIds.length < 2) return [];
  if (rounds < 1) return [];

  // Insere un placeholder BYE si nombre impair
  const list = teamIds.slice();
  const hasBye = list.length % 2 === 1;
  if (hasBye) list.push('__BYE__');

  const n = list.length;
  const roundsPerCycle = n - 1;
  const half = n / 2;

  const pairings: RoundRobinPairing[] = [];

  for (let cycle = 0; cycle < rounds; cycle++) {
    // Rotation : on garde la premiere equipe fixe, on tourne les autres
    const rotated = list.slice();

    for (let r = 0; r < roundsPerCycle; r++) {
      const roundIndex = cycle * roundsPerCycle + r + 1;

      for (let i = 0; i < half; i++) {
        const a = rotated[i];
        const b = rotated[n - 1 - i];

        if (a === '__BYE__') {
          pairings.push({ round: roundIndex, team1Id: b, team2Id: null });
          continue;
        }
        if (b === '__BYE__') {
          pairings.push({ round: roundIndex, team1Id: a, team2Id: null });
          continue;
        }

        // Sur les cycles pairs (0, 2, ...) : a recoit b. Sur les cycles impairs : on inverse.
        if (cycle % 2 === 0) {
          pairings.push({ round: roundIndex, team1Id: a, team2Id: b });
        } else {
          pairings.push({ round: roundIndex, team1Id: b, team2Id: a });
        }
      }

      // Rotation : decale toutes les equipes sauf la premiere
      const last = rotated.pop()!;
      rotated.splice(1, 0, last);
    }
  }

  return pairings;
}
