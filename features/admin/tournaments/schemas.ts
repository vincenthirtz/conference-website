// features/admin/tournaments/schemas.ts — entrées et colonnes des routes staff
// d'un tournoi (`/api/admin/tournament/[id]/**`, `/api/admin/tournaments/**`).
//
// Les identifiants de chemin gardent le message d'erreur de leur route
// d'origine (trois libellés coexistaient). Les routes dont l'erreur portait un
// `code` métier (`INVALID_TOURNAMENT_ID`) déclarent un `looseQuery` : le
// service valide et rend le code d'origine.
//
// Les corps sont des `looseBody` : champs NOMMÉS pour la spec, validés par le
// service dans l'ordre et avec les messages d'origine (les 404 « tournoi
// introuvable » passaient souvent AVANT la validation du corps). Les corps qui
// avaient déjà un schéma zod le gardent ici, appliqué par le service.
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
 * Ligne `tournaments` COMPLÈTE : ce que rendaient la création
 * (`insert().select('*')`) et le clonage. Colonne ajoutée = à ajouter ici.
 */
export const TOURNAMENT_ROW_COLUMNS =
  'id, tenant_id, name, short_name, slug, game, status, start_date, end_date, timezone, format, format_type, format_details, max_teams, min_players, max_players, solo_mode, pooled_teams, roster_locked_at, roster_unlocked_until, visibility, is_featured, logo_url, banner_url, rules_url, default_stream_url, description_info, hero_subtitle, schedule_details, schedule_rules, registration_fields, checkin_grace_minutes, overlay_day_date, overlay_day_set_at, j1_reminder_sent_at, created_at, updated_at' as const;

/** Fiche staff d'un tournoi (GET / PATCH /api/admin/tournament/[id]). */
export const TOURNAMENT_DETAIL_COLUMNS =
  'id, name, slug, game, status, start_date, end_date, timezone, format, format_type, max_teams, min_players, max_players, solo_mode, pooled_teams, roster_locked_at, visibility, is_featured, logo_url, banner_url, rules_url, default_stream_url, description_info, hero_subtitle, schedule_details, schedule_rules, format_details, registration_fields, created_at, updated_at' as const;

/** En-tête d'un tournoi lu par les routes qui en vérifient l'existence. */
export const TOURNAMENT_LOOKUP_COLUMNS =
  'id, name, slug, game, status, start_date, end_date, timezone, max_teams, min_players, pooled_teams, roster_locked_at, roster_unlocked_until, updated_at' as const;

/** Liste staff des tournois (GET /api/admin/tournaments). */
export const TOURNAMENT_LIST_COLUMNS =
  'id, name, slug, game, status, start_date, end_date, max_teams, created_at, updated_at' as const;

/** Ligne `tournament_stages` complète (liste, création, gabarit, clone). */
export const STAGE_ROW_COLUMNS =
  'id, tenant_id, tournament_id, name, slug, stage_type, order_index, is_active, is_public, visible, start_date, end_date, settings, bracket_format, default_match_format, swiss_rounds, tiebreaker_policy, deleted_at, created_at, updated_at' as const;

/** Ligne `discord_webhooks` complète (écran de configuration). */
export const DISCORD_WEBHOOK_COLUMNS =
  'id, tenant_id, tournament_id, channel_type, webhook_url, role_mention, is_active, last_post_at, last_post_status, created_at, updated_at' as const;

/** Cagnotte lue par l'écran (GET …/prize-pool). */
export const PRIZE_POOL_VIEW_COLUMNS =
  'id, tournament_id, title, currency, goal_amount_cents, base_amount_cents, raised_amount_cents, is_open, created_at, updated_at' as const;

/** Ligne `tournament_prize_pools` complète (création / mise à jour). */
export const PRIZE_POOL_ROW_COLUMNS =
  'id, tenant_id, tournament_id, title, currency, goal_amount_cents, base_amount_cents, raised_amount_cents, is_open, created_at, updated_at' as const;

export const PRIZE_POOL_CONTRIBUTION_COLUMNS =
  'id, helloasso_payment_id, checkout_intent_id, amount_cents, contributor_name, is_anonymous, message, created_at' as const;

