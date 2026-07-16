// /api/admin/twitch/channel-points/rewards/[id]
//
// PATCH  → met à jour un reward (activer/désactiver, mettre en pause, titre,
//          coût, prompt). ≥1 champ requis.
// DELETE → supprime un reward.
//
// ⚠️ Helix ne peut éditer/supprimer QUE les rewards créés par NOTRE client_id.
//    Un reward créé par le streamer ou une autre app renvoie 403/400 Helix ;
//    on remonte l'erreur proprement. Voir le caveat dans BOT_API_CONTRACT.md.
//
// withStaffRoute(..., 'manager'). getValidBroadcasterToken + helixFetch.
//   409 { code:'NOT_CONNECTED' } / 403 { code:'MISSING_SCOPE' }.
//   Scope requis : channel:manage:redemptions.

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

const REDEMPTIONS_MANAGE_SCOPE = 'channel:manage:redemptions';

const UpdateRewardSchema = z
  .object({
    is_enabled: z.boolean().optional(),
    is_paused: z.boolean().optional(),
    title: z.string().trim().min(1).max(45).optional(),
    cost: z.number().int().min(1).optional(),
    prompt: z.string().trim().max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field is required.',
  });

function getRewardId(req: NextApiRequest): string | null {
  const raw = req.query?.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function patchHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext,
  rewardId: string
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'twitch-cp-rewards-update'
    )
  )
    return;

  const parsed = UpdateRewardSchema.safeParse(req.body ?? {});
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
      '[admin/twitch/channel-points/rewards/id] token refresh error',
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
  const helixBody: Record<string, unknown> = {};
  if (body.is_enabled !== undefined) helixBody.is_enabled = body.is_enabled;
  if (body.is_paused !== undefined) helixBody.is_paused = body.is_paused;
  if (body.title !== undefined) helixBody.title = body.title;
  if (body.cost !== undefined) helixBody.cost = body.cost;
  if (body.prompt !== undefined) helixBody.prompt = body.prompt;

  try {
    const upstream = await helixFetch(
      token.accessToken,
      `/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(
        token.broadcasterId
      )}&id=${encodeURIComponent(rewardId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(helixBody),
      }
    );

    const json = (await upstream.json().catch(() => null)) as {
      data?: { id?: string }[];
      message?: string;
    } | null;

    if (!upstream.ok) {
      logger.error(
        '[admin/twitch/channel-points/rewards/id] helix update non-OK',
        upstream.status
      );
      const status =
        upstream.status === 400 || upstream.status === 403
          ? upstream.status
          : 502;
      return res.status(status).json({
        error:
          json?.message ||
          'Twitch reward update failed. Seuls les rewards créés par notre application sont éditables.',
        code:
          status === 400
            ? 'TWITCH_HELIX_BAD_REQUEST'
            : status === 403
              ? 'TWITCH_HELIX_FORBIDDEN'
              : 'TWITCH_HELIX_ERROR',
      });
    }

    const reward = json?.data?.[0] ?? null;

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'twitch_reward',
        entity_id: rewardId,
        tenant_id: ctx.tenantId,
        payload: {
          action: 'update_twitch_reward',
          fields: Object.keys(helixBody),
        },
      });
    }

    return res.status(200).json({ reward });
  } catch (err) {
    logger.error(
      '[admin/twitch/channel-points/rewards/id] helix update error',
      err
    );
    return res.status(502).json({
      error: 'Twitch reward update failed.',
      code: 'TWITCH_HELIX_ERROR',
    });
  }
}

async function deleteHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext,
  rewardId: string
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'twitch-cp-rewards-delete'
    )
  )
    return;

  let token;
  try {
    token = await getValidBroadcasterToken(supabaseAdmin!, ctx.tenantId);
  } catch (err) {
    logger.error(
      '[admin/twitch/channel-points/rewards/id] token refresh error',
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

  try {
    const upstream = await helixFetch(
      token.accessToken,
      `/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(
        token.broadcasterId
      )}&id=${encodeURIComponent(rewardId)}`,
      { method: 'DELETE' }
    );

    if (!upstream.ok) {
      const json = (await upstream.json().catch(() => null)) as {
        message?: string;
      } | null;
      logger.error(
        '[admin/twitch/channel-points/rewards/id] helix delete non-OK',
        upstream.status
      );
      const status =
        upstream.status === 400 || upstream.status === 403
          ? upstream.status
          : 502;
      return res.status(status).json({
        error:
          json?.message ||
          'Twitch reward deletion failed. Seuls les rewards créés par notre application sont supprimables.',
        code:
          status === 400
            ? 'TWITCH_HELIX_BAD_REQUEST'
            : status === 403
              ? 'TWITCH_HELIX_FORBIDDEN'
              : 'TWITCH_HELIX_ERROR',
      });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'twitch_reward',
        entity_id: rewardId,
        tenant_id: ctx.tenantId,
        payload: { action: 'delete_twitch_reward' },
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    logger.error(
      '[admin/twitch/channel-points/rewards/id] helix delete error',
      err
    );
    return res.status(502).json({
      error: 'Twitch reward deletion failed.',
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

  const rewardId = getRewardId(req);
  if (!rewardId) {
    return res
      .status(400)
      .json({ error: 'Missing reward id.', code: 'INVALID_PAYLOAD' });
  }

  if (req.method === 'PATCH') return patchHandler(req, res, ctx, rewardId);
  if (req.method === 'DELETE') return deleteHandler(req, res, ctx, rewardId);
  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'manager');
