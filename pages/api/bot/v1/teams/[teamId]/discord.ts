// PATCH /api/bot/v1/teams/[teamId]/discord
//
// Le bot Discord cree des roles et des channels prives pour chaque equipe
// lors de leur creation. Cet endpoint permet de persister ces IDs cote site
// (teams.discord_role_id, teams.discord_channel_id) pour que les push
// events sortants (team.member.added etc.) renvoient les bons IDs au bot.
//
// Auth : x-api-key + actorDiscordUserId staff admin/owner — c'est le bot
// lui-meme qui appelle, en tant qu'identite de service. L'idee est qu'un
// admin du serveur Discord initialise la commande de provisioning et le
// bot relaie son identite pour audit.
//
// Body : { actorDiscordUserId, discordRoleId?, discordChannelId? }
// Passer null pour clearer un champ.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

// Discord snowflakes : 15-25 digits, comme les user IDs.
const DISCORD_SNOWFLAKE_RE = /^[0-9]{15,25}$/;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.teamId;
  const teamId = Array.isArray(raw) ? raw[0] : raw;
  if (!teamId || !isValidUUID(teamId)) {
    return res.status(400).json({ error: 'teamId invalide' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  const updates: Record<string, string | null> = {};

  if ('discordRoleId' in body) {
    const v = body.discordRoleId;
    if (v === null) {
      updates.discord_role_id = null;
    } else if (typeof v === 'string' && DISCORD_SNOWFLAKE_RE.test(v.trim())) {
      updates.discord_role_id = v.trim();
    } else {
      return res
        .status(400)
        .json({ error: 'discordRoleId invalide (snowflake Discord attendu)' });
    }
  }

  if ('discordChannelId' in body) {
    const v = body.discordChannelId;
    if (v === null) {
      updates.discord_channel_id = null;
    } else if (typeof v === 'string' && DISCORD_SNOWFLAKE_RE.test(v.trim())) {
      updates.discord_channel_id = v.trim();
    } else {
      return res.status(400).json({
        error: 'discordChannelId invalide (snowflake Discord attendu)',
      });
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      error: 'Aucun champ à mettre à jour (discordRoleId, discordChannelId).',
    });
  }

  const { data: team, error: tErr } = await supabaseAdmin
    .from('teams')
    .select('id, name, discord_role_id, discord_channel_id')
    .eq('id', teamId)
    .maybeSingle();
  if (tErr) {
    logger.error('[bot/team/discord] lookup error', tErr);
    return res.status(500).json({ error: 'Erreur de chargement de l’équipe' });
  }
  if (!team) {
    return res.status(404).json({ error: 'Équipe introuvable' });
  }

  const before = {
    discord_role_id: team.discord_role_id,
    discord_channel_id: team.discord_channel_id,
  };

  const { data: updated, error: upErr } = await supabaseAdmin
    .from('teams')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', teamId)
    .select('id, name, discord_role_id, discord_channel_id')
    .maybeSingle();
  if (upErr || !updated) {
    logger.error('[bot/team/discord] update error', upErr);
    return res.status(500).json({ error: 'Échec de la mise à jour' });
  }

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'update_team',
    entity_type: 'team',
    entity_id: teamId,
    payload: {
      action_type: 'discord_writeback',
      before,
      after: updates,
    },
  });

  return res.status(200).json({ success: true, team: updated });
}

export default withBotRoute(handler, {
  methods: ['PATCH'],
  rateLimit: { max: 30, key: 'bot-team-discord' },
  idempotent: true,
});
