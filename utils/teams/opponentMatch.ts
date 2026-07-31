// utils/teams/opponentMatch.ts
//
// Score de compatibilité d'adversaire (N4) — PUR, testable sans base.
//
// Ce que ça remplace : l'annuaire triait par « créneaux en commun », puis
// « cherche un scrim », puis alphabétique. Le rating et la fiabilité étaient
// AFFICHÉS mais n'entraient pas dans l'ordre — une équipe à 1200 et une à 1900
// se retrouvaient côte à côte, et une équipe qui ne répond jamais passait devant
// une équipe fiable. L'annuaire montrait des données ; il ne donnait pas de
// conseil.
//
// Trois partis pris :
//
//   1. UN FACTEUR INCONNU VAUT UN A PRIORI NEUTRE, pas zéro et pas non plus une
//      exclusion du calcul. Une équipe sans rating n'est pas « mauvaise », elle
//      n'a simplement jamais joué : la punir la reléguerait en fin de liste,
//      ce qui est l'inverse du but recherché.
//      Attention au piège inverse, qui est réel : retirer les facteurs inconnus
//      et RENORMALISER les poids fait remonter en tête les équipes dont on ne
//      sait RIEN — leur score se réduit alors au seul facteur connu (la
//      nouveauté, maximale par construction pour une équipe jamais jouée). Une
//      équipe parfaitement inconnue passerait devant une équipe avec laquelle on
//      a un créneau commun confirmé. L'a priori neutre évite les deux écueils.
//
//   2. LE SCORE S'EXPLIQUE. On renvoie des codes de raison (pas des phrases) :
//      l'UI les traduit. Un classement qu'on ne peut pas justifier en une phrase
//      est un classement auquel personne ne fait confiance.
//
//   3. LE RYTHME SERT DE REPLI. Quand aucune des deux équipes n'a d'annonce
//      vivante — le cas NORMAL tant que le réseau est peu dense — on retombe sur
//      les créneaux récurrents (N1). C'est ce qui rend le score utile AVANT que
//      le réseau soit dense, au lieu d'attendre une liquidité qui n'arrive pas.

/** Codes de raison — traduits côté UI, jamais affichés bruts. */
export type OpponentReason =
  | 'common_slots'
  | 'common_rhythm'
  | 'no_common_slots'
  | 'similar_level'
  | 'level_gap'
  | 'reliable'
  | 'slow_to_answer'
  | 'never_played'
  | 'played_recently';

/** Chaque facteur vaut 0..1, ou `null` quand l'information n'existe pas. */
export type OpponentFactors = {
  slots: number | null;
  level: number | null;
  reliability: number | null;
  novelty: number | null;
};

export type OpponentMatchInput = {
  /** Créneaux DATÉS en commun (annonces vivantes des deux côtés). */
  commonSearchSlots: number;
  /** Créneaux RÉCURRENTS en commun (rythmes d'équipe, N1). */
  commonRhythmSlots: number;
  /**
   * Les deux équipes ont-elles déclaré quelque chose ? Si non, l'absence de
   * créneau commun n'est pas une information : c'est un trou de données.
   */
  slotsComparable: boolean;
  myRating: number | null;
  theirRating: number | null;
  /** Taux de réponse aux propositions, 0-100. `null` sous le seuil (R10). */
  responseRate: number | null;
  /** Affrontements (match ou scrim) sur les 90 derniers jours. */
  encountersRecent: number;
};

export type OpponentMatch = {
  /** 0..100. Sert au tri de l'annuaire. */
  score: number;
  factors: OpponentFactors;
  /** Au plus 3 raisons, de la plus décisive à la moins décisive. */
  reasons: OpponentReason[];
};

/**
 * Poids relatifs. La disponibilité domine délibérément : un adversaire parfait
 * qu'on ne peut jamais jouer ne vaut rien, alors qu'un écart de niveau se
 * compense (on apprend en jouant plus fort).
 */
const WEIGHTS = {
  slots: 0.45,
  level: 0.25,
  reliability: 0.2,
  novelty: 0.1,
} as const;

