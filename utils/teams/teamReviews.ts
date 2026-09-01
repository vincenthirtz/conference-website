// utils/teams/teamReviews.ts
//
// Mémoire d'équipe (N2) — cœur PUR des revues de match et de scrim.
//
// Une revue, c'est le travail de l'équipe : ce qu'elle a compris d'un
// affrontement, et le lien vers la VOD qui le montre. Aujourd'hui ce travail
// vit sur Discord, c'est-à-dire ailleurs — et une plateforme qu'on quitte sans
// rien perdre est une plateforme qu'on quitte.
//
// Deux règles portent tout le module :
//
//   1. UNE REVUE VIDE N'EXISTE PAS. Vider les deux champs ne laisse pas une
//      coquille en base : ça supprime la revue. Sinon l'historique se remplit
//      d'entrées « notées » sans contenu, et le seul signal utile de la liste
//      (« qu'a-t-on déjà débriefé ? ») devient faux.
//
//   2. L'URL DE VOD EST VALIDÉE POUR CE QU'ELLE EST RENDUE : un lien cliquable.
//      On n'accepte donc que http/https. Un `javascript:` ou un `data:` stocké
//      ici deviendrait un XSS au premier clic — le champ est libre, saisi par
//      une joueuse, et relu par toute son équipe.

/** Longueurs miroir des CHECK de `team_reviews`. */
export const MAX_VOD_LENGTH = 500;
export const MAX_NOTES_LENGTH = 4000;
/** Miroir du CHECK `team_reviews_objectives_len`. */
export const MAX_OBJECTIVES_LENGTH = 2000;

export const REVIEW_SUBJECT_TYPES = ['match', 'scrim'] as const;
export type ReviewSubjectType = (typeof REVIEW_SUBJECT_TYPES)[number];

export function isReviewSubjectType(
  value: unknown
): value is ReviewSubjectType {
  return (
    typeof value === 'string' &&
    (REVIEW_SUBJECT_TYPES as readonly string[]).includes(value)
  );
}

export type ReviewContent = {
  vodUrl: string | null;
  notes: string | null;
  /**
   * Intentions posées AVANT le match (lot J5). Sur la même ligne que la revue,
   * parce que c'est le même affrontement : une revue peut naître avant le match
   * (objectifs seuls) et se compléter après. C'est la boucle du métier de
   * coach — fixer, puis regarder si ça a tenu.
   */
  objectives: string | null;
};

export type NormalizeReviewResult =
  | { ok: true; content: ReviewContent; isEmpty: boolean }
  | { ok: false; error: string };

/**
 * Valide et normalise une URL de VOD.
 *
 * Renvoie `null` pour une saisie vide (c'est un champ facultatif), une erreur
 * pour tout ce qui n'est pas un lien http(s) exploitable. On ne restreint PAS
 * aux hébergeurs connus : une équipe qui héberge sa VOD ailleurs a le droit,
 * et une liste blanche deviendrait fausse au premier service manquant.
 */
export function normalizeVodUrl(
  input: unknown
): { ok: true; url: string | null } | { ok: false; error: string } {
  if (input == null) return { ok: true, url: null };
  if (typeof input !== 'string') {
    return { ok: false, error: 'Lien de VOD invalide.' };
  }
  const raw = input.trim();
  if (!raw) return { ok: true, url: null };
  if (raw.length > MAX_VOD_LENGTH) {
    return {
      ok: false,
      error: `Le lien de VOD ne peut pas dépasser ${MAX_VOD_LENGTH} caractères.`,
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: 'Le lien de VOD doit être une URL complète.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      error: 'Le lien de VOD doit commencer par http ou https.',
    };
  }
  return { ok: true, url: parsed.toString() };
}

/**
 * Valide le contenu d'une revue. `isEmpty` signale à l'appelant qu'il doit
 * SUPPRIMER la revue plutôt que d'en écrire une coquille (cf. règle 1).
 */
