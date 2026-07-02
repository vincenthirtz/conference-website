// utils/profile/achievements.ts
//
// Réducteur PUR (aucune I/O, entièrement testable) qui dérive les badges, le
// palmarès et l'historique de saison d'un profil joueur à partir de données
// déjà chargées par le handler API. Toute la logique de tri / dérivation vit
// ici pour rester unit-testable sans DB.
//
// Règles :
//  - palmares  = placements triés par rank ASC puis date DESC (meilleurs
//    d'abord ; date null en dernier à rang égal).
//  - seasons   = seasons triées par rank ASC (null en dernier) puis points DESC.
//  - badges    = dérivés puis dédupliqués par `key` (un seul par key, on garde
//    le meilleur tier), puis ordonnés par importance stable (voir BADGE_ORDER).
//    Détail des règles :
//      * champion       (gold)     : un placement rank === 1.
//      * finalist       (silver)   : un placement rank === 2.
//      * podium         (bronze)   : un placement rank <= 3.
//      * top_cut        (bronze)   : un placement rank <= 8.
//      * league_winner  (gold)     : une saison rank === 1.
//      * peak_*         (un seul, le plus haut) : peakRating >= 2000 master
//        (platinum), sinon >= 1800 elite (gold), sinon >= 1600 contender
//        (silver).
//      * veteran_*      (un seul, le plus haut) : gamesPlayed >= 100
//        veteran_legend (gold), sinon >= 50 veteran (silver), sinon >= 10
//        regular (bronze).
//      * win_streak     : plus longue série de victoires consécutives >= 5
//        (une loss/draw casse la série) ; gold si >= 10 sinon silver.
//  - Entrées vides -> { badges: [], palmares: [], seasons: [] }, aucun NaN.

import type {
  ProfileAchievements,
  ProfileBadge,
  ProfileBadgeTier,
  ProfilePlacement,
  ProfileSeason,
} from '@/types/rating';

// ---------------------------------------------------------------------------
// Entrées
// ---------------------------------------------------------------------------

export type AchievementsInput = {
  placements: ProfilePlacement[];
  stats: {
    peakRating: number;
    gamesPlayed: number;
    wins: number;
    losses: number;
  };
  /** Résultats en ordre chronologique ASC (le plus ancien d'abord). */
  results: { result: 'win' | 'loss' | 'draw'; occurredAt: string }[];
  seasons: ProfileSeason[];
};

// ---------------------------------------------------------------------------
// Ordre d'importance stable des badges. Une clé absente de cette table est
// placée en fin de liste (garde-fou ; ne devrait pas arriver).
// ---------------------------------------------------------------------------

const BADGE_ORDER: Record<string, number> = {
  champion: 0,
  league_winner: 1,
  finalist: 2,
  podium: 3,
  top_cut: 4,
  peak_master: 5,
  peak_elite: 6,
  peak_contender: 7,
  veteran_legend: 8,
  veteran: 9,
  regular: 10,
  win_streak: 11,
};

const TIER_RANK: Record<ProfileBadgeTier, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  platinum: 3,
};

/** Compare deux tiers (null = plus faible que tout tier concret). */
function tierIsBetter(
  candidate: ProfileBadgeTier | null,
  current: ProfileBadgeTier | null
): boolean {
  const c = candidate === null ? -1 : TIER_RANK[candidate];
  const cur = current === null ? -1 : TIER_RANK[current];
  return c > cur;
}

// ---------------------------------------------------------------------------
// Tri palmarès / seasons
// ---------------------------------------------------------------------------

function sortPalmares(placements: ProfilePlacement[]): ProfilePlacement[] {
  return [...placements].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank; // rank ASC
    // date DESC ; null en dernier.
    const da = a.date;
    const db = b.date;
    if (da === db) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return db < da ? -1 : db > da ? 1 : 0;
  });
}

function sortSeasons(seasons: ProfileSeason[]): ProfileSeason[] {
  return [...seasons].sort((a, b) => {
    // rank ASC ; null en dernier.
    if (a.rank !== b.rank) {
      if (a.rank === null) return 1;
      if (b.rank === null) return -1;
      return a.rank - b.rank;
    }
    return b.points - a.points; // points DESC
  });
}

// ---------------------------------------------------------------------------
// Plus longue série de victoires consécutives (results en ordre chrono ASC).
// Une loss/draw casse la série. Renvoie 0 si aucune victoire.
// ---------------------------------------------------------------------------

