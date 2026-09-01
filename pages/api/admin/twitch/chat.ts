// POST /api/admin/twitch/chat
//
// Envoie un message dans le chat de la chaîne du broadcaster connecté.
//
// withStaffRoute(..., { permission: 'manage_broadcast' }). getValidBroadcasterToken + helixFetch.
//   409 { code:'NOT_CONNECTED' } / 403 { code:'MISSING_SCOPE' }.
//   Scope requis : user:write:chat.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
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

const CHAT_SCOPE = 'user:write:chat';

const SendChatSchema = z.object({
  message: z.string().trim().min(1).max(500),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'twitch-chat'))
    return;

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const parsed = SendChatSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }
  const { message } = parsed.data;

  let token;
  try {
    token = await getValidBroadcasterToken(supabaseAdmin, ctx.tenantId);
  } catch (err) {
    logger.error('[admin/twitch/chat] token refresh error', err);
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
  if (!hasScope(token.scope, CHAT_SCOPE)) {
    return res.status(403).json({
      error: `Scope manquant : ${CHAT_SCOPE}. Reconnecte la chaîne.`,
      code: 'MISSING_SCOPE',
    });
  }

  try {
    const upstream = await helixFetch(token.accessToken, '/chat/messages', {
      method: 'POST',
      body: JSON.stringify({
        broadcaster_id: token.broadcasterId,
        sender_id: token.broadcasterId,
        message,
      }),
    });

    const json = (await upstream.json().catch(() => null)) as {
      data?: unknown[];
    } | null;

    if (!upstream.ok) {
      logger.error('[admin/twitch/chat] helix send non-OK', upstream.status);
      return res.status(502).json({
        error: 'Twitch chat message failed.',
        code: 'TWITCH_HELIX_ERROR',
      });
    }

    const result = json?.data?.[0] ?? null;

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'twitch_chat',
        entity_id: null,
        tenant_id: ctx.tenantId,
        payload: {
          action: 'send_twitch_chat',
          length: message.length,
        },
      });
    }

    return res.status(200).json({ result });
  } catch (err) {
    logger.error('[admin/twitch/chat] helix send error', err);
    return res.status(502).json({
      error: 'Twitch chat message failed.',
      code: 'TWITCH_HELIX_ERROR',
    });
  }
}

export default withStaffRoute(handler, { permission: 'manage_broadcast' });
