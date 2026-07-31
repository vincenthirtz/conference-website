// utils/teams/progression.ts
//
// Progression et jalons (N8) — cœur PUR.
//
// `player_ratings` et `team_ratings` donnent une photo instantanée.
// `player_rating_history` existe depuis le début mais n'est restituée nulle
// part : aucune courbe, aucun jalon, aucun « vous avez gagné 40 points ce
// mois-ci ». Le rating est donc un chiffre, pas un récit — et un chiffre ne
// motive personne.
//
// DEUX RÈGLES, et la seconde est celle qui compte :
//
//   1. AUCUN JALON FABRIQUÉ. Pas de points, pas de badges décoratifs, pas de
//      niveaux inventés. Chaque jalon est une PHRASE VÉRIFIABLE dans les
//      données : « premier affrontement le 3 juillet », « 10 affrontements
//      joués », « meilleur niveau atteint : 1540 ». Si on ne peut pas le
//      pointer dans une table, il n'existe pas.
//
//   2. ON NE DIT RIEN QU'ON NE SAIT PAS. Une variation de niveau demande deux
//      mesures ; une série en cours demande assez d'affrontements pour ne pas
//      être une coïncidence. En dessous, les fonctions renvoient `null` plutôt
//      qu'un zéro qui se lirait comme une information.

import type { PlayedGame } from '@/utils/teams/scouting';
import { resultFor } from '@/utils/teams/scouting';

/** Points affichés par la sparkline d'une stat tile. */
export const SERIES_MAX_POINTS = 12;

/**
 * En dessous, pas de sparkline : deux points ne forment pas une tendance, ils
 * forment un segment — et un segment se lit comme une trajectoire qu'il n'a
 * aucun droit de suggérer.
 */
export const SERIES_MIN_POINTS = 3;

/** Une série en cours n'est parlante qu'à partir de trois affrontements. */
export const STREAK_MIN_LENGTH = 3;

/** Paliers d'affrontements marqués. Conventionnels, mais vérifiables. */
export const ENCOUNTER_MILESTONES = [10, 25, 50, 100] as const;

export type RatingPoint = { at: string; rating: number };

export type RatingHistoryRow = {
  occurredAt: string | null;
  ratingAfter: number | null;
};

export type Streak = { type: 'win' | 'loss'; length: number };

/** Codes de jalon — l'UI porte le libellé, comme partout ailleurs. */
export type MilestoneCode =
  | 'first_encounter'
  | 'first_win'
  | 'encounters_reached'
  | 'peak_rating'
  | 'streak';

export type Milestone = {
  code: MilestoneCode;
  /** Valeur chiffrée du jalon (palier, niveau, longueur de série). */
  value?: number;
  /** Date du fait, quand il en a une. */
  at?: string;
  /** Sens de la série, pour `streak` uniquement. */
  streakType?: 'win' | 'loss';
};

/**
 * Série de niveau, chronologique, plafonnée aux derniers points.
 *
 * On garde les DERNIERS points et non les premiers : une sparkline raconte où
 * l'on va, pas d'où l'on vient.
 */
export function buildRatingSeries(
  history: RatingHistoryRow[],
  max: number = SERIES_MAX_POINTS
): RatingPoint[] {
  const points: RatingPoint[] = [];
  for (const row of history) {
    if (!row.occurredAt) continue;
    const t = Date.parse(row.occurredAt);
    if (!Number.isFinite(t)) continue;
    // `Number(null)` vaut 0, pas NaN : sans ce garde explicite, un niveau
    // absent serait tracé à ZÉRO et écraserait toute l'échelle de la
    // sparkline. Le piège est silencieux — d'où le test dédié.
    if (row.ratingAfter === null || row.ratingAfter === undefined) continue;
    const rating = Number(row.ratingAfter);
    if (!Number.isFinite(rating)) continue;
    points.push({ at: new Date(t).toISOString(), rating });
  }
  points.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return points.slice(-max);
}

/**
 * Variation sur la série affichée. `null` sous deux points : une variation
 * demande deux mesures, et « 0 » se lirait comme « n'a pas bougé ».
 */
export function ratingDelta(series: RatingPoint[]): number | null {
  if (series.length < 2) return null;
  return Math.round(series[series.length - 1].rating - series[0].rating);
}

/** Meilleur niveau jamais atteint, courant compris. `null` si jamais noté. */
export function peakRating(
  history: RatingHistoryRow[],
  current: number | null
): number | null {
  // Même piège que dans `buildRatingSeries` : `Number(null) === 0`. Un peak à
  // 0 s'afficherait comme un jalon (« meilleur niveau atteint : 0 ») pour une
  // joueuse jamais notée.
  let peak =
    current !== null && Number.isFinite(Number(current))
      ? Number(current)
      : null;
  for (const row of history) {
    if (row.ratingAfter === null || row.ratingAfter === undefined) continue;
    const rating = Number(row.ratingAfter);
    if (!Number.isFinite(rating)) continue;
    peak = peak === null ? rating : Math.max(peak, rating);
  }
  return peak === null ? null : Math.round(peak);
}

