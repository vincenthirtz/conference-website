// utils/predictions/leaderboard.ts
//
// Le classement des pronostiqueuses — réducteur PUR (aucune I/O), comme
// `utils/predictions/rules.ts` dont il prolonge la mécanique.
//
// CE QUI CLASSE, ET DANS QUEL ORDRE. Le nombre de pronostics JUSTES d'abord :
// c'est ce que les gens comptent, et c'est ce que la monnaie récompense. La
// précision ensuite, pour départager qui a vu juste plus souvent en se
// trompant moins. Le nombre de pronostics réglés en dernier — à égalité
// parfaite, avoir joué davantage passe devant.
//
// LES EX ÆQUO PARTAGENT LEUR RANG (1, 2, 2, 4) : deux personnes au même score
// ne se départagent pas par leur identifiant, et voir « 3e » quelqu'un qui a le
// même total que la 2e serait faux.
//
// UN SEUIL POUR ENTRER AU CLASSEMENT. Sans lui, la première place revient à qui
// a deviné UN match : un classement où deux pronostics battent quarante ne
// mesure rien. En dessous du seuil, la personne n'est pas exclue pour autant —
// elle est rendue à part (`pending`), avec ce qui lui manque pour entrer.
//
// LES PRONOSTICS SANS SUITE NE COMPTENT NI EN BIEN NI EN MAL. Un forfait ou un
// match annulé règle en `void` (cf. `rules.ts`) : l'inclure en dénominateur
// punirait une personne pour une décision d'organisation.

import type { PredictionResult } from './rules';

/** Pronostics à régler avant d'entrer au classement. */
export const MIN_SETTLED_FOR_RANK = 3;

export type PredictionTally = {
  userId: string;
  /** Pronostics tranchés (justes + manqués). Les `void` n'y sont pas. */
  settled: number;
  correct: number;
  /** Justes / réglés, entre 0 et 1. `0` quand rien n'est réglé. */
  accuracy: number;
  /** Pièces gagnées par ces pronostics justes. */
  coins: number;
};

export type RankedPredictor = PredictionTally & { rank: number };

export type PredictionLeaderboard = {
  /** Classées, de la première à la dernière. */
  ranked: RankedPredictor[];
  /** Sous le seuil : comptées, jamais classées. */
  pending: PredictionTally[];
  minSettled: number;
};

export type SettledPrediction = {
  userId: string;
  result: PredictionResult | null;
};

/** Cumul par personne. Les résultats inconnus ou `void` sont ignorés. */
export function tallyPredictions(
  rows: readonly SettledPrediction[],
  rewardCoins: number
): PredictionTally[] {
  const byUser = new Map<string, { settled: number; correct: number }>();
  for (const row of rows) {
    if (!row.userId) continue;
    if (row.result !== 'won' && row.result !== 'lost') continue;
    const tally = byUser.get(row.userId) ?? { settled: 0, correct: 0 };
    tally.settled += 1;
    if (row.result === 'won') tally.correct += 1;
    byUser.set(row.userId, tally);
  }

  return [...byUser.entries()].map(([userId, tally]) => ({
    userId,
    settled: tally.settled,
    correct: tally.correct,
    accuracy: tally.settled > 0 ? tally.correct / tally.settled : 0,
    coins: tally.correct * rewardCoins,
  }));
}

/** Comparaison de classement : justes, puis précision, puis volume. */
function compareTallies(a: PredictionTally, b: PredictionTally): number {
  if (b.correct !== a.correct) return b.correct - a.correct;
  if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
  return b.settled - a.settled;
}

export function buildLeaderboard(
  rows: readonly SettledPrediction[],
  options: { rewardCoins: number; minSettled?: number }
): PredictionLeaderboard {
  const minSettled = options.minSettled ?? MIN_SETTLED_FOR_RANK;
  const tallies = tallyPredictions(rows, options.rewardCoins);

  const eligible = tallies
    .filter((t) => t.settled >= minSettled)
    // Tri stable sur l'identifiant AVANT le tri de classement : deux exécutions
    // sur les mêmes données rendent le même ordre, même à égalité parfaite.
    .sort((a, b) => a.userId.localeCompare(b.userId))
    .sort(compareTallies);

  const ranked: RankedPredictor[] = [];
  let lastRank = 0;
  eligible.forEach((tally, index) => {
    const previous = eligible[index - 1];
    // Ex æquo : même rang que la précédente ; le rang suivant saute d'autant.
    const rank =
      previous && compareTallies(previous, tally) === 0 ? lastRank : index + 1;
    lastRank = rank;
    ranked.push({ ...tally, rank });
  });

  const pending = tallies
    .filter((t) => t.settled < minSettled)
    .sort(compareTallies);

  return { ranked, pending, minSettled };
}

/** La ligne d'une personne, classée ou non. `null` si elle n'a rien réglé. */
export function findMyStanding(
  leaderboard: PredictionLeaderboard,
  userId: string
): RankedPredictor | PredictionTally | null {
  return (
    leaderboard.ranked.find((row) => row.userId === userId) ??
    leaderboard.pending.find((row) => row.userId === userId) ??
    null
  );
}
