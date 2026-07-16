// POST /api/admin/twitch/moderation/ban
//
// Ban (permanent) ou timeout (duration en secondes) d'un utilisateur sur la
// chaîne du broadcaster connecté. Résout le login → user_id via helix/users.
//
// withStaffRoute(..., 'manager'). getValidBroadcasterToken + helixFetch.
//   409 { code:'NOT_CONNECTED' } / 403 { code:'MISSING_SCOPE' }.
//   400 { code:'USER_NOT_FOUND' } si le login est introuvable.
//   Scope requis : moderator:manage:banned_users.

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

const BAN_SCOPE = 'moderator:manage:banned_users';

const BanSchema = z.object({
  login: z.string().trim().min(1).max(25),
  duration: z.number().int().min(1).max(1_209_600).optional(),
  reason: z.string().trim().max(500).optional(),
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

  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'twitch-mod-ban'))
    return;

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const parsed = BanSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }
  const { login, duration, reason } = parsed.data;

  let token;
  try {
    token = await getValidBroadcasterToken(supabaseAdmin, ctx.tenantId);
  } catch (err) {
    logger.error('[admin/twitch/moderation/ban] token refresh error', err);
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
  if (!hasScope(token.scope, BAN_SCOPE)) {
    return res.status(403).json({
      error: `Scope manquant : ${BAN_SCOPE}. Reconnecte la chaîne.`,
      code: 'MISSING_SCOPE',
    });
  }

  // Résolution login → user_id.
  let targetUserId: string;
  try {
    const lookup = await helixFetch(
      token.accessToken,
      `/users?login=${encodeURIComponent(login)}`,
      { method: 'GET' }
    );
    if (!lookup.ok) {
      logger.error(
        '[admin/twitch/moderation/ban] helix users non-OK',
        lookup.status
      );
      return res.status(502).json({
        error: 'Twitch user lookup failed.',
        code: 'TWITCH_HELIX_ERROR',
      });
    }
    const lookupJson = (await lookup.json().catch(() => null)) as {
      data?: { id?: string }[];
    } | null;
    const found = lookupJson?.data?.[0]?.id;
    if (!found) {
      return res.status(400).json({
        error: `Utilisateur Twitch introuvable : ${login}.`,
        code: 'USER_NOT_FOUND',
      });
    }
    targetUserId = found;
  } catch (err) {
    logger.error('[admin/twitch/moderation/ban] helix users error', err);
    return res.status(502).json({
      error: 'Twitch user lookup failed.',
      code: 'TWITCH_HELIX_ERROR',
    });
  }

  const banData: Record<string, unknown> = { user_id: targetUserId };
  if (typeof duration === 'number') banData.duration = duration;
  if (reason) banData.reason = reason;

  try {
    const upstream = await helixFetch(
      token.accessToken,
      `/moderation/bans?broadcaster_id=${encodeURIComponent(
        token.broadcasterId
      )}&moderator_id=${encodeURIComponent(token.broadcasterId)}`,
      {
        method: 'POST',
        body: JSON.stringify({ data: banData }),
      }
    );

    const json = (await upstream.json().catch(() => null)) as {
      data?: unknown[];
    } | null;

    if (!upstream.ok) {
      logger.error(
        '[admin/twitch/moderation/ban] helix ban non-OK',
        upstream.status
      );
      return res.status(502).json({
        error: 'Twitch ban failed.',
        code: 'TWITCH_HELIX_ERROR',
      });
    }

    const result = json?.data?.[0] ?? null;

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'twitch_moderation',
        entity_id: targetUserId,
        tenant_id: ctx.tenantId,
        payload: {
          action: 'twitch_ban',
          login,
          permanent: typeof duration !== 'number',
          duration: duration ?? null,
          hasReason: !!reason,
        },
      });
    }

    return res.status(200).json({ result });
  } catch (err) {
    logger.error('[admin/twitch/moderation/ban] helix ban error', err);
    return res.status(502).json({
      error: 'Twitch ban failed.',
      code: 'TWITCH_HELIX_ERROR',
    });
  }
}

export default withStaffRoute(handler, 'manager');