/** Ligne `matches` complète (création en lot, POST …/matches). */
export const TOURNAMENT_MATCH_ROW_COLUMNS =
  'id, tenant_id, tournament_id, stage_id, scrim_id, status, is_bye, best_of, match_format, round_name, round_number, group_key, bracket_side, bracket_slot, team1_id, team2_id, team1_score, team2_score, winner_team_id, forfeit_team_id, forfeit_processed_at, no_show_reason, scheduled_at, started_at, completed_at, stream_url, replay_url, lobby_code, notes, next_match_win_id, next_match_win_slot, next_match_lose_id, next_match_lose_slot, parent_match_win_id, parent_match_lose_id, veto_locked_at, dispute_reason, dispute_opened_at, dispute_opened_by, dispute_resolution, dispute_resolved_at, dispute_resolved_by, escalation_pinged_at, discord_thread_id, discord_match_channel_id, discord_dispute_thread_id, discord_scheduled_event_id, checkin_email_sent_at, team1_checked_in_at, team2_checked_in_at, team1_checkin_token, team2_checkin_token, team1_captain_dm_30_sent_at, team2_captain_dm_30_sent_at, team1_lineup_dm_sent_at, team2_lineup_dm_sent_at, team1_lineup_reminder_sent_at, team2_lineup_reminder_sent_at, reminder_15_sent_at, reminder_30_sent_at, deleted_at, created_at, updated_at' as const;

/** Liste des matchs d'un tournoi (GET …/matches), hors embeds optionnels. */
export const TOURNAMENT_MATCH_LIST_COLUMNS =
  'id, tournament_id, stage_id, status, is_bye, match_format, round_name, round_number, bracket_side, group_key, team1_id, team2_id, team1_score, team2_score, winner_team_id, scheduled_at, completed_at, stream_url, lobby_code, notes, next_match_win_id, next_match_win_slot, next_match_lose_id, next_match_lose_slot, created_at, updated_at' as const;

/** Ligne `games` complète (embed `games` de la liste des matchs). */
export const GAME_ROW_COLUMNS =
  'id, tenant_id, match_id, map_name, map_order, team1_score, team2_score, winner_team_id, duration_minutes, is_tiebreaker, went_overtime, picked_by_team_id, hero_bans, created_at, updated_at' as const;

/** Inscription d'une équipe (GET / PATCH …/teams/[teamId]). */
export const TOURNAMENT_TEAM_ENTRY_COLUMNS = `
      id,
      tournament_id,
      team_id,
      seed,
      status,
      created_at,
      team:teams (
        id,
        name,
        logo_url,
        is_active
      )
    ` as const;

/* ---------------------------------------------------------------------------
 * Paramètres de chemin et de requête
 * ------------------------------------------------------------------------ */

const optional = z.unknown().optional();

/** `[id]` UUID, message « Invalid tournament ID » (majuscules). */
export const TournamentIdQuery = z.looseObject({
  id: uuidPathParam('Invalid tournament ID'),
});

/** `[id]` UUID, message « Invalid tournament id » (minuscules). */
export const TournamentIdLowerQuery = z.looseObject({
  id: uuidPathParam('Invalid tournament id'),
});

/** GET / PATCH / PUT /api/admin/tournament/[id]. */
export const TournamentDetailQuery = z.looseObject({
  id: uuidPathParam('Missing or invalid tournament id'),
});

/** Dashboard : UUID, message historique de la route. */
export const DashboardQuery = z.looseObject({
  id: uuidPathParam('Invalid tournament id'),
});

/** Équipes inscrites : UUID, message historique de la route. */
export const TournamentTeamsQuery = z.looseObject({
  id: uuidPathParam('Invalid tournament ID'),
});

/** `[id]/teams/[teamId]` : `teamId` est l'id de l'INSCRIPTION. */
export const TournamentTeamEntryQuery = z.looseObject({
  id: uuidPathParam('Invalid tournament or team ID'),
  teamId: uuidPathParam('Invalid tournament or team ID'),
});

