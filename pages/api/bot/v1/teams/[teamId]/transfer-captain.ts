// POST /api/bot/v1/teams/[teamId]/transfer-captain
//
// Commande /transferer-capitaine : le capitaine actuel passe le rôle à un
// autre membre de son équipe.
//
// Auth : x-api-key + actorDiscordUserId doit etre le capitaine actuel.
// Cible : newCaptainDiscordUserId, doit etre lie au site ET membre de l'equipe.
// Garde : roster lock — un transfert change qui peut agir sur line-ups, scores,
//         scrims pendant un tournoi. Admin uniquement peut forcer via UI.

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
const transferCaptainBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  newCaptainDiscordUserId: discordIdSchema,
});
const transferCaptainQuerySchema = z.object({ teamId: uuidSchema });

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const { teamId } = req.botQuery as z.infer<typeof transferCaptainQuerySchema>;

  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotPlayer(req, res, body);
  if (!actor) return;

  const { newCaptainDiscordUserId } = req.botInput as z.infer<
    typeof transferCaptainBodySchema
  >;
  if (newCaptainDiscordUserId === actor.discordUserId) {
    return res.status(400).json({ error: 'Tu es déjà capitaine.' });
  }

  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, captain_id')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('id', teamId)
    .maybeSingle();
  if (teamErr) {
    logger.error('[bot/transfer-captain] team lookup error', teamErr);
    return res.status(500).json({ error: 'Erreur de chargement de l’équipe' });
  }
  if (!team) {
    return res.status(404).json({ error: 'Équipe introuvable' });
  }
  if (team.captain_id !== actor.authUserId) {
    return res
      .status(403)
      .json({ error: "Tu n'es pas capitaine de cette équipe." });
  }

  const newCaptain = await resolveActorPlayer(newCaptainDiscordUserId);
  if (!newCaptain) {
    return res.status(404).json({
      error:
        "La nouvelle capitaine n'a pas lié son compte Discord. Elle doit lancer /inscription d'abord.",
    });
  }

  const { data: membership, error: memberErr } = await supabaseAdmin
    .from('team_members')
    .select('id')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('team_id', team.id)
    .eq('user_id', newCaptain.authUserId)
    .maybeSingle();
  if (memberErr) {
    logger.error('[bot/transfer-captain] member lookup error', memberErr);
    return res.status(500).json({ error: 'Erreur de chargement du membre' });
  }
  if (!membership) {
    return res
      .status(400)
      .json({ error: "Cette joueuse n'est pas membre de ton équipe." });
  }

  const lockStatus = await isTeamRosterLocked(req.botContext.tenantId, team.id);
  if (lockStatus.locked) {
    return res.status(409).json({ error: rosterLockErrorMessage(lockStatus) });
  }

  const { error: updateErr } = await supabaseAdmin
    .from('teams')
    .update({
      captain_id: newCaptain.authUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', req.botContext.tenantId)
    .eq('id', team.id);
  if (updateErr) {
    logger.error('[bot/transfer-captain] update error', updateErr);
    return res.status(500).json({ error: 'Échec du transfert' });
  }

  // 2 events : ancien capitaine (perd le rôle captain) puis nouveau (le gagne).
  // syncSingleUser fait 1 sync par event — plus simple et idempotent.
  void emitRoleSyncEvent(
    'team.captain.changed',
    actor.authUserId,
    req.botContext.tenantId,
    { extras: { teamId: team.id, role: 'previous' } }
  );
  void emitRoleSyncEvent(
    'team.captain.changed',
    newCaptain.authUserId,
    req.botContext.tenantId,
    { extras: { teamId: team.id, role: 'new' } }
  );

  void logPlayerAction({
    actorAuthUserId: actor.authUserId,
    actorDiscordUserId: actor.discordUserId,
    action: 'transfer_captain',
    entityType: 'team',
    entityId: team.id,
    targetAuthUserId: newCaptain.authUserId,
    targetDiscordUserId: newCaptainDiscordUserId,
  });

  return res.status(200).json({
    success: true,
    teamId: team.id,
    previousCaptainAuthUserId: actor.authUserId,
    newCaptainAuthUserId: newCaptain.authUserId,
    newCaptainDiscordUserId,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 10, key: 'bot-team-transfer-captain' },
  idempotent: true,
  bodySchema: transferCaptainBodySchema,
  querySchema: transferCaptainQuerySchema,
});
