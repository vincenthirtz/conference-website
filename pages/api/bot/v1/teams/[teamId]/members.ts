// DELETE /api/bot/v1/teams/[teamId]/members
//
// Commande /kicker @membre : le capitaine retire une joueuse de son équipe.
// L'ajout est désormais géré par le flow d'invitation
// (POST /api/bot/v1/teams/[teamId]/invitations) qui passe par une demande
// pending acceptée par la joueuse via DM Discord.
//
// Auth : x-api-key + actorDiscordUserId doit etre le capitaine de la team.
// Cible : targetDiscordUserId (compte Discord lie au site).

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotPlayer, resolveActorPlayer } from '@/utils/botActor';
import { discordIdSchema, uuidSchema } from '@/utils/botValidation';
import {
  isTeamRosterLocked,
  rosterLockErrorMessage,
} from '@/utils/teams/rosterLock';
import { emitRoleSyncEvent } from '@/utils/botRoleSync';
import { logPlayerAction } from '@/utils/botPlayerLogs';
import { logger } from '@/utils/logger';

// actorDiscordUserId lu par requireBotPlayer (body brut, non muté).
const kickMemberBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  targetDiscordUserId: discordIdSchema,
});
const kickMemberQuerySchema = z.object({ teamId: uuidSchema });

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const { teamId } = req.botQuery as z.infer<typeof kickMemberQuerySchema>;

  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotPlayer(req, res, body);
  if (!actor) return;

  const { targetDiscordUserId } = req.botInput as z.infer<
    typeof kickMemberBodySchema
  >;

  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, name, captain_id')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('id', teamId)
    .maybeSingle();
  if (teamErr) {
    logger.error('[bot/teams/members] team lookup error', teamErr);
    return res.status(500).json({ error: 'Erreur de chargement de l’équipe' });
  }
  if (!team) {
    return res.status(404).json({ error: 'Équipe introuvable' });
  }
  if (team.captain_id !== actor.authUserId) {
    return res
      .status(403)
      .json({ error: 'Action réservée au capitaine de cette équipe.' });
  }

  const target = await resolveActorPlayer(targetDiscordUserId);
  if (!target) {
    return res
      .status(404)
      .json({ error: "La joueuse ciblée n'est pas liée au site." });
  }

  if (target.authUserId === team.captain_id) {
    return res.status(400).json({
      error:
        "Le capitaine ne peut pas être retiré. Transfère le capitanat d'abord.",
    });
  }
  if (target.authUserId === actor.authUserId) {
    return res.status(400).json({
      error: 'Utilise /equipe quitter pour partir toi-même.',
    });
  }

  const lockStatus = await isTeamRosterLocked(req.botContext.tenantId, team.id);
  if (lockStatus.locked) {
    return res.status(409).json({ error: rosterLockErrorMessage(lockStatus) });
  }

  const { data: member, error: fetchErr } = await supabaseAdmin
    .from('team_members')
    .select('id')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('team_id', team.id)
    .eq('user_id', target.authUserId)
    .maybeSingle();
  if (fetchErr) {
    logger.error('[bot/teams/members] member lookup error', fetchErr);
    return res.status(500).json({ error: 'Erreur de chargement du membre' });
  }
  if (!member) {
    return res
      .status(404)
      .json({ error: "Cette joueuse n'est pas dans ton équipe." });
  }

  const { error: deleteErr } = await supabaseAdmin
    .from('team_members')
    .delete()
    .eq('tenant_id', req.botContext.tenantId)
    .eq('id', member.id);
  if (deleteErr) {
    logger.error('[bot/teams/members] delete error', deleteErr);
    return res.status(500).json({ error: 'Échec du retrait' });
  }

  void emitRoleSyncEvent(
    'team.member.removed',
    target.authUserId,
    req.botContext.tenantId,
    {
      previousTeamId: team.id,
      extras: { teamId: team.id },
    }
  );

  void logPlayerAction({
    actorAuthUserId: actor.authUserId,
    actorDiscordUserId: actor.discordUserId,
    action: 'kick_member',
    entityType: 'team',
    entityId: team.id,
    targetAuthUserId: target.authUserId,
    targetDiscordUserId: targetDiscordUserId,
  });

  return res.status(200).json({
    success: true,
    teamId: team.id,
    removedAuthUserId: target.authUserId,
    targetDiscordUserId,
  });
}

export default withBotRoute(handler, {
  methods: ['DELETE'],
  rateLimit: { max: 20, key: 'bot-team-members-kick' },
  idempotent: true,
  bodySchema: kickMemberBodySchema,
  querySchema: kickMemberQuerySchema,
});
