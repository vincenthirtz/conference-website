// POST /api/bot/v1/invitations/[demandeId]
//
// Action sur une invitation pending. Trois actions, deux acteurs possibles :
//   - action='accept' : seule l'invitee peut accepter
//   - action='reject' : seule l'invitee peut refuser
//   - action='cancel' : seul le capitaine ayant emis l'invite peut annuler
//
// Auth : x-api-key + actorDiscordUserId (lie au site).

import type { NextApiRequest, NextApiResponse } from 'next';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotPlayer } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import {
  acceptInvitation,
  cancelInvitation,
  rejectInvitation,
} from '@/utils/teams/invitations';
import { logPlayerAction } from '@/utils/botPlayerLogs';

const ACTIONS = new Set(['accept', 'reject', 'cancel']);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.demandeId;
  const demandeId = Array.isArray(raw) ? raw[0] : raw;
  if (!demandeId || !isValidUUID(demandeId)) {
    return res.status(400).json({ error: 'demandeId invalide' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotPlayer(req, res, body);
  if (!actor) return;

  const action =
    typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
  if (!ACTIONS.has(action)) {
    return res
      .status(400)
      .json({ error: "action requise : 'accept', 'reject' ou 'cancel'." });
  }

  if (action === 'accept') {
    const result = await acceptInvitation(demandeId, actor.authUserId);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    void logPlayerAction({
      actorAuthUserId: actor.authUserId,
      actorDiscordUserId: actor.discordUserId,
      action: 'invite_accept',
      entityType: 'invitation',
      entityId: demandeId,
      payload: { team_id: result.data.teamId },
    });
    return res.status(200).json({
      success: true,
      action: 'accept',
      teamId: result.data.teamId,
      memberId: result.data.memberId,
    });
  }

  if (action === 'reject') {
    const result = await rejectInvitation(demandeId, actor.authUserId);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    void logPlayerAction({
      actorAuthUserId: actor.authUserId,
      actorDiscordUserId: actor.discordUserId,
      action: 'invite_reject',
      entityType: 'invitation',
      entityId: demandeId,
    });
    return res.status(200).json({ success: true, action: 'reject' });
  }

  // cancel
  const result = await cancelInvitation(demandeId, actor.authUserId);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  void logPlayerAction({
    actorAuthUserId: actor.authUserId,
    actorDiscordUserId: actor.discordUserId,
    action: 'invite_cancel',
    entityType: 'invitation',
    entityId: demandeId,
  });
  return res.status(200).json({ success: true, action: 'cancel' });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 30, key: 'bot-invitations-action' },
  idempotent: true,
});
