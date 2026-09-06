// Types pour les settings JSONB des `tournament_stages.settings`.
// La forme exacte depend du `stage_type`, mais en pratique le code traite
// la plupart des champs comme optionnels (acces via `settings?.foo`).
//
// On expose donc :
//   - les types nommes par variante (BracketSettings, SwissSettings, ...)
//     qui declinent les champs propres a chaque type
//   - un type "loose" `StageSettings` qui regroupe tous les champs
//     en optionnel : c'est ce qui est stocke dans `Stage.settings`.

import type { AdvancementRules } from '@/utils/stages/autoAdvance';

/**
 * Reglages communs a tous les types de stage.
 */
export type CommonStageSettings = {
  /** Avancement automatique vers un autre stage. */
  advancement_rules?: AdvancementRules | null;
  /** Format des matchs generes par defaut (bo1, bo3, …). */
  match_format?: string | null;
};

/**
 * Bracket / Single Elimination / Double Elimination.
 * Pas de champs specifiques recenses pour l'instant.
 */
export type BracketSettings = CommonStageSettings;

/**
 * Phase Swiss : nombre de rondes total + seuils d'elimination.
 */
export type SwissSettings = CommonStageSettings & {
  total_rounds?: number | null;
  win_threshold?: number | null;
  loss_threshold?: number | null;
};

/**
 * Phase de groupes : repartition des equipes par groupe + nombre de tours,
 * aller-retour ou simple, etc.
 */
export type GroupSettings = CommonStageSettings & {
  /** group_key → tableau d'IDs d'equipe */
  group_assignments?: Record<string, string[]> | null;
  rounds?: number | null;
  home_away?: boolean | null;
  /**
   * Ordre de departage du classement. Absent = defaut (confrontation directe,
   * puis difference de score, puis victoires, puis seed).
   */
  standings_tiebreakers?: import('@/utils/stages/tiebreakers').TiebreakerKey[] | null;
};

/**
 * Round-robin : meme structure qu'un groupe (un seul "groupe" en general).
 */
export type RoundRobinSettings = GroupSettings;

/**
 * Type "loose" stocke dans `Stage.settings`. Tous les champs sont optionnels :
 * c'est l'acces idiomatique attendu (`settings?.total_rounds`).
 *
 * Pour un acces strict, narrow via `stage.stage_type` puis cast vers la
 * variante concrete (e.g. `settings as SwissSettings`).
 */
export type StageSettings = BracketSettings &
  Partial<SwissSettings> &
  Partial<GroupSettings>;
