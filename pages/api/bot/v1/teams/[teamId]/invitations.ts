// POST /api/bot/v1/teams/[teamId]/invitations
//
// Commande /inviter @membre : le capitaine cree une invitation pending pour
// une joueuse. Pas d'add direct -- la joueuse doit accepter via le DM du bot
// (POST /api/bot/v1/invitations/[demandeId] { action: 'accept' }).
//
// Auth   : x-api-key + actorDiscordUserId doit etre captain_id de la team.
// Cible  : targetDiscordUserId, doit etre lie au site (sinon 404 -> le bot
//          peut DM la joueuse pour lui demander /inscription).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotPlayer, resolveActorPlayer } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { createInvitation } from '@/utils/teams/invitations';
import { logger } from '@/utils/logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;
const COMMENT_MAX = 1000;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.teamId;
  const teamId = Array.isArray(raw) ? raw[0] : raw;
  if (!teamId || !isValidUUID(teamId)) {
    return res.status(400).json({ error: 'teamId invalide' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotPlayer(req, res, body);
  if (!actor) return;

  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, captain_id, name')
    .eq('id', teamId)
    .maybeSingle();
  if (teamErr) {
    logger.error('[bot/invitations] team lookup error', teamErr);
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

  const targetDiscordUserId =
    typeof body.targetDiscordUserId === 'string'
      ? body.targetDiscordUserId.trim()
      : '';
  if (!DISCORD_ID_RE.test(targetDiscordUserId)) {
    return res.status(400).json({ error: 'targetDiscordUserId requis' });
  }
  if (targetDiscordUserId === actor.discordUserId) {
    return res
      .status(400)
      .json({ error: 'Tu fais déjà partie de cette équipe.' });
  }

  const target = await resolveActorPlayer(targetDiscordUserId);
  if (!target) {
    return res.status(404).json({
      error:
        "La joueuse ciblée n'a pas lié son compte Discord au site. Elle doit lancer /inscription d'abord.",
    });
  }

  const comment =
    typeof body.comment === 'string' ? body.comment.trim().slice(0, COMMENT_MAX) : null;
  const role = typeof body.role === 'string' ? body.role : undefined;
  const battleTag =
    typeof body.battleTag === 'string' ? body.battleTag : undefined;

  const result = await createInvitation({
    teamId: team.id,
    captainAuthUserId: actor.authUserId,
    captainDiscordUserId: actor.discordUserId,
    inviteeAuthUserId: target.authUserId,
    inviteeDiscordUserId: targetDiscordUserId,
    role,
    battleTag,
    comment,
  });
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  return res.status(201).json({
    success: true,
    invitation: result.data,
    teamName: team.name,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 20, key: 'bot-team-invitations-create' },
  idempotent: true,
});
