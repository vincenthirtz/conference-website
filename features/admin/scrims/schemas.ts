// features/admin/scrims/schemas.ts — entrées et colonnes des routes staff des
// scrims et des grilles de dispos (`/api/admin/scrims/**`,
// `/api/admin/scrim-plannings/**`).
//
// Les corps « historiques » (création / PATCH d'un scrim, lot de matchs) sont
// déclarés avec `looseBody` : champs NOMMÉS pour la spec, validés champ par
// champ et dans un ordre précis par le service, avec leurs messages
// d'origine. Les corps qui avaient déjà un schéma zod le gardent ici.
//
// zod seul, imports RELATIFS : ces schémas sont référencés par la spec
// OpenAPI (lib/apiContracts/admin/features.ts), assemblée par Node sans `@/`.

import * as z from 'zod';
import {
  looseBody,
  looseQuery,
  uuidPathParam,
} from '../../../utils/admin/pathParams';

/* ---------------------------------------------------------------------------
 * Colonnes (fin des `select('*')`, lot L5)
 * ------------------------------------------------------------------------ */

/**
 * Ligne `scrims` COMPLÈTE : c'est ce que les routes renvoyaient par
 * `select('*')` (`{ scrim }` après création / modification / validation) et
 * ce que reçoit `emitScrimEvent`. Colonne ajoutée à la table = à ajouter ici.
 */
export const SCRIM_ROW_COLUMNS =
  'id, tenant_id, name, slug, game, status, team1_id, team2_id, team1_score, team2_score, winner_team_id, dispute_reason, completed_at, ranked, scheduled_date, timezone, duration_minutes, is_public, logo_url, banner_url, description, stream_url, settings, source_demande_id, source_planning_id, discord_thread_id, deleted_at, created_at, updated_at' as const;

/** Liste staff des scrims (GET /api/admin/scrims). */
export const SCRIM_LIST_COLUMNS = `
        id, name, slug, game, status,
        team1_id, team2_id,
        scheduled_date, timezone,
        is_public, logo_url, banner_url, description, stream_url,
        source_demande_id, settings, created_at, updated_at,
        team1_score, team2_score, winner_team_id, completed_at, ranked,
        team1:teams!scrims_team1_id_fkey(id, name, short_name, logo_url),
        team2:teams!scrims_team2_id_fkey(id, name, short_name, logo_url)
      ` as const;

/** Fiche staff d'un scrim (GET /api/admin/scrims/[scrimId]). */
export const SCRIM_DETAIL_COLUMNS = `
      id, name, slug, game, status,
      team1_id, team2_id,
      team1_score, team2_score, winner_team_id, dispute_reason, completed_at,
      ranked,
      scheduled_date, timezone,
      is_public, logo_url, banner_url, description, stream_url,
      source_demande_id, created_at, updated_at,
      team1:teams!scrims_team1_id_fkey(id, name, short_name, logo_url),
      team2:teams!scrims_team2_id_fkey(id, name, short_name, logo_url)
    ` as const;

/** État lu avant la saisie d'un résultat (POST …/result). */
export const SCRIM_RESULT_BEFORE_COLUMNS =
  'id, name, slug, status, ranked, team1_id, team2_id, team1_score, team2_score, winner_team_id, dispute_reason' as const;

/** Ligne `matches` COMPLÈTE : ce que renvoyait la création d'un lot (`select('*')`). */
export const MATCH_ROW_COLUMNS =
  'id, tenant_id, tournament_id, stage_id, scrim_id, status, is_bye, best_of, match_format, round_name, round_number, group_key, bracket_side, bracket_slot, team1_id, team2_id, team1_score, team2_score, winner_team_id, forfeit_team_id, forfeit_processed_at, no_show_reason, scheduled_at, started_at, completed_at, stream_url, replay_url, lobby_code, notes, next_match_win_id, next_match_win_slot, next_match_lose_id, next_match_lose_slot, parent_match_win_id, parent_match_lose_id, veto_locked_at, dispute_reason, dispute_opened_at, dispute_opened_by, dispute_resolution, dispute_resolved_at, dispute_resolved_by, escalation_pinged_at, discord_thread_id, discord_match_channel_id, discord_dispute_thread_id, discord_scheduled_event_id, checkin_email_sent_at, team1_checked_in_at, team2_checked_in_at, team1_checkin_token, team2_checkin_token, team1_captain_dm_30_sent_at, team2_captain_dm_30_sent_at, team1_lineup_dm_sent_at, team2_lineup_dm_sent_at, team1_lineup_reminder_sent_at, team2_lineup_reminder_sent_at, reminder_15_sent_at, reminder_30_sent_at, deleted_at, created_at, updated_at' as const;

