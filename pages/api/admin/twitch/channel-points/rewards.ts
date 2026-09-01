// /api/admin/twitch/channel-points/rewards
//
// GET  → liste les rewards de points de chaîne gérables
//        (only_manageable_rewards=true, c.-à-d. créés par NOTRE client_id —
//        voir le caveat dans BOT_API_CONTRACT.md). Scope channel:read:redemptions.
// POST → crée un nouveau reward. Scope channel:manage:redemptions.
//
// withStaffRoute(..., { permission: 'manage_broadcast' }). getValidBroadcasterToken + helixFetch.
//   409 { code:'NOT_CONNECTED' } / 403 { code:'MISSING_SCOPE' }.

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

const CreateRewardSchema = z.object({
  title: z.string().trim().min(1).max(45),
  cost: z.number().int().min(1),
  prompt: z.string().trim().max(200).optional(),
  is_enabled: z.boolean().optional().default(true),
  is_user_input_required: z.boolean().optional(),
  background_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Expected #RRGGBB')
    .optional(),
  should_redemptions_skip_request_queue: z.boolean().optional(),
});

async function getHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'twitch-cp-rewards')
  )
    return;

  let token;
  try {
    token = await getValidBroadcasterToken(supabaseAdmin!, ctx.tenantId);
  } catch (err) {
    logger.error(
      '[admin/twitch/channel-points/rewards] token refresh error',
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
      `/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(
        token.broadcasterId
      )}&only_manageable_rewards=true`,
      { method: 'GET' }
    );

    if (!upstream.ok) {
      logger.error(
        '[admin/twitch/channel-points/rewards] helix list non-OK',
        upstream.status
      );
      return res.status(502).json({
        error: 'Twitch rewards fetch failed.',
        code: 'TWITCH_HELIX_ERROR',
      });
    }

    const json = (await upstream.json().catch(() => null)) as {
      data?: unknown[];
    } | null;

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ rewards: json?.data ?? [] });
  } catch (err) {
    logger.error('[admin/twitch/channel-points/rewards] helix list error', err);
    return res.status(502).json({
      error: 'Twitch rewards fetch failed.',
      code: 'TWITCH_HELIX_ERROR',
    });
  }
}

async function postHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'twitch-cp-rewards-create'
    )
  )
    return;

  const parsed = CreateRewardSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }
  const body = parsed.data;

  let token;
  try {
    token = await getValidBroadcasterToken(supabaseAdmin!, ctx.tenantId);
  } catch (err) {
    logger.error(
      '[admin/twitch/channel-points/rewards] token refresh error',
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

  // Corps Helix : typé depuis le schéma parsé (pas d'input brut).
  const helixBody: Record<string, unknown> = {
    title: body.title,
    cost: body.cost,
    is_enabled: body.is_enabled,
  };
  if (body.prompt !== undefined) helixBody.prompt = body.prompt;
  if (body.is_user_input_required !== undefined)
    helixBody.is_user_input_required = body.is_user_input_required;
  if (body.background_color !== undefined)
    helixBody.background_color = body.background_color;
  if (body.should_redemptions_skip_request_queue !== undefined)
    helixBody.should_redemptions_skip_request_queue =
      body.should_redemptions_skip_request_queue;

  try {
    const upstream = await helixFetch(
      token.accessToken,
      `/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(
        token.broadcasterId
      )}`,
      {
        method: 'POST',
        body: JSON.stringify(helixBody),
      }
    );

    const json = (await upstream.json().catch(() => null)) as {
      data?: { id?: string }[];
      message?: string;
    } | null;

    if (!upstream.ok) {
      logger.error(
        '[admin/twitch/channel-points/rewards] helix create non-OK',
        upstream.status
      );
      // Remonte proprement les erreurs Helix (ex. 400 titre en double).
      const status = upstream.status === 400 ? 400 : 502;
      return res.status(status).json({
        error:
          json?.message ||
          'Twitch reward creation failed. Seuls les rewards créés par notre application sont gérables.',
        code:
          status === 400 ? 'TWITCH_HELIX_BAD_REQUEST' : 'TWITCH_HELIX_ERROR',
      });
    }

    const reward = json?.data?.[0] ?? null;

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'twitch_reward',
        entity_id: reward?.id ?? null,
        tenant_id: ctx.tenantId,
        payload: {
          action: 'create_twitch_reward',
          title: body.title,
          cost: body.cost,
        },
      });
    }

    return res.status(200).json({ reward });
  } catch (err) {
    logger.error(
      '[admin/twitch/channel-points/rewards] helix create error',
      err
    );
    return res.status(502).json({
      error: 'Twitch reward creation failed.',
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
  if (req.method === 'POST') return postHandler(req, res, ctx);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, { permission: 'manage_broadcast' });
