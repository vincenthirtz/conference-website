// utils/profile/buildHallOfFame.ts
//
// Réducteur PUR (aucune I/O) du palmarès individuel cross-tournois.
//
// WHY : le palmarès existe déjà, mais uniquement DANS la fiche d'une joueuse
// (`utils/profile/achievements.ts`) — il faut donc déjà savoir qui chercher
// pour le voir. Ce réducteur retourne le problème : il agrège tous les
// classements finaux de tous les tournois pour produire UNE liste, celle des
// joueuses les plus titrées du circuit.
//
// Attribution : un titre revient aux joueuses qui ont effectivement joué le
// tournoi pour l'équipe classée (`match_participants`, snapshot immuable), pas
// au roster actuel de l'équipe — sinon une joueuse arrivée après coup
// hériterait d'un titre qu'elle n'a pas disputé.
//
// Testé dans tests/unit/buildHallOfFame.test.ts.

/** Une participation classée : une joueuse, un tournoi, un rang final. */
export type HallOfFamePlacementRow = {
  userId: string;
  tournamentId: string;
  tournamentName: string | null;
  tournamentSlug: string | null;
  teamId: string;
  teamName: string | null;
  rank: number;
  /** Date du tournoi (ISO), pour ordonner le détail. */
  date: string | null;
};

/** Ligne de palmarès affichée sur la page. */
export type HallOfFameEntry = {
  userId: string;
  titles: number;
  finals: number;
  podiums: number;
  tournaments: number;
  mvps: number;
  bestRank: number;
  /** Détail des participations classées, meilleures d'abord. */
  placements: HallOfFamePlacementRow[];
};

const PODIUM_RANK = 3;

/**
 * Agrège les participations classées en palmarès par joueuse.
 *
 * Tri : titres DESC, finales DESC, podiums DESC, MVP DESC, meilleur rang ASC,
 * puis `userId` ASC. Ce dernier tie-break rend l'ordre total et déterministe —
 * sans lui, deux rendus ISR successifs pourraient permuter deux ex æquo.
 *
 * Une même joueuse comptée deux fois sur le même tournoi (deux équipes, données
 * incohérentes) n'est comptabilisée qu'une fois : c'est la paire
 * (userId, tournamentId) qui fait l'unicité, pas la ligne.
 */
export function buildHallOfFame(
  rows: readonly HallOfFamePlacementRow[],
  mvpsByUser: ReadonlyMap<string, number> = new Map()
): HallOfFameEntry[] {
  const byUser = new Map<string, HallOfFameEntry>();
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row?.userId || !row.tournamentId) continue;
    if (!Number.isFinite(row.rank)) continue;

    const key = `${row.userId}:${row.tournamentId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const entry = byUser.get(row.userId) ?? {
      userId: row.userId,
      titles: 0,
      finals: 0,
      podiums: 0,
      tournaments: 0,
      mvps: mvpsByUser.get(row.userId) ?? 0,
      bestRank: Number.POSITIVE_INFINITY,
      placements: [],
    };

    entry.tournaments += 1;
    if (row.rank === 1) entry.titles += 1;
    if (row.rank === 2) entry.finals += 1;
    if (row.rank <= PODIUM_RANK) entry.podiums += 1;
    if (row.rank < entry.bestRank) entry.bestRank = row.rank;
    entry.placements.push(row);

    byUser.set(row.userId, entry);
  }

  // Les joueuses n'ayant que des MVP (aucun tournoi classé) n'apparaissent
  // pas : le palmarès est d'abord une liste de résultats d'équipe.
  for (const entry of byUser.values()) {
    entry.placements.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      // À rang égal, le plus récent d'abord ; date absente en dernier.
      if (a.date && b.date) return b.date.localeCompare(a.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });
  }

  return Array.from(byUser.values()).sort((a, b) => {
    if (b.titles !== a.titles) return b.titles - a.titles;
    if (b.finals !== a.finals) return b.finals - a.finals;
    if (b.podiums !== a.podiums) return b.podiums - a.podiums;
    if (b.mvps !== a.mvps) return b.mvps - a.mvps;
    if (a.bestRank !== b.bestRank) return a.bestRank - b.bestRank;
    return a.userId.localeCompare(b.userId);
  });
}