/** Matchs d'un scrim (GET …/matches). */
export const SCRIM_MATCH_LIST_COLUMNS = `
      id, scrim_id, status, is_bye, best_of, match_format,
      team1_id, team2_id, team1_score, team2_score, winner_team_id, forfeit_team_id,
      scheduled_at, started_at, completed_at,
      stream_url, replay_url, lobby_code, notes,
      created_at, updated_at,
      team1:teams!matches_team1_fk(id, name, short_name, logo_url),
      team2:teams!matches_team2_fk(id, name, short_name, logo_url)
    ` as const;

/** Assignations de casters d'un scrim, caster joint. */
export const SCRIM_CAST_ASSIGNMENT_COLUMNS =
  `id, scrim_id, cast_member_id, briefing_at, briefing_reminder_sent_at,
         acked_at, created_at, updated_at,
         cast_member:cast_member_id (id, name, auth_user_id, image_url)` as const;

/** Ligne `demandes` utile au transfert d'une demande de scrim externe. */
export const FORWARD_DEMANDE_COLUMNS =
  'id, team_id, source, comment, payload, staff_note' as const;

/** Ligne `scrim_plannings` COMPLÈTE (ex-`select('*')`). */
export const PLANNING_ROW_COLUMNS =
  'id, tenant_id, created_by, team1_id, team2_id, title, game, status, horizon_start, horizon_days, slot_minutes, day_start_min, day_end_min, timezone, scrim_id, validated_slot, is_public, staff_required, source_demande_id, reminder_pinged_at, deleted_at, created_at, updated_at' as const;

/** Grille + noms des deux équipes (liste et fiche staff). */
export const PLANNING_WITH_TEAMS_COLUMNS = `${PLANNING_ROW_COLUMNS},
       team1:teams!scrim_plannings_team1_id_fkey(id, name),
       team2:teams!scrim_plannings_team2_id_fkey(id, name)` as const;

/** Ligne `scrim_planning_availabilities` COMPLÈTE (ex-`select('*')`). */
export const AVAILABILITY_ROW_COLUMNS =
  'id, tenant_id, planning_id, party, user_id, display_name, slots, created_at, updated_at' as const;

/* ---------------------------------------------------------------------------
 * Constantes métier
 * ------------------------------------------------------------------------ */

export const SCRIM_STATUSES = [
  'draft',
  'scheduled',
  'running',
  'completed',
  'cancelled',
] as const;
export type ScrimStatus = (typeof SCRIM_STATUSES)[number];

export const SCRIM_PATCHABLE_FIELDS = [
  'name',
  'slug',
  'game',
  'status',
  'team1_id',
  'team2_id',
  'scheduled_date',
  'timezone',
  'is_public',
  'logo_url',
  'banner_url',
  'description',
  'stream_url',
  'settings',
  'duration_minutes',
] as const;

export const SCRIM_MATCH_STATUSES = [
  'pending',
  'ongoing',
  'finished',
  'cancelled',
  'walkover',
  'disputed',
  'postponed',
] as const;

export const PLANNING_STATUSES = [
  'open',
  'validated',
  'cancelled',
  'closed',
] as const;

// PATCH n'autorise que 'cancelled' | 'closed' comme transition de statut : le
// (re)passage à 'open' ou 'validated' n'est pas un simple champ (validated
// passe par la route /validate qui matérialise un scrim).
export const PLANNING_PATCHABLE_STATUSES = ['cancelled', 'closed'] as const;

export const PLANNING_PATCHABLE_FIELDS = [
  'title',
  'game',
  'status',
  'horizon_start',
  'horizon_days',
  'slot_minutes',
  'day_start_min',
  'day_end_min',
  'timezone',
  'is_public',
  'staff_required',
  // Permet de ré-armer la relance en prolongeant l'horizon (PATCH le remet à null).
  'reminder_pinged_at',
] as const;

/* ---------------------------------------------------------------------------
 * Paramètres de chemin
 * ------------------------------------------------------------------------ */

/** `[scrimId]` (fiche, matchs, casters). */
export const ScrimIdQuery = z.looseObject({
  scrimId: uuidPathParam('scrimId invalide'),
});

/** POST …/result : UUID au sens de zod, comme le schéma d'origine. */
export const ScrimIdUuidQuery = z.looseObject({
  scrimId: z
    .string({ error: 'scrimId invalide' })
    .uuid({ error: 'scrimId invalide' }),
});

export const PlanningIdQuery = z.looseObject({
  planningId: uuidPathParam('planningId invalide'),
});

/* Filtres des listes : nommés pour la spec, normalisés par le service. */

export const ScrimListQuery = looseQuery([
  'status',
  'teamId',
  'search',
  'dateFrom',
  'dateTo',
  'orderBy',
  'orderDir',
  'includeTotal',
  'includeDeleted',
  'limit',
  'offset',
]);

