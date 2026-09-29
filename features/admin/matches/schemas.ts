// features/admin/matches/schemas.ts — entrées et colonnes des routes staff
// d'un match (`/api/admin/matches/**`) : fiche, score, litige, veto, drafts,
// casters, MVP, feuille de match, relance check-in, historique, analytique.
//
// Les corps « historiques » sont déclarés avec `looseBody` : champs NOMMÉS
// pour la spec, validés champ par champ et dans l'ordre d'origine par le
// service, avec leurs messages d'origine (les écrans et les tests les lisent).
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
 * Ligne `matches` COMPLÈTE : ce que renvoyaient `select('*')` (PATCH méta,
 * litige) et ce que le journal `update_match` garde en `before` / `after`.
 * Même liste que le module scrims — une seule source.
 */
export { MATCH_ROW_COLUMNS } from '../scrims/schemas';

/** Ligne `games` complète (ex-embed `games:games(*)` de la fiche). */
export const GAME_ROW_COLUMNS =
  'id, tenant_id, match_id, map_order, map_name, picked_by_team_id, team1_score, team2_score, winner_team_id, duration_minutes, is_tiebreaker, went_overtime, hero_bans, created_at, updated_at' as const;

/** Fiche staff d'un match (GET /api/admin/matches/[matchId]). */
export const MATCH_DETAIL_COLUMNS = `
    id,
    tournament_id,
    stage_id,
    status,
    is_bye,
    match_format,
    round_name,
    round_number,
    bracket_side,
    group_key,
    team1_id,
    team2_id,
    team1_score,
    team2_score,
    winner_team_id,
    forfeit_team_id,
    scheduled_at,
    completed_at,
    updated_at,
    stream_url,
    replay_url,
    lobby_code,
    notes,
    next_match_win_id,
    next_match_win_slot,
    next_match_lose_id,
    next_match_lose_slot,
    dispute_reason,
    dispute_opened_by,
    dispute_opened_at,
    dispute_resolution,
    dispute_resolved_by,
    dispute_resolved_at,
    team1:team1_id(id, name, short_name, logo_url),
    team2:team2_id(id, name, short_name, logo_url),
    stage:stage_id(id, name, stage_type, is_active),
    tournament:tournament_id(id, name, slug, status, game)
  ` as const;

/** Même fiche, parties comprises (`?includeGames=1`). */
export const MATCH_DETAIL_WITH_GAMES_COLUMNS =
  `${MATCH_DETAIL_COLUMNS}, games:games(${GAME_ROW_COLUMNS})` as const;

/** Ligne `match_map_vetos` complète (ex-`select('*')`). */
export const VETO_ROW_COLUMNS =
  'id, tenant_id, match_id, step_number, action, team_id, map_name, map_type, created_at' as const;

/** Ligne `match_mvp_polls` complète (ex-`select('*')`). */
export const MVP_POLL_ROW_COLUMNS =
  'id, tenant_id, match_id, discord_channel_id, discord_message_id, posted_at, closes_at, closed_at, duration_hours, candidate_player_ids, total_votes, winner_member_id, winner_battle_tag, winner_votes, winner_source, winner_imported_at, winner_imported_by, created_at, updated_at' as const;

/** Ligne `cast_assignments` complète (ex-`select('*')` du PATCH). */
export const CAST_ASSIGNMENT_ROW_COLUMNS =
  'id, tenant_id, match_id, scrim_id, cast_member_id, role, briefing_at, briefing_reminder_sent_at, acked_at, created_at, updated_at' as const;

/** Casters d'un match, avec la fiche caster jointe. */
export const MATCH_CAST_ASSIGNMENT_COLUMNS =
  `id, match_id, cast_member_id, briefing_at, briefing_reminder_sent_at,
         acked_at, created_at, updated_at,
         cast_member:cast_member_id (id, name, auth_user_id, image_url)` as const;

