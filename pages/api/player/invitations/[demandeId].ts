// pages/api/player/invitations/[demandeId].ts
// POST — the authenticated player accepts or rejects a pending team invitation.
//
// Web (player) counterpart of the bot endpoint
// `/api/bot/v1/invitations/[demandeId]`. Uses web auth (Bearer → withAuthRoute)
// instead of the bot `x-api-key` + actorDiscordUserId. The acting user is the
// authenticated caller; only the invitee can accept/reject their own invite
// (cancel is captain-only and stays bot-side for now).
//
// Body: { action: 'accept' | 'reject' }.
//
// The business helpers (acceptInvitation / rejectInvitation) own the error
// semantics; we surface their { status, error } verbatim:
//   - not the invitee        → 403
//   - expired                → 410
//   - already on a team      → 409 (mapped from the helper's 400, see below)
//   - invitation not found   → 404
//   - already processed      → 409

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import { isValidUUID } from '@/utils/apiHelpers';
import { acceptInvitation, rejectInvitation } from '@/utils/teams/invitations';

const bodySchema = z.object({
  action: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.enum(['accept', 'reject'])),
});

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'player-invitations-action'
    )
  ) {
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate the path param at the boundary (helps CodeQL taint tracking too).
  const rawId = req.query.demandeId;
  const demandeId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!demandeId || !isValidUUID(demandeId)) {
    return res.status(400).json({ error: 'Invalid invitation id.' });
  }

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid action: expected 'accept' or 'reject'.",
    });
  }
  const { action } = parsed.data;

  const tenantId = await resolveTenantIdForUserRequestAsync(req, { authUserId: user.id });

  if (action === 'accept') {
    const result = await acceptInvitation(tenantId, demandeId, user.id);
    if (!result.ok) {
      // The helper returns 400 for the "already on a team" business conflict;
      // on the web surface we expose it as a 409 (state conflict) per the
      // contract. Other statuses (403 not-invitee, 404 not-found, 409 already
      // processed, 410 expired) pass through verbatim.
      const status =
        result.status === 400 && /déjà partie d'une équipe/i.test(result.error)
          ? 409
          : result.status;
      return res.status(status).json({ error: result.error });
    }
    return res.status(200).json({
      success: true,
      action: 'accept',
      teamId: result.data.teamId,
      memberId: result.data.memberId,
    });
  }

  // reject
  const result = await rejectInvitation(tenantId, demandeId, user.id);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  return res.status(200).json({ success: true, action: 'reject' });
});
