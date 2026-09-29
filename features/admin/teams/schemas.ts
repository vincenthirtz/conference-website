// features/admin/teams/schemas.ts — entrées et colonnes des routes staff des
// équipes (`/api/admin/teams/**`).
//
// Les corps « historiques » sont déclarés avec `looseBody` : champs NOMMÉS
// pour la spec, validés champ par champ par le service, dans l'ordre et avec
// les messages (et `code`) d'origine. Idem pour les paramètres dont l'erreur
// portait un `code` métier (`INVALID_TEAM_ID`…) : `looseQuery`, validés par
// le service.
//
// zod seul, imports RELATIFS : ces schémas sont référencés par la spec
// OpenAPI (lib/apiContracts/admin/features.ts), assemblée par Node sans `@/`.

import { z } from 'zod';
import {
  looseBody,
  looseQuery,
  uuidPathParam,
} from '../../../utils/admin/pathParams';

/* ---------------------------------------------------------------------------
 * Colonnes (fin des `select('*')`, lot L5)
 * ------------------------------------------------------------------------ */

/**
 * Ligne `teams` COMPLÈTE : c'est ce que les routes renvoyaient par
 * `select('*')` (liste, fiche, avant/après du journal). Colonne ajoutée à la
 * table = à ajouter ici (database/schema-snapshot.json).
 */
export const TEAM_ROW_COLUMNS =
  'id, tenant_id, name, slug, short_name, logo_url, logo_credit_name, logo_credit_url, banner_url, banner_focal, banner_overlay, accent_color, secondary_color, country, description, achievements, sponsors, public_content, pinned_announcement, pinned_announcement_until, twitter, twitch, youtube, instagram, tiktok, discord, website, embed_provider, embed_id, discord_role_id, discord_channel_id, discord_voice_channel_id, preferred_locale, is_active, is_joinable, open_for_scrim, captain_id, skill_rating, tcg_image_path, deleted_at, created_at, updated_at' as const;

/** Ligne `stage_teams` complète (réponse du POST …/tournaments). */
export const STAGE_TEAM_ROW_COLUMNS =
  'tenant_id, stage_id, team_id, seed, is_substitute, notes, created_at' as const;

/** Entrée de journal liée à une équipe (GET …/history). */
export const TEAM_HISTORY_LOG_COLUMNS = `
        id,
        created_at,
        staff_id,
        action,
        entity_type,
        entity_id,
        tournament_id,
        payload,
        staff:staff!fk_staff_logs_staff(
          id,
          auth_user_id,
          role,
          display_name,
          avatar_url
        )
      ` as const;

/** Membre ciblé par une action roster en masse. */
export const ROSTER_BULK_MEMBER_COLUMNS =
  'id, team_id, user_id, role, battle_tag, is_substitute, created_at' as const;

/* ---------------------------------------------------------------------------
 * Paramètres
 * ------------------------------------------------------------------------ */

/** `[teamId]` : 400 « Invalid teamId » (fiche, historique, roster-bulk). */
export const TeamIdQuery = z.looseObject({
  teamId: uuidPathParam('Invalid teamId'),
});

/** GET /api/admin/teams/[teamId] : `?withMembers=1` joint le roster. */
export const TeamDetailQuery = z.looseObject({
  teamId: uuidPathParam('Invalid teamId'),
  withMembers: z.unknown().optional(),
});

/** DELETE /api/admin/teams/[teamId] : `?hard=1` supprime pour de bon. */
export const TeamDeleteQuery = z.looseObject({
  teamId: uuidPathParam('Invalid teamId'),
  hard: z.unknown().optional(),
});

/** GET …/history : filtres facultatifs. */
export const TeamHistoryQuery = z.looseObject({
  teamId: uuidPathParam('Invalid teamId'),
  entityType: z.unknown().optional(),
  action: z.unknown().optional(),
  limit: z.unknown().optional(),
});

/** …/tournaments : 400 « teamId required ». */
export const TeamTournamentsQuery = z.looseObject({
  teamId: uuidPathParam('teamId required'),
});

/** Liste staff (GET /api/admin/teams) : filtres lus par le service. */
export const TeamListQuery = looseQuery([
  'search',
  'isActive',
  'includeTotal',
  'includeDeleted',
  'tournamentId',
  'limit',
  'offset',
]);

/** …/roster-lock : `teamId` validé par le service (code `INVALID_TEAM_ID`). */
export const TeamRosterLockQuery = looseQuery(['teamId']);

/**
 * …/availability : `teamId` (code `INVALID_TEAM_ID`), `tournament_id` (GET,
 * `INVALID_TOURNAMENT_ID`) et `id` (PATCH / DELETE, `INVALID_ID`) validés par
 * le service.
 */
export const TeamAvailabilityQuery = looseQuery([
  'teamId',
  'tournament_id',
  'id',
]);

/* ---------------------------------------------------------------------------
 * Corps
 * ------------------------------------------------------------------------ */

/** Champs modifiables d'une équipe (PUT / PATCH …/[teamId]). */
export const TEAM_UPDATABLE_FIELDS = [
  'name',
  'slug',
  'short_name',
  'logo_url',
  'logo_credit_name',
  'logo_credit_url',
  'banner_url',
  'country',
  'description',
  'twitter',
  'discord',
  'discord_role_id',
  'preferred_locale',
  'website',
  'is_active',
  'captain_id',
  'skill_rating',
] as const;

export const TeamPatchBody = looseBody(TEAM_UPDATABLE_FIELDS);

/** POST /api/admin/teams/bulk. */
export const TeamBulkBody = looseBody(['action', 'teamIds', 'tournamentId']);

/** POST / DELETE …/roster-lock. */
export const TeamRosterLockBody = looseBody(['tournamentId', 'minutes']);

/** POST …/roster-bulk. */
export const TeamRosterBulkBody = looseBody([
  'operation',
  'memberIds',
  'items',
  'role',
  'isSubstitute',
]);

/**
 * POST / PATCH …/availability : validés par le service (discriminée par
 * `kind` à la création), qui rend le 400 historique `INVALID_BODY`.
 */
export const TeamAvailabilityBody = looseBody([
  'kind',
  'starts_on',
  'ends_on',
  'time_of_day',
  'weekdays',
  'tournament_id',
  'timezone',
  'note',
]);

/** POST / DELETE …/tournaments. */
export const TeamTournamentBody = looseBody(['tournamentId', 'stageId']);

/** POST /api/admin/teams/add-member. */
export const TeamAddMemberBody = looseBody([
  'teamId',
  'userId',
  'email',
  'role',
  'setCaptain',
  'battleTag',
  'isSubstitute',
  'mode',
  'reason',
]);

/** POST /api/admin/teams/import-csv. */
export const TeamImportCsvBody = looseBody(['csv', 'tournamentId']);

/** POST /api/admin/teams/import-platform. */
export const TeamImportPlatformBody = looseBody([
  'source',
  'sourceRef',
  'tournamentId',
]);
