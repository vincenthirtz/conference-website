// POST /api/bot/v1/invitations/[demandeId]
//
// Action sur une invitation pending. Trois actions, deux acteurs possibles :
//   - action='accept' : seule l'invitee peut accepter
//   - action='reject' : seule l'invitee peut refuser
//   - action='cancel' : seul le capitaine ayant emis l'invite peut annuler
//
// Auth : x-api-key + actorDiscordUserId (lie au site).

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotPlayer } from '@/utils/botActor';
import { discordIdSchema, uuidSchema } from '@/utils/botValidation';
import {
  acceptInvitation,
  cancelInvitation,
  rejectInvitation,
} from '@/utils/teams/invitations';
import { logPlayerAction } from '@/utils/botPlayerLogs';

// action : trim + lowercase historique, puis enum strict. actorDiscordUserId
// est lu par requireBotPlayer sur le body brut ; on le valide aussi ici.
const invitationBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  action: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.enum(['accept', 'reject', 'cancel'])),
});
const invitationQuerySchema = z.object({ demandeId: uuidSchema });

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const { demandeId } = req.botQuery as z.infer<typeof invitationQuerySchema>;
  const { action } = req.botInput as z.infer<typeof invitationBodySchema>;

  const actor = await requireBotPlayer(
    req,
    res,
    (req.body ?? {}) as Record<string, unknown>
  );
  if (!actor) return;

  if (action === 'accept') {
    const result = await acceptInvitation(
      req.botContext.tenantId,
      demandeId,
      actor.authUserId
    );
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    void logPlayerAction({
      tenantId: req.botContext.tenantId,
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
    const result = await rejectInvitation(
      req.botContext.tenantId,
      demandeId,
      actor.authUserId
    );
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    void logPlayerAction({
      tenantId: req.botContext.tenantId,
      actorAuthUserId: actor.authUserId,
      actorDiscordUserId: actor.discordUserId,
      action: 'invite_reject',
      entityType: 'invitation',
      entityId: demandeId,
    });
    return res.status(200).json({ success: true, action: 'reject' });
  }

  // cancel
  const result = await cancelInvitation(
    req.botContext.tenantId,
    demandeId,
    actor.authUserId
  );
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  void logPlayerAction({
    tenantId: req.botContext.tenantId,
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
  bodySchema: invitationBodySchema,
  querySchema: invitationQuerySchema,
});
