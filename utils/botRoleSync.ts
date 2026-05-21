// utils/botRoleSync.ts
//
// Résout l'état "role-sync" d'un user pour enrichir le payload des events
// team.member.added / team.member.removed / team.captain.changed /
// staff.role.changed avant emitBotEvent.
//
// Le bot (services/discord-bot/role-sync.js) attend exactement la forme
// SnapshotUser ci-dessous — c'est la même que celle servie par
// GET /api/bot/v1/role-sync/snapshot, mais résolue pour un seul authUserId
// au moment où l'event est émis.
//
// Sans ce helper, les emitters envoyaient { authUserId, teamId, ... } que
// syncSingleUser rejette silencieusement (manque de discordUserId).

import { supabaseAdmin } from './supabase';
import { logger } from './logger';
import { emitBotEvent, type BotEventName } from './botEvents';

export type RoleSyncUser = {
  authUserId: string;
  discordUserId: string;
  discordUsername: string | null;
  team: {
    id: string;
    name: string;
    discordRoleId: string | null;
    isCaptain: boolean;
    isSubstitute: boolean;
    role: string | null;
  } | null;
  staffRole: string | null;
};

/**
 * Résout discordUserId + team + staffRole pour un authUserId.
 * Retourne null si l'utilisateur n'a pas lié son compte Discord
 * (auquel cas il n'y a rien à synchroniser côté bot).
 */
export async function resolveRoleSyncUser(
  authUserId: string
): Promise<RoleSyncUser | null> {
  if (!supabaseAdmin) return null;

  const { data: link, error: linkErr } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id, discord_user_id, discord_username')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (linkErr) {
    logger.error('[botRoleSync] link error', linkErr);
    return null;
  }
  if (!link?.discord_user_id) return null;

  const { data: membership } = await supabaseAdmin
    .from('team_members')
    .select(
      'team_id, role, is_substitute, team:team_id(id, name, captain_id, discord_role_id)'
    )
    .eq('user_id', authUserId)
    .maybeSingle();

  const teamRel = membership?.team
    ? Array.isArray(membership.team)
      ? membership.team[0]
      : membership.team
    : null;

  const { data: staffRow } = await supabaseAdmin
    .from('staff')
    .select('role')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  return {
    authUserId,
    discordUserId: link.discord_user_id,
    discordUsername: link.discord_username ?? null,
    team: teamRel
      ? {
          id: teamRel.id,
          name: teamRel.name,
          discordRoleId: teamRel.discord_role_id ?? null,
          isCaptain: teamRel.captain_id === authUserId,
          isSubstitute: !!membership?.is_substitute,
          role: membership?.role ?? null,
        }
      : null,
    staffRole: staffRow?.role ?? null,
  };
}

/**
 * Résout le previousTeam (juste discordRoleId) pour un user qui vient d'être
 * retiré : le bot a besoin de cette info pour savoir quel rôle d'équipe
 * retirer dans le cas où le user n'a plus du tout d'équipe (team: null).
 */
export async function resolvePreviousTeamRoleId(
  teamId: string
): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .from('teams')
    .select('discord_role_id')
    .eq('id', teamId)
    .maybeSingle();
  return data?.discord_role_id ?? null;
}

/**
 * Émet un event role-sync enrichi (discordUserId + team + staffRole résolus).
 * Si l'utilisateur n'a pas de lien Discord, no-op (rien à syncer).
 *
 * Pour `team.member.removed`, passe `previousTeamId` pour que le bot puisse
 * retirer le rôle de l'ancienne équipe — sinon le team:null payload est
 * insuffisant si le bot n'a pas encore vu cette équipe dans son snapshot.
 */
export async function emitRoleSyncEvent(
  event: BotEventName,
  authUserId: string,
  tenantId: string,
  opts?: { previousTeamId?: string | null; extras?: Record<string, unknown> }
): Promise<void> {
  try {
    if (!tenantId) {
      logger.error(
        `[botRoleSync] ${event} aborted: tenantId missing — multi-tenant required`
      );
      return;
    }
    const snapshot = await resolveRoleSyncUser(authUserId);
    if (!snapshot) return;

    const payload: Record<string, unknown> = { ...snapshot };

    if (opts?.previousTeamId) {
      const previousDiscordRoleId = await resolvePreviousTeamRoleId(
        opts.previousTeamId
      );
      if (previousDiscordRoleId) {
        payload.previousTeam = { discordRoleId: previousDiscordRoleId };
      }
    }

    if (opts?.extras) {
      Object.assign(payload, opts.extras);
    }

    await emitBotEvent(event, payload, tenantId);
  } catch (err) {
    logger.error(`[botRoleSync] emit ${event} error`, err);
  }
}
