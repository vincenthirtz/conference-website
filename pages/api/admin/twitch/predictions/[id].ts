// PATCH /api/admin/twitch/predictions/[id]
//
// Verrouille (LOCKED), résout (RESOLVED, winning_outcome_id requis) ou annule
// (CANCELED) une prediction Twitch existante.
//
// withStaffRoute(..., 'manager'). getValidBroadcasterToken + helixFetch.
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

const PREDICTIONS_SCOPE = 'channel:manage:predictions';

const PatchPredictionSchema = z
  .object({
    status: z.enum(['LOCKED', 'RESOLVED', 'CANCELED']),
    winning_outcome_id: z.string().trim().min(1).optional(),
  })
  .refine((v) => v.status !== 'RESOLVED' || !!v.winning_outcome_id, {
    message: 'winning_outcome_id is required when status is RESOLVED.',
    path: ['winning_outcome_id'],
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
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'twitch-pred-patch')
  )
    return;

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const rawId = req.query.id;
  const predictionId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!predictionId || predictionId.trim().length === 0) {
    return res.status(400).json({ error: 'Invalid prediction id.' });
  }

  const parsed = PatchPredictionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }
  const { status, winning_outcome_id } = parsed.data;

  let token;
  try {
    token = await getValidBroadcasterToken(supabaseAdmin, ctx.tenantId);
  } catch (err) {
    logger.error('[admin/twitch/predictions/[id]] token refresh error', err);
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
  if (!hasScope(token.scope, PREDICTIONS_SCOPE)) {
    return res.status(403).json({
      error: `Scope manquant : ${PREDICTIONS_SCOPE}. Reconnecte la chaîne.`,
      code: 'MISSING_SCOPE',
    });
  }

  const patchBody: Record<string, unknown> = {
    broadcaster_id: token.broadcasterId,
    id: predictionId,
    status,
  };
  if (status === 'RESOLVED' && winning_outcome_id) {
    patchBody.winning_outcome_id = winning_outcome_id;
  }

  try {
    const upstream = await helixFetch(token.accessToken, '/predictions', {
      method: 'PATCH',
      body: JSON.stringify(patchBody),
    });

    if (!upstream.ok) {
      logger.error(
        '[admin/twitch/predictions/[id]] helix patch non-OK',
        upstream.status
      );
      return res.status(502).json({
        error: 'Twitch prediction update failed.',
        code: 'TWITCH_HELIX_ERROR',
      });
    }

    const json = (await upstream.json().catch(() => null)) as {
      data?: unknown[];
    } | null;
    const prediction = json?.data?.[0] ?? null;

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'twitch_prediction',
        entity_id: predictionId,
        tenant_id: ctx.tenantId,
        payload: {
          action: 'update_twitch_prediction',
          status,
          hasWinner: !!winning_outcome_id,
        },
      });
    }

    return res.status(200).json({ prediction });
  } catch (err) {
    logger.error('[admin/twitch/predictions/[id]] helix patch error', err);
    return res.status(502).json({
      error: 'Twitch prediction update failed.',
      code: 'TWITCH_HELIX_ERROR',
    });
  }
}

export default withStaffRoute(handler, 'manager');
