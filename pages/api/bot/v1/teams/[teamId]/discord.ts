// PATCH /api/bot/v1/teams/[teamId]/discord
//
// Le bot Discord cree des roles et des channels prives pour chaque equipe
// lors de leur creation. Cet endpoint permet de persister ces IDs cote site
// (teams.discord_role_id, teams.discord_channel_id, teams.discord_voice_channel_id)
// pour que les push events sortants (team.member.added, team.dissolved etc.)
// renvoient les bons IDs au bot.
//
// Auth : x-api-key + actorDiscordUserId staff admin/owner — c'est le bot
// lui-meme qui appelle, en tant qu'identite de service. L'idee est qu'un
// admin du serveur Discord initialise la commande de provisioning et le
// bot relaie son identite pour audit.
//
// Body : { actorDiscordUserId, discordRoleId?, discordChannelId?, discordVoiceChannelId? }
// Passer null pour clearer un champ.

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { discordIdSchema, uuidSchema } from '@/utils/botValidation';
import { logger } from '@/utils/logger';

// Body : actorDiscordUserId (lu par requireBotStaff sur le body brut) + les 3
// snowflakes Discord. nullable() = passer null pour clearer un champ ;
// optional() = champ absent -> no-op. discordIdSchema applique le même
// regex/trim que l'ex-DISCORD_SNOWFLAKE_RE inline.
const discordWritebackBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  discordRoleId: discordIdSchema.nullable().optional(),
  discordChannelId: discordIdSchema.nullable().optional(),
  discordVoiceChannelId: discordIdSchema.nullable().optional(),
});
const discordQuerySchema = z.object({ teamId: uuidSchema });

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { teamId } = req.botQuery as z.infer<typeof discordQuerySchema>;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  const input = req.botInput as z.infer<typeof discordWritebackBodySchema>;
  const updates: Record<string, string | null> = {};

  if (input.discordRoleId !== undefined) {
    updates.discord_role_id = input.discordRoleId;
  }
  if (input.discordChannelId !== undefined) {
    updates.discord_channel_id = input.discordChannelId;
  }
  if (input.discordVoiceChannelId !== undefined) {
    updates.discord_voice_channel_id = input.discordVoiceChannelId;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      error:
        'Aucun champ à mettre à jour (discordRoleId, discordChannelId, discordVoiceChannelId).',
    });
  }

  const { data: team, error: tErr } = await supabaseAdmin
    .from('teams')
    .select(
      'id, name, discord_role_id, discord_channel_id, discord_voice_channel_id'
    )
    .eq('tenant_id', req.botContext!.tenantId)
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
    discord_voice_channel_id: team.discord_voice_channel_id,
  };

  const { data: updated, error: upErr } = await supabaseAdmin
    .from('teams')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('id', teamId)
    .select(
      'id, name, discord_role_id, discord_channel_id, discord_voice_channel_id'
    )
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
  bodySchema: discordWritebackBodySchema,
  querySchema: discordQuerySchema,
});
