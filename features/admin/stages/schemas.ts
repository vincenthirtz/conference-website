// features/admin/stages/schemas.ts — entrées et colonnes des routes staff des
// phases de tournoi (`/api/admin/stages/[stageId]/**`) : fiche, clonage,
// historique, équipes, poules, seeding (auto / manuel / rating), avancement,
// suisse, lobbies FFA, snapshots, overrides de départage, opérations en masse.
//
// Les corps ne passent PAS par la validation de `defineAdminRoute` : chaque
// route répondait ses propres messages (`'Missing teamId'`, `'assignments
// doit être un tableau non vide.'`…), dans un ordre précis (le 404 de la phase
// passe parfois AVANT la validation). La route déclare donc un `looseBody` qui
// NOMME les champs pour la spec ; le service applique les contrôles d'origine.
// Seule exception : `rating-seed`, qui validait déjà par zod (même message).
//
// zod seul, imports RELATIFS : ces schémas sont référencés par la spec
// OpenAPI (lib/apiContracts/admin/features.ts), assemblée par Node sans `@/`.

import { z } from 'zod';
import { looseBody, uuidPathParam } from '../../../utils/admin/pathParams';

/* ---------------------------------------------------------------------------
 * Colonnes (listes explicites, au lieu des `select('*')` d'origine)
 * ------------------------------------------------------------------------ */

/** Ligne complète d'une phase (fiche, mise à jour, désactivation, clone). */
export const STAGE_COLUMNS =
  'id, tenant_id, tournament_id, name, slug, stage_type, order_index, is_active, is_public, start_date, end_date, settings, created_at, updated_at, bracket_format, default_match_format, deleted_at, swiss_rounds, tiebreaker_policy, visible' as const;

/** Ligne complète de `stage_teams` (ajout, mise à jour d'un seed). */
export const STAGE_TEAM_COLUMNS =
  'tenant_id, stage_id, team_id, seed, is_substitute, notes, created_at' as const;

/** Ligne complète d'un override de départage (réponse du POST). */
export const TIEBREAKER_OVERRIDE_COLUMNS =
  'id, tenant_id, stage_id, winner_team_id, loser_team_id, reason, set_by_staff_id, set_at' as const;

/** Colonnes d'un match source RECOPIÉES par le clonage (ex-`select('*')`). */
export const CLONE_SOURCE_MATCH_COLUMNS =
  'id, is_bye, match_format, round_name, round_number, bracket_side, group_key, best_of, team1_id, team2_id, scheduled_at, notes, next_match_win_id, next_match_win_slot, next_match_lose_id, next_match_lose_slot' as const;

/** Lobby FFA (liste et création). */
export const LOBBY_COLUMNS =
  'id, tenant_id, tournament_id, stage_id, name, round_number, best_of, status, created_at' as const;

/* ---------------------------------------------------------------------------
 * Paramètres de chemin et de requête
 * ------------------------------------------------------------------------ */

const stageId = uuidPathParam('Invalid stageId');
const open = z.unknown().optional();

/** Toutes les routes qui ne lisent que `[stageId]`. */
export const StageIdQuery = z.looseObject({ stageId });

/** DELETE /stages/[stageId] : `?hard=1|true` = suppression définitive. */
export const StageDeleteQuery = z.looseObject({ stageId, hard: open });

/** GET …/history : filtres facultatifs, lus par le service. */
export const StageHistoryQuery = z.looseObject({
  stageId,
  entityType: open,
  action: open,
  limit: open,
});

/** GET …/standings : `?export=csv|json` = téléchargement. */
export const StageStandingsQuery = z.looseObject({ stageId, export: open });

/** GET …/seeding-preview. */
export const SeedingPreviewQuery = z.looseObject({
  stageId,
  sourceStageId: open,
  pattern: open,
});

/** GET …/rating-seeding-preview. */
export const RatingSeedingPreviewQuery = z.looseObject({
  stageId,
  method: open,
  pattern: open,
  sosWeight: open,
});

/** GET …/snapshots : `?limit=` (1–200, défaut 50). */
export const SnapshotListQuery = z.looseObject({ stageId, limit: open });

/* ---------------------------------------------------------------------------
 * Corps (nommés pour la spec, contrôlés par le service)
 * ------------------------------------------------------------------------ */

/** PUT / PATCH /stages/[stageId] : champs modifiables d'une phase. */
export const STAGE_UPDATABLE_FIELDS = [
  'tournament_id',
  'name',
  'slug',
  'stage_type',
  'order_index',
  'is_active',
  'is_public',
  'start_date',
  'end_date',
  'settings',
] as const;
export const StageUpdateBody = looseBody(STAGE_UPDATABLE_FIELDS);

export const StageCloneBody = looseBody([
  'includeMatches',
  'name',
  'targetTournamentId',
]);

export const StageAdvanceBody = looseBody([
  'auto',
  'targetStageId',
  'teamIds',
  'seedMode',
]);

export const StageAutoSeedBody = looseBody(['sourceStageId', 'seedingPattern']);

export const StageManualSeedBody = looseBody([
  'assignments',
  'replaceExisting',
]);

/** POST …/rating-seed : validé par zod dès l'origine (même 1er message). */
export const RatingSeedBody = z.object({
  method: z.enum(['rating', 'rating_sos']).optional(),
  pattern: z.enum(['standard', 'sequential']).optional(),
  sosWeight: z.number().finite().optional(),
});

export const StageAutoByesBody = looseBody([
  'roundNumber',
  'scoreForBye',
  'propagate',
]);

export const StageBatchScoresBody = looseBody(['scores']);

/** POST (undo) / PATCH (planning) / PUT (édition) / DELETE (annulation). */
export const StageBulkMatchesBody = looseBody([
  'action',
  'undoPayload',
  'schedules',
  'matchIds',
  'fields',
  'hard',
]);

export const StageGroupMatchesBody = looseBody([
  'dryRun',
  'rounds',
  'matchFormat',
]);

export const StageSwissRoundBody = looseBody([
  'roundNumber',
  'scoreConfig',
  'allowRematchesFallback',
  'dryRun',
  'acceptRematches',
]);

/** PUT …/groups (`assignments`) et POST …/groups (`numGroups`, `method`). */
export const StageGroupsBody = looseBody([
  'assignments',
  'numGroups',
  'method',
]);

export const StageLobbyCreateBody = looseBody(['name', 'round_number']);

/** POST (création manuelle, `reason`) et PATCH (restauration, `snapshotId`). */
export const StageSnapshotBody = looseBody(['reason', 'snapshotId']);

/** POST (`winnerTeamId`, `loserTeamId`, `reason`) et DELETE (`id`). */
export const TiebreakerOverrideBody = looseBody([
  'winnerTeamId',
  'loserTeamId',
  'reason',
  'id',
]);

/** POST (ajout), PATCH (seed unitaire / `seeds`), DELETE (`teamId(s)`). */
export const StageTeamsBody = looseBody(['teamId', 'seed', 'seeds', 'teamIds']);
