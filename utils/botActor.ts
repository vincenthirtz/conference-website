// utils/botActor.ts
//
// Helpers partages par les routes /api/bot/v1 qui ont un "actor" identifie
// via son Discord user id.
//
// Staff (admin/owner) :
// - resolveActorStaff : Discord ID -> { staffId, role, authUserId } (ou nulls).
// - requireBotStaff   : verifie + repond 403 si pas admin/owner. Renvoie null
//                       et termine la reponse en cas d'echec (idiome compatible
//                       avec applyRateLimit).
// - logBotStaffAction : wrap logStaffAction avec via:'discord_bot' automatique
//                       et swallow d'erreur, pour eviter try/catch repete.
//
// Joueur (player) :
// - resolveActorPlayer : Discord ID -> { authUserId } via user_discord_links.
// - requireBotPlayer   : 400 si Discord ID invalide, 404 si pas lie au site.
//                        Utilise pour les routes "capitaine" (invite, kick,
//                        transfer, leave, self-register).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from './supabase';
import { logStaffAction, type StaffLogAction } from './staffLogs';
import { logger } from './logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;
const STAFF_PRIVILEGED = new Set(['admin', 'owner']);

export type BotActor = {
  staffId: string | null;
  role: string | null;
  authUserId: string | null;
};

export async function resolveActorStaff(
  discordUserId: string
): Promise<BotActor> {
  if (!supabaseAdmin) return { staffId: null, role: null, authUserId: null };
  const { data: link } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id')
    .eq('discord_user_id', discordUserId)
    .maybeSingle();
  if (!link) return { staffId: null, role: null, authUserId: null };
  const { data: staff } = await supabaseAdmin
    .from('staff')
    .select('id, role')
    .eq('auth_user_id', link.auth_user_id)
    .maybeSingle();
  return {
    staffId: staff?.id ?? null,
    role: staff?.role ?? null,
    authUserId: link.auth_user_id ?? null,
  };
}

/**
 * Read `actorDiscordUserId` from body, resolve, and 403 if not admin/owner.
 * Returns the actor on success, or `null` if the response has been sent.
 */
export async function requireBotStaff(
  req: NextApiRequest,
  res: NextApiResponse,
  body: Record<string, unknown>
): Promise<BotActor | null> {
  const actorDiscordUserId =
    typeof body.actorDiscordUserId === 'string'
      ? body.actorDiscordUserId.trim()
      : '';
  if (!DISCORD_ID_RE.test(actorDiscordUserId)) {
    res.status(400).json({ error: 'actorDiscordUserId requis' });
    return null;
  }
  const actor = await resolveActorStaff(actorDiscordUserId);
  if (!actor.role || !STAFF_PRIVILEGED.has(actor.role)) {
    res.status(403).json({
      error:
        "Action reservee aux admins/owners. Ton compte Discord n'est pas lie a un staff de ce niveau.",
    });
    return null;
  }
  return actor;
}

export type BotPlayerActor = {
  authUserId: string;
  discordUserId: string;
};

/**
 * Resolve a Discord user id to an auth user id via user_discord_links.
 * Returns null if the Discord ID is not linked to a site account.
 */
export async function resolveActorPlayer(
  discordUserId: string
): Promise<BotPlayerActor | null> {
  if (!supabaseAdmin) return null;
  const { data: link } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id')
    .eq('discord_user_id', discordUserId)
    .maybeSingle();
  if (!link?.auth_user_id) return null;
  return { authUserId: link.auth_user_id, discordUserId };
}

/**
 * Read `actorDiscordUserId` from body, resolve, and 404 if not linked.
 * Returns the actor on success, or `null` if the response has been sent.
 */
export async function requireBotPlayer(
  req: NextApiRequest,
  res: NextApiResponse,
  body: Record<string, unknown>
): Promise<BotPlayerActor | null> {
  const actorDiscordUserId =
    typeof body.actorDiscordUserId === 'string'
      ? body.actorDiscordUserId.trim()
      : '';
  if (!DISCORD_ID_RE.test(actorDiscordUserId)) {
    res.status(400).json({ error: 'actorDiscordUserId requis' });
    return null;
  }
  const actor = await resolveActorPlayer(actorDiscordUserId);
  if (!actor) {
    res.status(404).json({
      error:
        "Ton compte Discord n'est pas lié au site. Lance /inscription d'abord.",
    });
    return null;
  }
  return actor;
}

/**
 * Insert a staff_logs row with `via: 'discord_bot'` baked in. No-op when
 * staffId is null (player-driven routes have no staff actor). Errors are
 * logged but never thrown -- audit logging must never break a successful
 * mutation.
 */
export async function logBotStaffAction(params: {
  staffId: string | null;
  action: StaffLogAction;
  entity_type?: string | null;
  entity_id?: string | null;
  tournament_id?: string | null;
  payload?: Record<string, unknown> | null;
}): Promise<void> {
  if (!params.staffId) return;
  try {
    await logStaffAction({
      staff_id: params.staffId,
      action: params.action,
      entity_type: params.entity_type ?? null,
      entity_id: params.entity_id ?? null,
      tournament_id: params.tournament_id ?? null,
      payload: { ...(params.payload ?? {}), via: 'discord_bot' },
    });
  } catch (e) {
    logger.error('[bot] staff log error', e);
  }
}