export const ScrimCalendarQuery = looseQuery(['from', 'to']);

export const PlanningListQuery = looseQuery([
  'status',
  'teamId',
  'search',
  'limit',
  'offset',
]);

/* ---------------------------------------------------------------------------
 * Corps
 * ------------------------------------------------------------------------ */

export const ScrimCreateBody = looseBody([
  'name',
  'slug',
  'game',
  'status',
  'team1_id',
  'team2_id',
  'team1_name',
  'team2_name',
  'scheduled_date',
  'timezone',
  'is_public',
  'description',
  'stream_url',
]);

export const ScrimPatchBody = looseBody([
  ...SCRIM_PATCHABLE_FIELDS,
  'team1_name',
  'team2_name',
]);

/** Corps déclaré de POST …/result ; validé par le service (`ScrimResultBody`). */
export const ScrimResultLooseBody = looseBody([
  'team1_score',
  'team2_score',
  'final',
]);

/** Un match (`match`) ou un lot (`matches`, ≤ 50) ; rien = un match vide. */
export const ScrimMatchesBody = looseBody(['match', 'matches']);

export const ScrimCastAssignmentBody = looseBody([
  'castMemberId',
  'briefingAt',
]);

export const ScrimForwardBody = looseBody(['demandeId', 'targetTeamId']);

/** Corps déclaré de l'ouverture d'une grille ; validé par le service. */
export const PlanningCreateLooseBody = looseBody([
  'team1_id',
  'team2_id',
  'title',
  'game',
  'horizon_start',
  'horizon_days',
  'slot_minutes',
  'day_start_min',
  'day_end_min',
  'timezone',
  'staff_required',
  'source_demande_id',
  'scrim_id',
]);

export const PlanningPatchBody = looseBody(PLANNING_PATCHABLE_FIELDS);

export const PlanningAvailabilityBody = looseBody(['slots']);

/** Corps déclaré de l'aperçu des conflits ; validé par le service. */
export const PlanningConflictsLooseBody = looseBody(['slots']);

/**
 * POST …/result. Lu par le SERVICE (pas par `body:`) : un échec rend un
 * message unique et le code historique `INVALID_BODY`.
 */
export const ScrimResultBody = z.object({
  team1_score: z.number().int().min(0).max(99),
  team2_score: z.number().int().min(0).max(99),
  /** `false` = score en cours, le scrim n'est pas clos. Défaut : résultat final. */
  final: z.boolean().optional(),
});

/**
 * Lu par le service : l'échec rend `{ error, field }` (premier champ fautif),
 * forme historique de la route.
 */
export const PlanningCreateBody = z
  .object({
    team1_id: z.string().uuid('team1_id invalide'),
    team2_id: z.string().uuid('team2_id invalide'),
    title: z.string().trim().max(200).optional().nullable(),
    game: z.string().trim().max(80).optional().nullable(),
    horizon_start: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'horizon_start doit être YYYY-MM-DD')
      .optional(),
    horizon_days: z.number().int().min(1).max(42).optional(),
    slot_minutes: z.union([z.literal(30), z.literal(60)]).optional(),
    day_start_min: z.number().int().min(0).max(1440).optional(),
    day_end_min: z.number().int().min(0).max(1440).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    staff_required: z.boolean().optional(),
    source_demande_id: z.string().uuid().optional().nullable(),
    // Grille ouverte POUR un scrim existant (typiquement un scrim sans date).
    // La validation replanifiera ce scrim au lieu d'en créer un second.
    scrim_id: z.string().uuid().optional().nullable(),
  })
  .refine((v) => v.team1_id !== v.team2_id, {
    message: 'team1_id et team2_id doivent être distincts',
    path: ['team2_id'],
  })
  .refine(
    (v) =>
      v.day_start_min === undefined ||
      v.day_end_min === undefined ||
      v.day_end_min > v.day_start_min,
    {
      message: 'day_end_min doit être supérieur à day_start_min',
      path: ['day_end_min'],
    }
  );
export type PlanningCreateInput = z.output<typeof PlanningCreateBody>;

// Borne le nombre de créneaux à prévisualiser (2 requêtes DB / créneau).
export const MAX_CONFLICT_PREVIEW_SLOTS = 16;

/** Lu par le service : tout échec rend « Requête invalide. », comme avant. */
export const PlanningConflictsBody = z.object({
  slots: z.array(z.string().trim().min(1)).max(MAX_CONFLICT_PREVIEW_SLOTS),
});

export const PlanningValidateBody = z.object({
  slot: z.string().trim().min(1, 'slot requis'),
  // Passe outre un conflit de créneau détecté (double-booking) — override admin.
  force: z.boolean().optional(),
});
