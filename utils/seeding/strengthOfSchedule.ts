// utils/seeding/strengthOfSchedule.ts
//
// Reducteur PUR (aucune I/O, aucun import Supabase) qui calcule le
// Strength-of-Schedule (SoS) de chaque equipe a partir des matches deja
// charges par le handler API et d'une map rating par equipe.
//
// Regles :
//  - On ne compte QUE les matches status ∈ {'finished','walkover'}, non-bye,
//    dont les deux teamId sont non nuls. Le reste est ignore.
//  - Pour chaque match compte, on ajoute a CHAQUE equipe le rating de SON
//    adversaire (lu dans ratingByTeam, sinon defaultRating). Le rating adverse
//    est comptabilise PAR MATCH (pas de deduplication par adversaire) : deux
//    matches contre le meme adversaire comptent deux fois.
//  - SoS d'une equipe = MOYENNE des ratings adverses sur ses matchs comptes.
//    opponentCount = nombre de matchs comptes.
//  - Equipe sans aucun match compte -> { sos: defaultRating, opponentCount: 0 }
//    (valeur neutre, evite tout biais et toute division par zero).

// ---------------------------------------------------------------------------
// Types d'entree / sortie.
// ---------------------------------------------------------------------------

export type SoSMatch = {
  teamAId: string | null;
  teamBId: string | null;
  status: string;
  isBye: boolean | null;
};

export type SoSResult = {
  sos: number;
  opponentCount: number;
};

/** Rating neutre attribue a un adversaire inconnu et a une equipe sans match. */
export const SOS_DEFAULT_RATING = 1500;

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

const COUNTED_STATUSES = new Set(['finished', 'walkover']);

/** Indique si un match est eligible au calcul du SoS. */
function isCounted(match: SoSMatch): boolean {
  if (match.isBye) return false;
  if (!COUNTED_STATUSES.has(match.status)) return false;
  if (!match.teamAId || !match.teamBId) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Reducteur principal.
// ---------------------------------------------------------------------------

/**
 * Calcule le SoS de chaque equipe apparaissant dans un match compte.
 *
 * @returns une map teamId -> { sos, opponentCount }. Une equipe qui n'apparait
 *   dans aucun match compte n'est PAS presente dans la map ; les appelants
 *   doivent traiter l'absence comme { sos: defaultRating, opponentCount: 0 }
 *   (comportement documente et applique par computeRatingSeeding via sos ?? …).
 */
export function computeStrengthOfSchedule(input: {
  matches: SoSMatch[];
  ratingByTeam: Map<string, number>;
  defaultRating?: number;
}): Map<string, SoSResult> {
  const { matches, ratingByTeam } = input;
  const defaultRating = input.defaultRating ?? SOS_DEFAULT_RATING;

  // Accumulateur mutable : somme des ratings adverses + nombre de matchs.
  type Agg = { sum: number; count: number };
  const agg = new Map<string, Agg>();
  const ensure = (id: string): Agg => {
    let e = agg.get(id);
    if (!e) {
      e = { sum: 0, count: 0 };
      agg.set(id, e);
    }
    return e;
  };

  const ratingOf = (teamId: string): number =>
    ratingByTeam.get(teamId) ?? defaultRating;

  for (const m of matches) {
    if (!isCounted(m)) continue;
    // isCounted garantit les deux teamId non nuls.
    const a = m.teamAId as string;
    const b = m.teamBId as string;
    // A recoit le rating de B, et inversement.
    ensure(a).sum += ratingOf(b);
    ensure(a).count += 1;
    ensure(b).sum += ratingOf(a);
    ensure(b).count += 1;
  }

  const result = new Map<string, SoSResult>();
  agg.forEach((e, teamId) => {
    // count > 0 garanti ici (on n'insere que lors d'un match compte).
    result.set(teamId, {
      sos: e.count > 0 ? e.sum / e.count : defaultRating,
      opponentCount: e.count,
    });
  });

  return result;
}
