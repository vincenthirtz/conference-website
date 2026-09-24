// utils/stages/bracketStage.ts
//
// « L'onglet Bracket de ce tournoi montre-t-il un arbre, ou la phase finale ? »
//
// Un tournoi en championnat (round robin, swiss, poules) sans phase à
// élimination n'a pas d'arbre : sa page Bracket restait « bientôt disponible »
// jusqu'au dernier jour. Elle y montre à la place la phase finale — les
// affiches projetées depuis le classement et la course à la qualification —,
// et l'onglet change de nom en conséquence, sur TOUTES les pages du tournoi.
//
// PUR : lit une réponse déjà reçue, comme utils/stages/ffaStage.ts.

import type { StageTypeRow } from './ffaStage';

/** Type de phase stocké en base pour un arbre d'élimination. */
export const BRACKET_STAGE_TYPE = 'bracket';

export type BracketTabMode = 'bracket' | 'finals';

/**
 * `finals` quand le tournoi a des phases, mais aucune à élimination. Sans
 * aucune phase (tournoi pas encore structuré), on garde `bracket` : rien ne
 * dit encore quel format il aura.
 */
export function bracketTabMode(
  stages: readonly (StageTypeRow | string)[] | null | undefined
): BracketTabMode {
  if (!Array.isArray(stages) || stages.length === 0) return 'bracket';
  const types = stages.map((s) => (typeof s === 'string' ? s : s.stage_type));
  return types.includes(BRACKET_STAGE_TYPE) ? 'bracket' : 'finals';
}