/** Entrée de journal staff avec son auteur (historique d'un match). */
export const STAFF_LOG_WITH_STAFF_COLUMNS = `
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

/** Recherche staff de matchs (GET /api/admin/matches/search). */
export const MATCH_SEARCH_COLUMNS =
  `id, scheduled_at, status, round_name, lobby_code, notes,
         team1:team1_id (id, name, short_name),
         team2:team2_id (id, name, short_name),
         tournament:tournament_id (id, name)` as const;

/* ---------------------------------------------------------------------------
 * Paramètres de chemin et de requête
 * ------------------------------------------------------------------------ */

const matchId = uuidPathParam('Invalid matchId');
const matchIdFr = uuidPathParam('matchId invalide');

/** `?hard=1` (DELETE), `?includeGames=1` (GET) : lus par le service. */
export const MatchByIdQuery = z.object({
  matchId,
  includeGames: z.unknown().optional(),
  hard: z.unknown().optional(),
});

/** Routes `[matchId]` au message historique « Invalid matchId ». */
export const MatchIdQuery = z.object({ matchId });

/** Routes `[matchId]` au message historique « matchId invalide ». */
export const MatchIdFrQuery = z.object({ matchId: matchIdFr });

/** Feuille de match : « matchId invalide. » (avec le point). */
export const MatchLineupQuery = z.object({
  matchId: uuidPathParam('matchId invalide.'),
});

/** DELETE …/dispute : `?resumeStatus=` validé par le service. */
export const MatchDisputeQuery = z.object({
  matchId,
  resumeStatus: z.unknown().optional(),
});

/** Un seul message pour les deux ids, comme la route d'origine. */
export const MatchCastAssignmentIdQuery = z.object({
  matchId: uuidPathParam('IDs invalides'),
  assignmentId: uuidPathParam('IDs invalides'),
});

const GAME_INDEX_ERROR = 'gameIndex must be a positive integer.';

/** `[gameIndex]` : `Number(x)` entier ≥ 1, comme la route d'origine. */
export const MatchDraftQuery = z.object({
  matchId,
  gameIndex: z.coerce
    .number({ error: GAME_INDEX_ERROR })
    .int({ error: GAME_INDEX_ERROR })
    .min(1, { error: GAME_INDEX_ERROR }),
  /** DELETE : `?force=1` supprime un draft en cours. */
  force: z.unknown().optional(),
});

/** Recherche : filtres normalisés par le service (bornes, défauts). */
export const MatchSearchQuery = looseQuery(['q', 'upcoming', 'limit']);

/* ---------------------------------------------------------------------------
 * Corps
 * ------------------------------------------------------------------------ */

/** Champs méta modifiables d'un match (PATCH/PUT en mode « meta »). */
export const MATCH_META_FIELDS = [
  'tournament_id',
  'stage_id',
  'status',
  'is_bye',
  'match_format',
  'round_name',
  'round_number',
  'bracket_side',
  'group_key',
  'team1_id',
  'team2_id',
  'scheduled_at',
  'completed_at',
  'stream_url',
  'replay_url',
  'lobby_code',
  'notes',
  'next_match_win_id',
  'next_match_win_slot',
  'next_match_lose_id',
  'next_match_lose_slot',
] as const;

/** PATCH/PUT d'un match : mode score OU champs méta (cf. service). */
export const MatchUpdateBody = looseBody([
  'mode',
  'expected_updated_at',
  'team1Score',
  'team2Score',
  'winnerTeamId',
  'status',
  'propagate',
  'forfeit_team_id',
  ...MATCH_META_FIELDS,
]);

export const DisputeOpenBody = looseBody(['reason']);

export const DisputeResolveBody = looseBody([
  'resolution',
  'resumeStatus',
  'team1Score',
  'team2Score',
  'winnerTeamId',
  'forfeitTeamId',
]);

export const VetoStepBody = looseBody([
  'action',
  'map_name',
  'map_type',
  'team_id',
]);

export const VetoUnlockBody = looseBody(['unlock', 'reason']);

export const DraftInitBody = looseBody([
  'gameIndex',
  'fearless',
  'pickTimerSeconds',
]);

export const DraftSideBody = looseBody(['team1Side', 'team2Side']);

export const DraftCommitBody = looseBody(['stepNumber', 'heroId']);

export const MatchCastAssignmentBody = looseBody([
  'castMemberId',
  'briefingAt',
]);

export const MatchCastAssignmentPatchBody = looseBody(['briefingAt']);

export const MvpImportBody = looseBody(['winnerMemberId']);

export const MatchLineupBody = looseBody(['teamId', 'starters', 'reopen']);

export const CheckinNudgeBody = looseBody(['teamSide']);

/** Corps déclaré de POST …/mvp-public ; validé par le service. */
export const MvpPublicLooseBody = looseBody([
  'action',
  'windowMinutes',
  'source',
  'votes',
]);

/**
 * 200 voix par appel : large pour un pic de chat réel, assez bas pour qu'un
 * cockpit détraqué ne puisse pas pousser un million de lignes d'un coup.
 */
export const MAX_PUBLIC_VOTES_PER_BATCH = 200;

const publicVote = z.object({
  voterKey: z.string().trim().min(1).max(64),
  memberId: z.string().uuid(),
});

/** Échec → 400 « Corps invalide » (message historique, cf. service). */
export const MvpPublicBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('open'),
    windowMinutes: z.number().int().min(1).max(360).optional(),
  }),
  z.object({
    action: z.literal('vote'),
    // 'twitch' = viewers du chat, 'discord' = supporters du serveur.
    source: z.enum(['twitch', 'discord']),
    votes: z.array(publicVote).min(1).max(MAX_PUBLIC_VOTES_PER_BATCH),
  }),
  z.object({ action: z.literal('close') }),
]);