/** Routes dont l'id invalide rendait `code: 'INVALID_TOURNAMENT_ID'`. */
export const CodedTournamentIdQuery = looseQuery(['id']);

/** Diagnostic de planning : id codé + réglages de lecture. */
export const ScheduleDiagnosticsQuery = looseQuery([
  'id',
  'rest',
  'concurrent',
  'tz',
]);

/** Historique staff d'un tournoi. */
export const TournamentHistoryQuery = z.looseObject({
  id: uuidPathParam('Invalid tournament id'),
  entityType: optional,
  action: optional,
  limit: optional,
});

/** Export des résultats. */
export const ExportResultsQuery = z.looseObject({
  id: uuidPathParam('Invalid tournament ID'),
  format: optional,
});

/** Webhooks Discord : `channelType` en query sur DELETE. */
export const DiscordWebhooksQuery = z.looseObject({
  id: uuidPathParam('Invalid tournament ID'),
  channelType: optional,
});

/** Liste des matchs d'un tournoi : filtres normalisés par le service. */
export const TournamentMatchesQuery = z.looseObject({
  id: uuidPathParam('Invalid tournament id'),
  stageId: optional,
  status: optional,
  bracketSide: optional,
  groupKey: optional,
  roundNumber: optional,
  result: optional,
  dateFrom: optional,
  dateTo: optional,
  search: optional,
  includeTeams: optional,
  includeGames: optional,
  includeStages: optional,
  includeTotal: optional,
  orderBy: optional,
  orderDir: optional,
  limit: optional,
  offset: optional,
});

/** Liste staff des tournois. */
export const TournamentListQuery = looseQuery([
  'status',
  'search',
  'orderBy',
  'orderDir',
  'includeTotal',
  'dateFrom',
  'dateTo',
  'limit',
  'offset',
]);

/* ---------------------------------------------------------------------------
 * Corps (nommés pour la spec, validés par le service)
 * ------------------------------------------------------------------------ */

export const TournamentCreateBody = looseBody([
  'name',
  'slug',
  'game',
  'status',
  'start_date',
  'end_date',
  'max_teams',
  'min_players',
  'max_players',
  'solo_mode',
  'format_type',
  'is_public',
  'is_featured',
  'logo_url',
  'banner_url',
]);

/** PATCH / PUT d'un tournoi : champs modifiables. */
export const TOURNAMENT_PATCH_FIELDS = [
  'status',
  'name',
  'slug',
  'game',
  'start_date',
  'end_date',
  'roster_locked_at',
  'timezone',
  'format',
  'format_type',
  'max_teams',
  'min_players',
  'max_players',
  'solo_mode',
  'pooled_teams',
  'is_public',
  'is_featured',
  'logo_url',
  'banner_url',
  'rules_url',
  'default_stream_url',
  'description_info',
  'hero_subtitle',
  'schedule_details',
  'schedule_rules',
  'format_details',
  'registration_fields',
] as const;
// `expected_updated_at` : verrou optimiste (features/admin/_shared/optimisticLock).
export const TournamentPatchBody = looseBody([
  ...TOURNAMENT_PATCH_FIELDS,
  'expected_updated_at',
]);

