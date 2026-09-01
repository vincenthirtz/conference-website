// /api/admin/twitch/channel-points/redemptions
//
// GET   → liste les demandes (redemptions) d'un reward (par défaut UNFULFILLED).
// PATCH → résout (FULFILLED) ou refuse (CANCELED) un lot de demandes.
//
// ⚠️ Helix ne gère QUE les redemptions des rewards créés par NOTRE client_id
//    (only_manageable_rewards). Voir le caveat dans BOT_API_CONTRACT.md.
//
// withStaffRoute(..., { permission: 'manage_broadcast' }). getValidBroadcasterToken + helixFetch.
//   409 { code:'NOT_CONNECTED' } / 403 { code:'MISSING_SCOPE' }.
//   GET   → scope channel:read:redemptions.
//   PATCH → scope channel:manage:redemptions.

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

const REDEMPTIONS_READ_SCOPE = 'channel:read:redemptions';
const REDEMPTIONS_MANAGE_SCOPE = 'channel:manage:redemptions';

const GetQuerySchema = z.object({
  reward_id: z.string().trim().min(1),
  status: z
    .enum(['UNFULFILLED', 'FULFILLED', 'CANCELED'])
    .optional()
    .default('UNFULFILLED'),
});

const PatchSchema = z.object({
  reward_id: z.string().trim().min(1),
  redemption_ids: z.array(z.string().trim().min(1)).min(1).max(50),
  status: z.enum(['FULFILLED', 'CANCELED']),
});

async function getHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'twitch-cp-redemptions-get'
    )
  )
    return;

  const parsed = GetQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query.',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }
  const { reward_id, status } = parsed.data;

  let token;
  try {
    token = await getValidBroadcasterToken(supabaseAdmin!, ctx.tenantId);
  } catch (err) {
    logger.error(
      '[admin/twitch/channel-points/redemptions] token refresh error',
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
  if (!hasScope(token.scope, REDEMPTIONS_READ_SCOPE)) {
    return res.status(403).json({
      error: `Scope manquant : ${REDEMPTIONS_READ_SCOPE}. Reconnecte la chaîne.`,
      code: 'MISSING_SCOPE',
    });
  }

  try {
    const upstream = await helixFetch(
      token.accessToken,
      `/channel_points/custom_rewards/redemptions?broadcaster_id=${encodeURIComponent(
        token.broadcasterId
      )}&reward_id=${encodeURIComponent(reward_id)}&status=${encodeURIComponent(
        status
      )}`,
      { method: 'GET' }
    );

    if (!upstream.ok) {
      logger.error(
        '[admin/twitch/channel-points/redemptions] helix list non-OK',
        upstream.status
      );
      return res.status(502).json({
        error: 'Twitch redemptions fetch failed.',
        code: 'TWITCH_HELIX_ERROR',
      });
    }

    const json = (await upstream.json().catch(() => null)) as {
      data?: unknown[];
    } | null;

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ redemptions: json?.data ?? [] });
  } catch (err) {
    logger.error(
      '[admin/twitch/channel-points/redemptions] helix list error',
      err
    );
    return res.status(502).json({
      error: 'Twitch redemptions fetch failed.',
      code: 'TWITCH_HELIX_ERROR',
    });
  }
}

async function patchHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'twitch-cp-redemptions-patch'
    )
  )
    return;

  const parsed = PatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }
  const { reward_id, redemption_ids, status } = parsed.data;

  let token;
  try {
    token = await getValidBroadcasterToken(supabaseAdmin!, ctx.tenantId);
  } catch (err) {
    logger.error(
      '[admin/twitch/channel-points/redemptions] token refresh error',
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
  if (!hasScope(token.scope, REDEMPTIONS_MANAGE_SCOPE)) {
    return res.status(403).json({
      error: `Scope manquant : ${REDEMPTIONS_MANAGE_SCOPE}. Reconnecte la chaîne.`,
      code: 'MISSING_SCOPE',
    });
  }

  const idParams = redemption_ids
    .map((id) => `&id=${encodeURIComponent(id)}`)
    .join('');

  try {
    const upstream = await helixFetch(
      token.accessToken,
      `/channel_points/custom_rewards/redemptions?broadcaster_id=${encodeURIComponent(
        token.broadcasterId
      )}&reward_id=${encodeURIComponent(reward_id)}${idParams}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    );

    if (!upstream.ok) {
      logger.error(
        '[admin/twitch/channel-points/redemptions] helix patch non-OK',
        upstream.status
      );
      return res.status(502).json({
        error: 'Twitch redemptions update failed.',
        code: 'TWITCH_HELIX_ERROR',
      });
    }

    const json = (await upstream.json().catch(() => null)) as {
      data?: unknown[];
    } | null;

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'twitch_redemption',
        entity_id: reward_id,
        tenant_id: ctx.tenantId,
        payload: {
          action: 'update_twitch_redemptions',
          status,
          count: redemption_ids.length,
        },
      });
    }

    return res.status(200).json({ redemptions: json?.data ?? [] });
  } catch (err) {
    logger.error(
      '[admin/twitch/channel-points/redemptions] helix patch error',
      err
    );
    return res.status(502).json({
      error: 'Twitch redemptions update failed.',
      code: 'TWITCH_HELIX_ERROR',
    });
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  if (req.method === 'GET') return getHandler(req, res, ctx);
  if (req.method === 'PATCH') return patchHandler(req, res, ctx);
  res.setHeader('Allow', 'GET, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, { permission: 'manage_broadcast' });