/**
 * Série en cours d'une équipe, lue depuis le dernier affrontement décidé.
 *
 * Les nuls et les affrontements sans issue connue INTERROMPENT la série sans
 * la constituer : compter une série « à travers » un résultat inconnu
 * fabriquerait un fait.
 */
export function currentStreak(
  games: PlayedGame[],
  teamId: string
): Streak | null {
  // On ne FILTRE PAS les affrontements sans issue : on les garde dans l'ordre
  // et on s'arrête dessus. Les retirer ferait « sauter » la série par-dessus un
  // résultat inconnu et compterait une série qui n'a peut-être jamais eu lieu.
  const ordered = games
    .map((g) => ({ g, result: resultFor(g, teamId) }))
    .sort((a, b) => {
      const ta = a.g.playedAt ? Date.parse(a.g.playedAt) : NaN;
      const tb = b.g.playedAt ? Date.parse(b.g.playedAt) : NaN;
      const va = Number.isFinite(ta);
      const vb = Number.isFinite(tb);
      if (va && vb) return tb - ta;
      if (va) return -1;
      if (vb) return 1;
      return 0;
    });

  if (ordered.length === 0) return null;
  const head = ordered[0].result;
  if (head !== 'win' && head !== 'loss') return null;

  let length = 0;
  for (const entry of ordered) {
    if (entry.result !== head) break;
    length += 1;
  }
  return length >= STREAK_MIN_LENGTH ? { type: head, length } : null;
}

export type MilestoneInput = {
  games: PlayedGame[];
  teamId: string;
  history: RatingHistoryRow[];
  currentRating: number | null;
};

/**
 * Jalons d'une équipe et de sa joueuse — uniquement des faits datés ou
 * chiffrés, jamais une récompense.
 *
 * L'ordre est celui du récit : d'où l'on part, ce qu'on a franchi, où l'on en
 * est.
 */
export function computeMilestones(input: MilestoneInput): Milestone[] {
  const out: Milestone[] = [];

  const dated = input.games
    .filter((g) => g.playedAt && Number.isFinite(Date.parse(g.playedAt)))
    .sort((a, b) => Date.parse(a.playedAt!) - Date.parse(b.playedAt!));

  if (dated.length > 0) {
    out.push({ code: 'first_encounter', at: dated[0].playedAt! });
  }

  const firstWin = dated.find((g) => resultFor(g, input.teamId) === 'win');
  if (firstWin) {
    out.push({ code: 'first_win', at: firstWin.playedAt! });
  }

  // Palier le plus élevé franchi, pas la liste de tous les paliers : « 10 et
  // 25 affrontements » n'apprend rien de plus que « 25 ».
  const played = input.games.length;
  const reached = [...ENCOUNTER_MILESTONES]
    .filter((threshold) => played >= threshold)
    .pop();
  if (reached) {
    out.push({ code: 'encounters_reached', value: reached });
  }

  const peak = peakRating(input.history, input.currentRating);
  if (peak !== null) {
    out.push({ code: 'peak_rating', value: peak });
  }

  const streak = currentStreak(input.games, input.teamId);
  if (streak) {
    out.push({
      code: 'streak',
      value: streak.length,
      streakType: streak.type,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Géométrie de la sparkline
// ---------------------------------------------------------------------------

/** Boîte SVG de la sparkline, en unités de vue (le rendu reste fluide). */
export const SPARK_WIDTH = 240;
export const SPARK_HEIGHT = 48;
export const SPARK_PADDING = 4;

export type SparkGeometry = {
  /** Tracé complet, destiné à la teinte de mise en retrait. */
  path: string;
  /** Dernier segment, destiné à l'accent : c'est lui qui porte « où l'on va ». */
  lastSegment: string;
  points: Array<{ x: number; y: number; point: RatingPoint }>;
};

/**
 * Projette la série dans la boîte SVG. `null` sous le seuil de points.
 *
 * Ici plutôt que dans le composant pour être vérifiable : une erreur de
 * projection ne lève rien, elle dessine simplement une courbe fausse — et
 * c'est le pire mode d'échec possible pour un graphique.
 *
 * Deux partis pris :
 *   - l'axe Y est INVERSÉ (SVG descend, le niveau monte) ;
 *   - une série PLATE est centrée verticalement, pas collée en haut : sinon un
 *     niveau stable se dessinerait comme un plafond atteint.
 */
export function buildSparkGeometry(
  series: RatingPoint[]
): SparkGeometry | null {
  if (series.length < SERIES_MIN_POINTS) return null;

  const values = series.map((p) => p.rating);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  const innerW = SPARK_WIDTH - SPARK_PADDING * 2;
  const innerH = SPARK_HEIGHT - SPARK_PADDING * 2;

  const points = series.map((point, i) => {
    const x = SPARK_PADDING + (innerW * i) / (series.length - 1);
    const y =
      span === 0
        ? SPARK_PADDING + innerH / 2
        : SPARK_PADDING + innerH - (innerH * (point.rating - min)) / span;
    return { x, y, point };
  });

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  const a = points[points.length - 2];
  const b = points[points.length - 1];
  const lastSegment = `M${a.x.toFixed(1)},${a.y.toFixed(1)} L${b.x.toFixed(1)},${b.y.toFixed(1)}`;

  return { path, lastSegment, points };
}