/**
 * Écart de rating au-delà duquel la proximité de niveau vaut 0.
 * 400 points = l'échelle Elo/Glicko où l'issue devient quasi certaine.
 */
export const LEVEL_SPAN = 400;

/** Valeur d'un facteur dont on ignore tout (cf. parti pris n° 1). */
const NEUTRAL = 0.5;

/**
 * Barème de la disponibilité. Le PREMIER créneau commun compte beaucoup plus
 * que les suivants : passer de « aucun » à « un » change la nature de la
 * relation (on peut jouer), passer de un à deux n'ajoute que du confort. Un
 * barème linéaire mettrait un créneau commun confirmé sous l'a priori neutre —
 * autrement dit, une équipe inconnue passerait devant une équipe jouable.
 */
const SLOTS_BASE = 0.55;
const SLOTS_STEP = 0.15;

/**
 * Un créneau récurrent vaut moins qu'un créneau daté : c'est une habitude
 * déclarée, pas un engagement pour jeudi prochain.
 */
const RHYTHM_WEIGHT = 0.5;

/** Valeur de nouveauté selon le nombre d'affrontements récents. */
function noveltyFor(encounters: number): number {
  if (encounters <= 0) return 1;
  if (encounters === 1) return 0.7;
  if (encounters === 2) return 0.45;
  // On ne descend pas à 0 : rejouer une équipe connue reste utile, ça devient
  // juste moins prioritaire que de varier les adversaires.
  return 0.25;
}

export function computeOpponentMatch(input: OpponentMatchInput): OpponentMatch {
  const slotSignal =
    input.commonSearchSlots + input.commonRhythmSlots * RHYTHM_WEIGHT;

  const slots =
    slotSignal > 0
      ? Math.min(1, SLOTS_BASE + SLOTS_STEP * slotSignal)
      : input.slotsComparable
        ? 0
        : null;

  const level =
    input.myRating != null && input.theirRating != null
      ? Math.max(
          0,
          1 - Math.abs(input.myRating - input.theirRating) / LEVEL_SPAN
        )
      : null;

  const reliability =
    input.responseRate != null
      ? Math.min(1, Math.max(0, input.responseRate / 100))
      : null;

  const novelty = noveltyFor(input.encountersRecent);

  const factors: OpponentFactors = { slots, level, reliability, novelty };

  // Moyenne pondérée sur TOUS les facteurs, les inconnus valant l'a priori
  // neutre. Les poids somment à 1 : pas de renormalisation, donc pas d'effet
  // « l'inconnu remonte en tête » (cf. parti pris n° 1).
  let weighted = 0;
  for (const key of ['slots', 'level', 'reliability', 'novelty'] as const) {
    weighted += (factors[key] ?? NEUTRAL) * WEIGHTS[key];
  }
  const score = Math.round(weighted * 100);

  return { score, factors, reasons: buildReasons(input, factors) };
}

/**
 * Raisons affichées, dans l'ordre où elles pèsent. On s'arrête à 3 : au-delà,
 * ce n'est plus une justification, c'est un rapport.
 */
function buildReasons(
  input: OpponentMatchInput,
  factors: OpponentFactors
): OpponentReason[] {
  const reasons: OpponentReason[] = [];

  if (input.commonSearchSlots > 0) reasons.push('common_slots');
  else if (input.commonRhythmSlots > 0) reasons.push('common_rhythm');
  else if (factors.slots === 0) reasons.push('no_common_slots');

  if (factors.level != null) {
    if (factors.level >= 0.75) reasons.push('similar_level');
    else if (factors.level <= 0.35) reasons.push('level_gap');
  }

  if (factors.reliability != null) {
    if (factors.reliability >= 0.8) reasons.push('reliable');
    else if (factors.reliability <= 0.5) reasons.push('slow_to_answer');
  }

  if (input.encountersRecent === 0) reasons.push('never_played');
  else if (input.encountersRecent >= 3) reasons.push('played_recently');

  return reasons.slice(0, 3);
}
