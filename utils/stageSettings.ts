// utils/stageSettings.ts
// Validation des settings JSON par type de stage.
// Chaque type de stage a un schéma Zod spécifique.

import { z } from 'zod';
import type { StageType } from '@/types/admin';

/* -----------------------------------------------------------
 * Schémas par type de stage
 * ---------------------------------------------------------*/

/** Bracket (single_elim / double_elim) */
const bracketSettingsSchema = z
  .object({
    bracket_size: z
      .number()
      .int()
      .refine((n) => [4, 8, 16, 32, 64].includes(n), {
        message: 'bracket_size must be 4, 8, 16, 32 or 64',
      })
      .optional(),
    bracket_type: z.enum(['single_elim', 'double_elim']).optional(),
    third_place_match: z.boolean().optional(),
    grand_final_reset: z.boolean().optional(),
    seeding_method: z.enum(['manual', 'random', 'standings']).optional(),
    tiebreaker_policy: z
      .enum(['manual', 'extra_round', 'map_diff', 'seed'])
      .optional(),
  })
  .passthrough();

/** Advancement rules (shared across stage types) */
// On accepte advance_top OU advance_per_group (au moins l'un des deux).
const advancementRulesSchema = z
  .object({
    advance_top: z.number().int().min(1).max(128).optional(),
    advance_per_group: z.number().int().min(1).max(32).optional(),
    target_stage_id: z.string().uuid(),
    seed_by: z.enum(['standings', 'manual', 'none']).optional(),
  })
  .refine(
    (v) => v.advance_top !== undefined || v.advance_per_group !== undefined,
    {
      message: 'advance_top or advance_per_group is required',
    }
  )
  .optional();

/** Swiss */
const swissSettingsSchema = z
  .object({
    total_rounds: z.number().int().min(1).max(20).optional(),
    win_threshold: z.number().int().min(1).max(20).optional(),
    loss_threshold: z.number().int().min(1).max(20).optional(),
    win_points: z.number().min(0).optional(),
    draw_points: z.number().min(0).optional(),
    loss_points: z.number().min(0).optional(),
    bye_points: z.number().min(0).optional(),
    allow_rematches: z.boolean().optional(),
    use_buchholz: z.boolean().optional(),
    use_median_buchholz: z.boolean().optional(),
    advancement_rules: advancementRulesSchema,
  })
  .passthrough();

/**
 * Ordre de departage du classement (lot 7 de docs/PLAN-plateforme-tournois.md).
 * Applique aux stages `round_robin` et `group`, dans l'ordre donne. `seed` est
 * ajoute d'office a la lecture s'il manque : sans dernier recours, deux equipes
 * parfaitement a egalite sortiraient dans l'ordre de la base.
 */
const standingsTiebreakersSchema = z
  .array(z.enum(['head_to_head', 'score_diff', 'wins', 'scored', 'seed']))
  .min(1)
  .max(5)
  .optional();

/** Round Robin */
const roundRobinSettingsSchema = z
  .object({
    rounds: z.number().int().min(1).max(10).optional(),
    win_points: z.number().min(0).optional(),
    draw_points: z.number().min(0).optional(),
    loss_points: z.number().min(0).optional(),
    home_away: z.boolean().optional(),
    standings_tiebreakers: standingsTiebreakersSchema,
    advancement_rules: advancementRulesSchema,
  })
  .passthrough();

/** Group Stage */
const groupSettingsSchema = z
  .object({
    num_groups: z.number().int().min(1).max(32).optional(),
    teams_per_group: z.number().int().min(2).max(16).optional(),
    advance_per_group: z.number().int().min(1).optional(),
    group_format: z.enum(['round_robin', 'swiss', 'single_elim']).optional(),
    win_points: z.number().min(0).optional(),
    draw_points: z.number().min(0).optional(),
    loss_points: z.number().min(0).optional(),
    standings_tiebreakers: standingsTiebreakersSchema,
    advancement_rules: advancementRulesSchema,
  })
  .passthrough();

/** Showmatch */
const showmatchSettingsSchema = z
  .object({
    best_of: z.number().int().min(1).max(15).optional(),
    description: z.string().max(1000).optional(),
  })
  .passthrough();

/** Default points table (mirrors the leagues default). */
const FFA_DEFAULT_POINTS_TABLE: Record<string, number> = {
  '1': 100,
  '2': 80,
  '3': 60,
  '4': 50,
  '5': 40,
  '6': 30,
  '7': 20,
  '8': 10,
};

/**
 * FFA / N-competitor stage.
 * Same points_table shape as the leagues feature (rank string → points).
 */
const ffaSettingsSchema = z
  .object({
    lobby_size: z.number().int().min(2).max(64).optional().default(8),
    points_table: z
      .record(z.string(), z.number())
      .optional()
      .default(FFA_DEFAULT_POINTS_TABLE),
    tiebreak: z
      .enum(['total_points', 'best_placement', 'most_firsts'])
      .optional()
      .default('best_placement'),
  })
  .passthrough();

/** Other / fallback — accept anything but limit depth */
const otherSettingsSchema = z.record(z.string(), z.unknown());

/* -----------------------------------------------------------
 * Map type → schéma
 * ---------------------------------------------------------*/

const schemasByType: Record<StageType, z.ZodTypeAny> = {
  bracket: bracketSettingsSchema,
  swiss: swissSettingsSchema,
  round_robin: roundRobinSettingsSchema,
  group: groupSettingsSchema,
  showmatch: showmatchSettingsSchema,
  ffa: ffaSettingsSchema,
  other: otherSettingsSchema,
};

/* -----------------------------------------------------------
 * Fonction de validation publique
 * ---------------------------------------------------------*/

export type StageSettingsValidationResult =
  | { valid: true; data: Record<string, unknown> }
  | { valid: false; error: string };

/**
 * Valide les settings JSON d'un stage en fonction de son type.
 *
 * - Si `settings` est null/undefined, la validation passe (champ optionnel).
 * - Si `settings` n'est pas un objet, la validation échoue.
 * - Le schéma utilise `.passthrough()` pour accepter les champs inconnus,
 *   tout en validant les champs connus.
 */
export function validateStageSettings(
  stageType: StageType | null | undefined,
  settings: unknown
): StageSettingsValidationResult {
  // Settings null/undefined → OK (optionnel)
  if (settings === null || settings === undefined) {
    return { valid: true, data: {} };
  }

  // Doit être un objet
  if (typeof settings !== 'object' || Array.isArray(settings)) {
    return { valid: false, error: 'settings must be a JSON object' };
  }

  const type = stageType ?? 'other';
  const schema = schemasByType[type] ?? otherSettingsSchema;

  const result = schema.safeParse(settings);

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const path = firstIssue.path.join('.');
    return {
      valid: false,
      error: `settings${path ? '.' + path : ''}: ${firstIssue.message}`,
    };
  }

  return { valid: true, data: result.data as Record<string, unknown> };
}
