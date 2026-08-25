// utils/rating/aggregateRatingDeltas.ts
//
// Réducteur PUR (aucune I/O) des lignes `player_rating_history` en variations
// de rating par joueuse, sur une fenêtre déjà filtrée par l'appelant (30 jours
// glissants, tournois d'une saison…).
//
// WHY : le classement public n'a qu'un seul axe — le rating brut. Il est
// stable par construction, donc il met en avant les trois mêmes joueuses
// indéfiniment. Agréger les DELTAS ouvre un second axe (« qui progresse »)
// où une nouvelle venue peut apparaître dès sa première série de victoires.
//
// La logique de tri / d'agrégation vit ici pour rester unit-testable sans DB.
// Testé dans tests/unit/aggregateRatingDeltas.test.ts.

/** Ligne d'historique consommée par l'agrégat (sous-ensemble des colonnes DB). */
export type RatingHistoryRow = {
  user_id: string;
  rating_before: number;
  rating_after: number;
  result: 'win' | 'loss' | 'draw';
};

/** Variation agrégée d'une joueuse sur la fenêtre considérée. */
export type RatingDelta = {
  userId: string;
  /** Somme des (rating_after − rating_before) sur la fenêtre. */
  delta: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
};

/**
 * Agrège les variations par joueuse et trie par progression décroissante.
 *
 * Tri : `delta` DESC, puis `matches` DESC (à progression égale, celle qui a
 * joué le plus l'a fait sur plus d'adversité), puis `userId` ASC pour un ordre
 * total déterministe — sans ce dernier tie-break, deux rendus ISR successifs
 * pourraient inverser deux ex æquo.
 *
 * Les lignes dont le delta n'est pas un nombre fini sont ignorées : une donnée
 * corrompue ne doit pas propager un NaN dans tout le classement.
 */
export function aggregateRatingDeltas(
  rows: readonly RatingHistoryRow[]
): RatingDelta[] {
  const byUser = new Map<string, RatingDelta>();

  for (const row of rows) {
    if (!row?.user_id) continue;
    const delta = row.rating_after - row.rating_before;
    if (!Number.isFinite(delta)) continue;

    const current = byUser.get(row.user_id) ?? {
      userId: row.user_id,
      delta: 0,
      matches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    };
    current.delta += delta;
    current.matches += 1;
    if (row.result === 'win') current.wins += 1;
    else if (row.result === 'loss') current.losses += 1;
    else current.draws += 1;
    byUser.set(row.user_id, current);
  }

  return Array.from(byUser.values()).sort((a, b) => {
    if (b.delta !== a.delta) return b.delta - a.delta;
    if (b.matches !== a.matches) return b.matches - a.matches;
    return a.userId.localeCompare(b.userId);
  });
}
