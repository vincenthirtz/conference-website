// /api/admin/twitch/predictions
//
// POST → crée une prediction Twitch sur la chaîne du broadcaster connecté.
// GET  → renvoie la prediction la plus récente (ou null).
//
// withStaffRoute(..., 'manager') (write régie). Passe par
// getValidBroadcasterToken (refresh proactif + déchiffrement) puis helixFetch.
//
// Codes métier :
//   409 { code:'NOT_CONNECTED' }  → aucune chaîne connectée pour le tenant.
//   403 { code:'MISSING_SCOPE' }  → scope 'channel:manage:predictions' absent.

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

const CreatePredictionSchema = z.object({
  title: z.string().trim().min(1).max(45),
  outcomes: z.array(z.string().trim().min(1).max(25)).min(2).max(10),
  prediction_window: z.number().int().min(30).max(1800),
});

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
      'twitch-pred-create'
    )
  )
    return;

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const parsed = CreatePredictionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }
  const { title, outcomes, prediction_window } = parsed.data;

  let token;
  try {
    token = await getValidBroadcasterToken(supabaseAdmin, ctx.tenantId);
  } catch (err) {
    logger.error('[admin/twitch/predictions] token refresh error', err);
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

  try {
    const upstream = await helixFetch(token.accessToken, '/predictions', {
      method: 'POST',
      body: JSON.stringify({
        broadcaster_id: token.broadcasterId,
        title,
        outcomes: outcomes.map((t) => ({ title: t })),
        prediction_window,
      }),
    });

    const json = (await upstream.json().catch(() => null)) as {
      data?: unknown[];
    } | null;

    if (!upstream.ok) {
      logger.error(
        '[admin/twitch/predictions] helix create non-OK',
        upstream.status
      );
      return res.status(502).json({
        error: 'Twitch prediction creation failed.',
        code: 'TWITCH_HELIX_ERROR',
      });
    }

    const prediction = json?.data?.[0] ?? null;

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'twitch_prediction',
        entity_id: (prediction as { id?: string } | null)?.id ?? null,
        tenant_id: ctx.tenantId,
        payload: {
          action: 'create_twitch_prediction',
          title,
          outcomeCount: outcomes.length,
          prediction_window,
        },
      });
    }

    return res.status(201).json({ prediction });
  } catch (err) {
    logger.error('[admin/twitch/predictions] helix create error', err);
    return res.status(502).json({
      error: 'Twitch prediction creation failed.',
      code: 'TWITCH_HELIX_ERROR',
    });
  }
}

async function getHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'twitch-pred-get')
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
    logger.error('[admin/twitch/predictions] token refresh error', err);
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

  try {
    const upstream = await helixFetch(
      token.accessToken,
      `/predictions?broadcaster_id=${encodeURIComponent(
        token.broadcasterId
      )}&first=1`,
      { method: 'GET' }
    );

    if (!upstream.ok) {
      logger.error(
        '[admin/twitch/predictions] helix list non-OK',
        upstream.status
      );
      return res.status(502).json({
        error: 'Twitch predictions fetch failed.',
        code: 'TWITCH_HELIX_ERROR',
      });
    }

    const json = (await upstream.json().catch(() => null)) as {
      data?: unknown[];
    } | null;
    const prediction = json?.data?.[0] ?? null;

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ prediction });
  } catch (err) {
    logger.error('[admin/twitch/predictions] helix list error', err);
    return res.status(502).json({
      error: 'Twitch predictions fetch failed.',
      code: 'TWITCH_HELIX_ERROR',
    });
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method === 'POST') return postHandler(req, res, ctx);
  if (req.method === 'GET') return getHandler(req, res, ctx);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'manager');