export function longestWinStreak(
  results: { result: 'win' | 'loss' | 'draw' }[]
): number {
  let best = 0;
  let current = 0;
  for (const r of results) {
    if (r.result === 'win') {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Moteur
// ---------------------------------------------------------------------------

export function computeAchievements(
  input: AchievementsInput
): ProfileAchievements {
  const placements = Array.isArray(input.placements) ? input.placements : [];
  const seasons = Array.isArray(input.seasons) ? input.seasons : [];
  const results = Array.isArray(input.results) ? input.results : [];

  const palmares = sortPalmares(placements);
  const sortedSeasons = sortSeasons(seasons);

  // Collecte des badges dans une map key -> badge (dédup + meilleur tier).
  const byKey = new Map<string, ProfileBadge>();
  const add = (badge: ProfileBadge): void => {
    const existing = byKey.get(badge.key);
    if (!existing) {
      byKey.set(badge.key, badge);
      return;
    }
    if (tierIsBetter(badge.tier, existing.tier)) {
      byKey.set(badge.key, badge);
    }
  };

  // --- Badges issus des placements (tournois) ---
  const hasRank = (pred: (rank: number) => boolean): boolean =>
    placements.some((p) => Number.isFinite(p.rank) && pred(p.rank));

  if (hasRank((r) => r === 1)) {
    add({
      key: 'champion',
      label: 'Championne',
      description: "Vainqueure d'un tournoi.",
      tier: 'gold',
    });
  }
  if (hasRank((r) => r === 2)) {
    add({
      key: 'finalist',
      label: 'Finaliste',
      description: "Finaliste d'un tournoi.",
      tier: 'silver',
    });
  }
  if (hasRank((r) => r <= 3)) {
    add({
      key: 'podium',
      label: 'Podium',
      description: "Montée sur le podium d'un tournoi.",
      tier: 'bronze',
    });
  }
  if (hasRank((r) => r <= 8)) {
    add({
      key: 'top_cut',
      label: 'Top 8',
      description: "Qualification dans le top 8 d'un tournoi.",
      tier: 'bronze',
    });
  }

  // --- Badge de saison ---
  if (seasons.some((s) => s.rank === 1)) {
    add({
      key: 'league_winner',
      label: 'Reine de saison',
      description: 'Vainqueure de saison.',
      tier: 'gold',
    });
  }

  // --- Palier de peak rating (un seul, le plus haut) ---
  const peak = Number.isFinite(input.stats?.peakRating)
    ? input.stats.peakRating
    : 0;
  if (peak >= 2000) {
    add({
      key: 'peak_master',
      label: 'Maîtresse',
      description: 'Pic de classement à 2000 ou plus.',
      tier: 'platinum',
    });
  } else if (peak >= 1800) {
    add({
      key: 'peak_elite',
      label: 'Élite',
      description: 'Pic de classement à 1800 ou plus.',
      tier: 'gold',
    });
  } else if (peak >= 1600) {
    add({
      key: 'peak_contender',
      label: 'Prétendante',
      description: 'Pic de classement à 1600 ou plus.',
      tier: 'silver',
    });
  }

  // --- Palier d'expérience (un seul, le plus haut) ---
  const games = Number.isFinite(input.stats?.gamesPlayed)
    ? input.stats.gamesPlayed
    : 0;
  if (games >= 100) {
    add({
      key: 'veteran_legend',
      label: 'Légende',
      description: '100 matchs joués ou plus.',
      tier: 'gold',
    });
  } else if (games >= 50) {
    add({
      key: 'veteran',
      label: 'Vétérane',
      description: '50 matchs joués ou plus.',
      tier: 'silver',
    });
  } else if (games >= 10) {
    add({
      key: 'regular',
      label: 'Habituée',
      description: '10 matchs joués ou plus.',
      tier: 'bronze',
    });
  }

  // --- Série de victoires ---
  const streak = longestWinStreak(results);
  if (streak >= 5) {
    add({
      key: 'win_streak',
      label: 'Série gagnante',
      description: `${streak} victoires d'affilée.`,
      tier: streak >= 10 ? 'gold' : 'silver',
    });
  }

  const badges = [...byKey.values()].sort((a, b) => {
    const oa =
      a.key in BADGE_ORDER ? BADGE_ORDER[a.key] : Number.MAX_SAFE_INTEGER;
    const ob =
      b.key in BADGE_ORDER ? BADGE_ORDER[b.key] : Number.MAX_SAFE_INTEGER;
    return oa - ob;
  });

  return { badges, palmares, seasons: sortedSeasons };
}
