// POST /api/bot/v1/teams/[teamId]/transfer-captain
//
// Commande /transferer-capitaine : le capitaine actuel passe le rôle à un
// autre membre de son équipe.
//
// Auth : x-api-key + actorDiscordUserId doit etre le capitaine actuel.
// Cible : newCaptainDiscordUserId, doit etre lie au site ET membre de l'equipe.
// Garde : roster lock — un transfert change qui peut agir sur line-ups, scores,
//         scrims pendant un tournoi. Admin uniquement peut forcer via UI.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotPlayer, resolveActorPlayer } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import {
  isTeamRosterLocked,
  rosterLockErrorMessage,
} from '@/utils/teams/rosterLock';
import { emitBotEvent } from '@/utils/botEvents';
import { logPlayerAction } from '@/utils/botPlayerLogs';
import { logger } from '@/utils/logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.teamId;
  const teamId = Array.isArray(raw) ? raw[0] : raw;
  if (!teamId || !isValidUUID(teamId)) {
    return res.status(400).json({ error: 'teamId invalide' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotPlayer(req, res, body);
  if (!actor) return;

  const newCaptainDiscordUserId =
    typeof body.newCaptainDiscordUserId === 'string'
      ? body.newCaptainDiscordUserId.trim()
      : '';
  if (!DISCORD_ID_RE.test(newCaptainDiscordUserId)) {
    return res.status(400).json({ error: 'newCaptainDiscordUserId requis' });
  }
  if (newCaptainDiscordUserId === actor.discordUserId) {
    return res.status(400).json({ error: 'Tu es déjà capitaine.' });
  }

  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, captain_id')
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

  const lockStatus = await isTeamRosterLocked(team.id);
  if (lockStatus.locked) {
    return res.status(409).json({ error: rosterLockErrorMessage(lockStatus) });
  }

  const { error: updateErr } = await supabaseAdmin
    .from('teams')
    .update({
      captain_id: newCaptain.authUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', team.id);
  if (updateErr) {
    logger.error('[bot/transfer-captain] update error', updateErr);
    return res.status(500).json({ error: 'Échec du transfert' });
  }

  void emitBotEvent('team.captain.changed', {
    teamId: team.id,
    previousCaptainAuthUserId: actor.authUserId,
    newCaptainAuthUserId: newCaptain.authUserId,
  }).catch((e) =>
    logger.error('[botEvents] team.captain.changed emit error:', e)
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
});