export const ApplyTemplateBody = looseBody(['templateId', 'append']);
export const CloneTournamentBody = looseBody(['name', 'slug']);
export const OverlayDayBody = looseBody(['date']);
export const RosterUnlockBody = looseBody(['minutes']);
export const CheckinSettingsBody = looseBody(['checkinGraceMinutes']);
/** Playlist YouTube « Reviews » : URL collée ou ID ; vide/null = retrait. */
export const ReviewsPlaylistBody = looseBody(['playlist']);
export const DiscordTestBody = looseBody(['channelType']);
export const DiscordWebhookBody = looseBody([
  'channelType',
  'webhookUrl',
  'roleMention',
  'isActive',
]);
export const StageCreateBody = looseBody([
  'name',
  'slug',
  'stage_type',
  'order_index',
  'is_active',
  'is_public',
  'start_date',
  'end_date',
  'settings',
]);
export const StageReorderBody = looseBody(['stages']);
export const TournamentTeamAddBody = looseBody(['team_id', 'seed', 'status']);
export const TournamentTeamPatchBody = looseBody(['seed', 'status']);
export const TournamentMatchesCreateBody = looseBody(['matches']);
export const BracketBody = looseBody([
  'action',
  'size',
  'bestOf',
  'startDate',
  'intervalMinutes',
  'stageId',
  'grandFinalReset',
  'matches',
]);
export const BulkMatchesBody = looseBody([
  'mode',
  'stageId',
  'roundNumber',
  'offsetMinutes',
  'matchIds',
  'targetStageId',
]);
export const AutoScheduleBody = looseBody([
  'windows',
  'startDay',
  'daysCount',
  'startTime',
  'endTime',
  'estimatedDurationsMinutes',
  'resourceGapMinutes',
  'teamRestMinutes',
  'defaultResourceId',
  'acceptConflicts',
  'dryRun',
  'ignoreTeamConstraints',
]);
export const ScheduleMoveLooseBody = looseBody([
  'moves',
  'apply',
  'force',
  'rest',
  'concurrent',
]);
export const PoolLooseBody = looseBody([
  'action',
  'entryIds',
  'teamId',
  'teamName',
  'entryId',
]);
export const PrizePoolLooseBody = looseBody([
  'title',
  'goal_amount_cents',
  'base_amount_cents',
  'is_open',
]);
export const NotifyCaptainsBody = looseBody(['tournamentId']);

/* ---------------------------------------------------------------------------
 * Schémas appliqués par le service (erreur historique `INVALID_BODY`)
 * ------------------------------------------------------------------------ */

/** Huit mouvements : au-delà, ce n'est plus un geste, c'est un auto-scheduler. */
export const MAX_SCHEDULE_MOVES = 8;

export const ScheduleMoveSchema = z.object({
  moves: z
    .array(
      z.object({
        matchId: z.string().uuid(),
        scheduledAt: z.string().datetime({ offset: true }).nullable(),
      })
    )
    .min(1)
    .max(MAX_SCHEDULE_MOVES),
  apply: z.boolean().optional(),
  force: z.boolean().optional(),
  rest: z.number().int().min(0).max(240).optional(),
  concurrent: z.number().int().min(1).max(32).optional(),
});

/** Taille d'une équipe regroupée (miroir de `POOL_TEAM_SIZE`, utils/tournaments/pool). */
export function poolPostSchema(teamSize: number) {
  return z.discriminatedUnion('action', [
    z.object({
      action: z.literal('place'),
      entryIds: z.array(z.string().uuid()).min(1).max(teamSize),
      teamId: z.string().uuid(),
    }),
    z.object({
      action: z.literal('place-new'),
      entryIds: z.array(z.string().uuid()).min(1).max(teamSize),
      teamName: z.string().trim().min(2).max(60),
    }),
    z.object({
      action: z.literal('unplace'),
      entryId: z.string().uuid(),
    }),
  ]);
}

export const PrizePoolUpsertSchema = z.object({
  title: z.string().trim().max(200).nullable().optional(),
  goal_amount_cents: z.number().int().positive().nullable().optional(),
  base_amount_cents: z.number().int().min(0).optional(),
  is_open: z.boolean().optional(),
});

/** Types de salon Discord configurables pour un tournoi. */
export const DISCORD_CHANNEL_TYPES = [
  'match_announcements',
  'match_results',
  'bracket_updates',
  'veto_live',
  'checkin_reminders',
  'support_tickets',
] as const;
export type DiscordChannelType = (typeof DISCORD_CHANNEL_TYPES)[number];

/* ------------------- Quick bracket, modèles personnalisés ------------------- */

/** POST /api/admin/quick-bracket — validé par le service (400 « Champ invalide »). */
export const QuickBracketDoc = looseBody([
  'name',
  'format',
  'participants',
  'bestOf',
]);

/** POST /api/admin/tournament-templates — nom, description, phases. */
export const TournamentTemplateCreateDoc = looseBody([
  'name',
  'description',
  'stages',
]);

/** DELETE /api/admin/tournament-templates — `templateId` dans le corps. */
export const TournamentTemplateDeleteDoc = looseBody(['templateId']);