export function normalizeReviewContent(input: {
  vodUrl?: unknown;
  notes?: unknown;
  objectives?: unknown;
}): NormalizeReviewResult {
  const vod = normalizeVodUrl(input.vodUrl);
  if (!vod.ok) return { ok: false, error: vod.error };

  let notes: string | null = null;
  if (input.notes != null) {
    if (typeof input.notes !== 'string') {
      return { ok: false, error: 'Notes invalides.' };
    }
    const trimmed = input.notes.trim();
    if (trimmed.length > MAX_NOTES_LENGTH) {
      return {
        ok: false,
        error: `Les notes ne peuvent pas dépasser ${MAX_NOTES_LENGTH} caractères.`,
      };
    }
    notes = trimmed || null;
  }

  let objectives: string | null = null;
  if (input.objectives != null) {
    if (typeof input.objectives !== 'string') {
      return { ok: false, error: 'Objectifs invalides.' };
    }
    const trimmed = input.objectives.trim();
    if (trimmed.length > MAX_OBJECTIVES_LENGTH) {
      return {
        ok: false,
        error: `Les objectifs ne peuvent pas dépasser ${MAX_OBJECTIVES_LENGTH} caractères.`,
      };
    }
    objectives = trimmed || null;
  }

  const content: ReviewContent = { vodUrl: vod.url, notes, objectives };
  // « Une revue vide n'existe pas » vaut sur les TROIS champs : des objectifs
  // posés avant le match suffisent à faire exister la ligne, et vider les notes
  // ne doit pas les emporter avec elles.
  return {
    ok: true,
    content,
    isEmpty: !content.vodUrl && !content.notes && !content.objectives,
  };
}

// ---------------------------------------------------------------------------
// Historique : fusionner matchs et scrims en une seule chronologie
// ---------------------------------------------------------------------------

export type EncounterInput = {
  subjectType: ReviewSubjectType;
  subjectId: string;
  playedAt: string | null;
  opponentTeamId: string | null;
  opponentName: string | null;
  /** Score de MON point de vue, quand il est connu. */
  myScore: number | null;
  opponentScore: number | null;
  result: 'win' | 'loss' | 'draw' | null;
  label: string | null;
};

export type Encounter = EncounterInput & {
  review:
    | (ReviewContent & { updatedAt: string | null; updatedBy: string | null })
    | null;
};

/**
 * Fusionne matchs et scrims en une chronologie unique, la plus récente
 * d'abord, et y accroche la revue correspondante.
 *
 * Le tri mêle délibérément les deux types : une équipe se souvient d'« un
 * affrontement », pas d'« un match » ou d'« un scrim ». Les affrontements sans
 * date passent en fin de liste plutôt que d'être exclus — ils existent, ils
 * sont juste mal renseignés.
 */
export function buildEncounterHistory(
  encounters: EncounterInput[],
  reviews: Array<
    ReviewContent & {
      subjectType: ReviewSubjectType;
      subjectId: string;
      updatedAt: string | null;
      updatedBy: string | null;
    }
  >
): Encounter[] {
  const bySubject = new Map<string, (typeof reviews)[number]>();
  for (const review of reviews) {
    bySubject.set(`${review.subjectType}:${review.subjectId}`, review);
  }

  return [...encounters]
    .sort((a, b) => {
      const ta = a.playedAt ? Date.parse(a.playedAt) : NaN;
      const tb = b.playedAt ? Date.parse(b.playedAt) : NaN;
      const va = Number.isFinite(ta);
      const vb = Number.isFinite(tb);
      if (va && vb) return tb - ta;
      if (va) return -1;
      if (vb) return 1;
      return a.subjectId.localeCompare(b.subjectId);
    })
    .map((encounter) => {
      const review = bySubject.get(
        `${encounter.subjectType}:${encounter.subjectId}`
      );
      return {
        ...encounter,
        review: review
          ? {
              vodUrl: review.vodUrl,
              notes: review.notes,
              objectives: review.objectives,
              updatedAt: review.updatedAt,
              updatedBy: review.updatedBy,
            }
          : null,
      };
    });
}
