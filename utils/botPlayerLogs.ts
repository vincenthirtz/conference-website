// utils/botPlayerLogs.ts
//
// Audit trail des actions joueuses cote bot. Inserts dans bot_player_actions.
// Fire-and-forget : un echec d'audit ne doit JAMAIS bloquer la mutation
// metier qui le declenche. Erreurs logged, jamais throw.
//
// Use : `void logPlayerAction({ ... }).catch(...)` ou `await` si on veut
// vraiment garantir la trace avant de repondre (mais ca ajoute une latence
// DB inutile au happy path).

import { supabaseAdmin } from './supabase';
import { logger } from './logger';

export type PlayerAction =
  | 'create_team'
  | 'invite_create'
  | 'invite_accept'
  | 'invite_reject'
  | 'invite_cancel'
  | 'kick_member'
  | 'transfer_captain'
  | 'leave_team'
  | 'register_team'
  | 'checkin'
  | 'report_score'
  | 'update_profile';

export type LogPlayerActionInput = {
  actorAuthUserId: string;
  actorDiscordUserId: string;
  action: PlayerAction;
  entityType?:
    | 'team'
    | 'match'
    | 'invitation'
    | 'tournament'
    | 'profile'
    | null;
  entityId?: string | null;
  /** For actions affecting another user (kick, transfer, invite_create). */
  targetAuthUserId?: string | null;
  targetDiscordUserId?: string | null;
  /** Free-form context (scores, role, reason, etc.). Public-safe — no PII. */
  payload?: Record<string, unknown> | null;
};

export async function logPlayerAction(
  params: LogPlayerActionInput
): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const { error } = await supabaseAdmin.from('bot_player_actions').insert({
      actor_auth_user_id: params.actorAuthUserId,
      actor_discord_user_id: params.actorDiscordUserId,
      action: params.action,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      target_auth_user_id: params.targetAuthUserId ?? null,
      target_discord_user_id: params.targetDiscordUserId ?? null,
      payload: params.payload ?? null,
    });
    if (error) {
      logger.error('[botPlayerLogs] insert error', error);
    }
  } catch (e) {
    logger.error('[botPlayerLogs] unexpected error', e);
  }
}
