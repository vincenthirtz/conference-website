// POST /api/admin/twitch/moderation/clear
//
// Vide le chat de la chaîne du broadcaster connecté (DELETE helix/moderation/chat).
//
// withStaffRoute(..., 'manager'). getValidBroadcasterToken + helixFetch.
//   409 { code:'NOT_CONNECTED' } / 403 { code:'MISSING_SCOPE' }.
//   Scope requis : moderator:manage:chat_messages.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import {
  getValidBroadcasterToken,
  helixFetch,
  hasScope,
} from '@/utils/twitchBroadcaster';

const CLEAR_SCOPE = 'moderator:manage:chat_messages';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'twitch-mod-clear')
  )
    return;

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  let token;
  try {
    token = await getValidBroadcasterToken(supabaseAdmin, ctx.tenantId);
  } catch (err) {
    logger.error('[admin/twitch/moderation/clear] token refresh error', err);
    return res.status(502).json({
      error: 'Twitch token unavailable (refresh failed).',
      code: 'TWITCH_TOKEN_ERROR',
    });
  }
  if (!token) {
    return res.status(409).json({
      error: 'Aucune chaîne Twitch connectée.',
      code: 'NOT_CONNECTED',
    });
  }
  if (!hasScope(token.scope, CLEAR_SCOPE)) {
    return res.status(403).json({
      error: `Scope manquant : ${CLEAR_SCOPE}. Reconnecte la chaîne.`,
      code: 'MISSING_SCOPE',
    });
  }

  try {
    const upstream = await helixFetch(
      token.accessToken,
      `/moderation/chat?broadcaster_id=${encodeURIComponent(
        token.broadcasterId
      )}&moderator_id=${encodeURIComponent(token.broadcasterId)}`,
      { method: 'DELETE' }
    );

    if (!upstream.ok) {
      logger.error(
        '[admin/twitch/moderation/clear] helix clear non-OK',
        upstream.status
      );
      return res.status(502).json({
        error: 'Twitch chat clear failed.',
        code: 'TWITCH_HELIX_ERROR',
      });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'twitch_moderation',
        entity_id: null,
        tenant_id: ctx.tenantId,
        payload: { action: 'twitch_clear_chat' },
      });
    }

    return res.status(200).json({ cleared: true });
  } catch (err) {
    logger.error('[admin/twitch/moderation/clear] helix clear error', err);
    return res.status(502).json({
      error: 'Twitch chat clear failed.',
      code: 'TWITCH_HELIX_ERROR',
    });
  }
}

export default withStaffRoute(handler, 'manager');
