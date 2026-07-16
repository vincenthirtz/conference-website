// PATCH /api/admin/twitch/moderation/chat-settings
//
// Met à jour les réglages de chat (emote-only, sub-only, follower-only, slow
// mode) de la chaîne du broadcaster connecté.
//
// withStaffRoute(..., 'admin'). getValidBroadcasterToken + helixFetch.
//   409 { code:'NOT_CONNECTED' } / 403 { code:'MISSING_SCOPE' }.
//   Scope requis : moderator:manage:chat_settings.

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

const CHAT_SETTINGS_SCOPE = 'moderator:manage:chat_settings';

const ChatSettingsSchema = z
  .object({
    emote_mode: z.boolean().optional(),
    subscriber_mode: z.boolean().optional(),
    follower_mode: z.boolean().optional(),
    follower_mode_duration: z.number().int().min(0).max(129_600).optional(),
    slow_mode: z.boolean().optional(),
    slow_mode_wait_time: z.number().int().min(3).max(120).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one setting is required.',
  });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'twitch-mod-chat-settings'
    )
  )
    return;

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const parsed = ChatSettingsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }
  const settings = parsed.data;

  let token;
  try {
    token = await getValidBroadcasterToken(supabaseAdmin, ctx.tenantId);
  } catch (err) {
    logger.error(
      '[admin/twitch/moderation/chat-settings] token refresh error',
      err
    );
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
  if (!hasScope(token.scope, CHAT_SETTINGS_SCOPE)) {
    return res.status(403).json({
      error: `Scope manquant : ${CHAT_SETTINGS_SCOPE}. Reconnecte la chaîne.`,
      code: 'MISSING_SCOPE',
    });
  }

  try {
    const upstream = await helixFetch(
      token.accessToken,
      `/chat/settings?broadcaster_id=${encodeURIComponent(
        token.broadcasterId
      )}&moderator_id=${encodeURIComponent(token.broadcasterId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(settings),
      }
    );

    const json = (await upstream.json().catch(() => null)) as {
      data?: unknown[];
    } | null;

    if (!upstream.ok) {
      logger.error(
        '[admin/twitch/moderation/chat-settings] helix patch non-OK',
        upstream.status
      );
      return res.status(502).json({
        error: 'Twitch chat settings update failed.',
        code: 'TWITCH_HELIX_ERROR',
      });
    }

    const result = json?.data?.[0] ?? null;

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'twitch_moderation',
        entity_id: null,
        tenant_id: ctx.tenantId,
        payload: {
          action: 'twitch_chat_settings',
          keys: Object.keys(settings),
        },
      });
    }

    return res.status(200).json({ settings: result });
  } catch (err) {
    logger.error(
      '[admin/twitch/moderation/chat-settings] helix patch error',
      err
    );
    return res.status(502).json({
      error: 'Twitch chat settings update failed.',
      code: 'TWITCH_HELIX_ERROR',
    });
  }
}

export default withStaffRoute(handler, 'admin');
