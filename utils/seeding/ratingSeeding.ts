// utils/seeding/ratingSeeding.ts
//
// Reducteur PUR (aucune I/O, aucun import Supabase) qui produit la liste
// ORDONNEE des equipes (rank 1..n) attendue par
// utils/stages/autoSeed.ts::computeProposedSeeding, a partir des ratings
// d'equipe (Glicko derive) et, optionnellement, du Strength-of-Schedule (SoS).
//
// Regles :
//  - rating = input.rating ?? defaultRating ; sos = input.sos ?? defaultRating.
//  - method 'rating'      -> score = rating.
//  - method 'rating_sos'  -> score = rating + sosWeight * (sos - defaultRating).
//        Le SoS ajuste le rating autour du neutre (defaultRating) : des
//        adversaires forts (sos > default) donnent un bonus, des adversaires
//        faibles (sos < default) un malus. sosWeight controle l'amplitude.
//  - Tri par score DESC, puis departages successifs :
//        1. rating DESC
//        2. rd ASC (moins d'incertitude d'abord ; rd null = +∞ => dernier)
//        3. gamesPlayed DESC
//        4. teamId ASC (comparaison de chaine, garantit un ordre stable/total)
//  - rank = 1..n dans l'ordre trie (rangs distincts, jamais d'ex aequo).
//  - provisional = rd == null || rd > provisionalRdThreshold || gamesPlayed === 0.
//  - teams vide -> [].
//  - On renvoie rating/rd/sos/score pour permettre un breakdown cote UI.

// ---------------------------------------------------------------------------
// Types d'entree / sortie.
// ---------------------------------------------------------------------------

export type SeedingMethod = 'rating' | 'rating_sos';

export type SeedingTeamInput = {
  teamId: string;
  rating: number | null;
  rd: number | null;
  gamesPlayed: number;
  sos: number | null;
};

export type SeededTeam = {
  teamId: string;
  rank: number;
  rating: number;
  rd: number | null;
  sos: number;
  score: number;
  provisional: boolean;
};

/** Rating/SoS neutre applique quand la valeur d'entree est null. */
export const SEEDING_DEFAULT_RATING = 1500;

/** Poids par defaut de l'ajustement SoS autour du rating neutre. */
export const SEEDING_DEFAULT_SOS_WEIGHT = 0.15;

/** Au-dela de ce RD (ou rd null), le seeding d'une equipe est provisoire. */
export const SEEDING_PROVISIONAL_RD = 150;

// ---------------------------------------------------------------------------
// Reducteur principal.
// ---------------------------------------------------------------------------

export function computeRatingSeeding(input: {
  teams: SeedingTeamInput[];
  method: SeedingMethod;
  sosWeight?: number;
  defaultRating?: number;
  provisionalRdThreshold?: number;
}): SeededTeam[] {
  const { teams, method } = input;
  const sosWeight = input.sosWeight ?? SEEDING_DEFAULT_SOS_WEIGHT;
  const defaultRating = input.defaultRating ?? SEEDING_DEFAULT_RATING;
  const provisionalRdThreshold =
    input.provisionalRdThreshold ?? SEEDING_PROVISIONAL_RD;

  if (teams.length === 0) return [];

  // Etape 1 : normaliser les entrees et calculer le score de chaque equipe.
  type Scored = {
    teamId: string;
    rating: number;
    rd: number | null;
    gamesPlayed: number;
    sos: number;
    score: number;
    provisional: boolean;
  };

  const scored: Scored[] = teams.map((t) => {
    const rating = t.rating ?? defaultRating;
    const sos = t.sos ?? defaultRating;
    const score =
      method === 'rating_sos'
        ? rating + sosWeight * (sos - defaultRating)
        : rating;
    const provisional =
      t.rd == null || t.rd > provisionalRdThreshold || t.gamesPlayed === 0;
    return {
      teamId: t.teamId,
      rating,
      rd: t.rd,
      gamesPlayed: t.gamesPlayed,
      sos,
      score,
      provisional,
    };
  });

  // Etape 2 : tri total deterministe (voir regles de departage en tete).
  // rd null est traite comme +∞ (place l'equipe en dernier sur ce critere).
  const rdKey = (rd: number | null): number =>
    rd == null ? Number.POSITIVE_INFINITY : rd;

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score; // score DESC
    if (b.rating !== a.rating) return b.rating - a.rating; // rating DESC
    const ra = rdKey(a.rd);
    const rb = rdKey(b.rd);
    if (ra !== rb) return ra - rb; // rd ASC (null = dernier)
    if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed; // gamesPlayed DESC
    return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0; // teamId ASC
  });

  // Etape 3 : attribuer les rangs 1..n distincts.
  return scored.map((s, i) => ({
    teamId: s.teamId,
    rank: i + 1,
    rating: s.rating,
    rd: s.rd,
    sos: s.sos,
    score: s.score,
    provisional: s.provisional,
  }));
}
