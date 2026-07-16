// POST /api/admin/twitch/marker
//
// Pose un stream marker sur le live en cours du broadcaster connecté (repère les
// temps forts pour le montage du VOD). Renvoie { marker }.
//
// withStaffRoute(..., 'manager'). getValidBroadcasterToken + helixFetch.
//   409 { code:'NOT_CONNECTED' } / 403 { code:'MISSING_SCOPE' }.
//   Scope requis : channel:manage:broadcast.
//
// Helix renvoie 404 si la chaîne n'est PAS en live (aucun stream à marquer) →
// on mappe en 409 { code:'NOT_LIVE' }.

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

const BROADCAST_SCOPE = 'channel:manage:broadcast';

const MarkerSchema = z.object({
  description: z.string().trim().max(140).optional(),
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

  if (applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'twitch-marker'))
    return;

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const parsed = MarkerSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }
  const { description } = parsed.data;

  let token;
  try {
    token = await getValidBroadcasterToken(supabaseAdmin, ctx.tenantId);
  } catch (err) {
    logger.error('[admin/twitch/marker] token refresh error', err);
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
  if (!hasScope(token.scope, BROADCAST_SCOPE)) {
    return res.status(403).json({
      error: `Scope manquant : ${BROADCAST_SCOPE}. Reconnecte la chaîne.`,
      code: 'MISSING_SCOPE',
    });
  }

  // Corps Helix : typé depuis le schéma parsé (pas d'input brut).
  const helixBody: Record<string, unknown> = { user_id: token.broadcasterId };
  if (description !== undefined) helixBody.description = description;

  try {
    const upstream = await helixFetch(token.accessToken, '/streams/markers', {
      method: 'POST',
      body: JSON.stringify(helixBody),
    });

    // 404 = pas de stream en cours à marquer → business-state conflict.
    if (upstream.status === 404) {
      return res.status(409).json({
        error: "La chaîne n'est pas en live : aucun marker à poser.",
        code: 'NOT_LIVE',
      });
    }

    const json = (await upstream.json().catch(() => null)) as {
      data?: { id?: string }[];
    } | null;

    if (!upstream.ok) {
      logger.error(
        '[admin/twitch/marker] helix create non-OK',
        upstream.status
      );
      return res.status(502).json({
        error: 'Twitch stream marker failed.',
        code: 'TWITCH_HELIX_ERROR',
      });
    }

    const marker = json?.data?.[0] ?? null;

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'twitch_marker',
        entity_id: marker?.id ?? null,
        tenant_id: ctx.tenantId,
        payload: { action: 'create_twitch_marker' },
      });
    }

    return res.status(200).json({ marker });
  } catch (err) {
    logger.error('[admin/twitch/marker] helix create error', err);
    return res.status(502).json({
      error: 'Twitch stream marker failed.',
      code: 'TWITCH_HELIX_ERROR',
    });
  }
}

export default withStaffRoute(handler, 'manager');
