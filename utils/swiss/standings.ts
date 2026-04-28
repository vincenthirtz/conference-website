// lib/swiss/standings.ts
// Calcul des standings pour un système Swiss
// - Score total (points)
// - Buchholz (somme des scores des adversaires)
// - Median Buchholz (Buchholz en retirant meilleur et pire adversaire)
// - Gère les bye (adversaire null)

// Ce fichier est volontairement indépendant de la persistance (Supabase, etc.)
// et ne fait que de la logique pure.
import type {
  ComputeSwissStandingsOptions,
  RankedSwissStanding,
  SwissMatchResult,
  SwissStanding,
  SwissStandingParticipant,
} from '../../types/swiss';

/**
 * Calcule les standings Swiss (score + Buchholz + Median Buchholz)
 * à partir d'une liste de participants et de résultats de matchs.
 */
export function computeSwissStandings(
  options: ComputeSwissStandingsOptions
): SwissStanding[] {
  const { participants, results } = options;

  // 1) Initialiser les agrégats
  type Agg = {
    id: string;
    name?: string;
    seed?: number;
    score: number;
    wins: number;
    draws: number;
    losses: number;
    hadBye: boolean;
    byeCount: number;
    opponents: Set<string>;
  };

  const map = new Map<string, Agg>();

  for (const p of participants) {
    map.set(p.id, {
      id: p.id,
      name: p.name,
      seed: p.seed,
      score: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      hadBye: false,
      byeCount: 0,
      opponents: new Set(),
    });
  }

  // Helper pour récupérer / créer un participant même s'il n'est pas dans la liste initiale
  function ensureAgg(id: string): Agg {
    let agg = map.get(id);
    if (!agg) {
      agg = {
        id,
        name: undefined,
        seed: undefined,
        score: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        hadBye: false,
        byeCount: 0,
        opponents: new Set(),
      };
      map.set(id, agg);
    }
    return agg;
  }

  // 2) Parcourir les résultats et accumuler les scores + adversaires
  // Head-to-head map: "idA::idB" → score différentiel pour A (positif = A a gagné)
  const headToHead = new Map<string, number>();

  function h2hKey(a: string, b: string): string {
    return `${a}::${b}`;
  }

  for (const m of results) {
    const p1 = ensureAgg(m.player1Id);

    if (!m.player2Id) {
      // Bye : le joueur1 prend les points, mais pas d'adversaire
      p1.score += m.player1Score;
      p1.hadBye = true;
      p1.byeCount += 1;
      // On peut considérer un bye comme "victoire" si on veut
      if (m.player1Score > 0) p1.wins += 1;
      continue;
    }

    const p2 = ensureAgg(m.player2Id);

    p1.score += m.player1Score;
    p2.score += m.player2Score;

    // Win/draw/loss selon la comparaison des scores de match
    if (m.player1Score > m.player2Score) {
      p1.wins += 1;
      p2.losses += 1;
    } else if (m.player1Score < m.player2Score) {
      p2.wins += 1;
      p1.losses += 1;
    } else {
      // même score = draw
      p1.draws += 1;
      p2.draws += 1;
    }

    // Head-to-head : accumuler le différentiel de score (gère les multi-rencontres)
    const diff = m.player1Score - m.player2Score;
    headToHead.set(
      h2hKey(p1.id, p2.id),
      (headToHead.get(h2hKey(p1.id, p2.id)) ?? 0) + diff
    );
    headToHead.set(
      h2hKey(p2.id, p1.id),
      (headToHead.get(h2hKey(p2.id, p1.id)) ?? 0) - diff
    );

    // Adversaires pour tie-breakers
    p1.opponents.add(p2.id);
    p2.opponents.add(p1.id);
  }

  // 3) Calculer Buchholz / Median Buchholz
  const allAggs = Array.from(map.values());

  // Map id → score final (utile pour tie-break)
  const finalScoreById = new Map<string, number>();
  for (const agg of allAggs) {
    finalScoreById.set(agg.id, agg.score);
  }

  const standings: SwissStanding[] = allAggs.map((agg) => {
    const opponentScores: number[] = [];

    for (const oppId of agg.opponents) {
      const oppScore = finalScoreById.get(oppId);
      if (typeof oppScore === 'number') {
        opponentScores.push(oppScore);
      }
    }

    // Buchholz = somme des scores des adversaires
    const buchholz = opponentScores.reduce((sum, v) => sum + v, 0);

    // Median Buchholz : on retire le plus bas et le plus haut si >= 3 adversaires
    let medianBuchholz = buchholz;
    if (opponentScores.length >= 3) {
      const sorted = opponentScores.slice().sort((a, b) => a - b);
      const trimmed = sorted.slice(1, sorted.length - 1); // retire min et max
      medianBuchholz = trimmed.reduce((sum, v) => sum + v, 0);
    }

    return {
      id: agg.id,
      name: agg.name,
      seed: agg.seed,
      score: agg.score,
      wins: agg.wins,
      draws: agg.draws,
      losses: agg.losses,
      hadBye: agg.hadBye,
      byeCount: agg.byeCount,
      buchholz,
      medianBuchholz,
      opponents: Array.from(agg.opponents),
    };
  });

  // 4) Trier le classement :
  // - score DESC
  // - buchholz DESC
  // - medianBuchholz DESC
  // - head-to-head (confrontation directe, si les deux joueurs se sont affrontés)
  // - byeCount ASC (moins de byes = mieux classé, pénalisant)
  // - seed ASC (si présent)
  // - id pour stabilité
  standings.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    if (b.medianBuchholz !== a.medianBuchholz)
      return b.medianBuchholz - a.medianBuchholz;

    // Head-to-head : si A et B se sont rencontrés, le gagnant direct passe devant
    const h2hDiff = headToHead.get(h2hKey(a.id, b.id));
    if (h2hDiff !== undefined && h2hDiff !== 0) {
      return h2hDiff > 0 ? -1 : 1; // positif = A a gagné → A devant
    }

    // Bye count : moins de byes = meilleur (pénalise les byes)
    if (a.byeCount !== b.byeCount) return a.byeCount - b.byeCount;

    const sa = a.seed ?? Number.MAX_SAFE_INTEGER;
    const sb = b.seed ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;

    return a.id.localeCompare(b.id);
  });

  return standings;
}

/* -----------------------------------------------------------
 * Helpers pour l'UI
 * ---------------------------------------------------------*/

/**
 * Ajoute un champ "rank" (1, 2, 3, ...) sur les standings.
 * Utile pour l'affichage direct dans un tableau.
 */
export function rankSwissStandings(
  standings: SwissStanding[]
): RankedSwissStanding[] {
  return standings.map((s, idx) => ({
    ...s,
    rank: idx + 1,
  }));
}
