// POST /api/admin/twitch/clip
//
// Capture un clip (~30 dernières secondes) sur la chaîne du broadcaster
// connecté. Renvoie { id, edit_url }.
//
// withStaffRoute(..., 'manager'). getValidBroadcasterToken + helixFetch.
//   409 { code:'NOT_CONNECTED' } / 403 { code:'MISSING_SCOPE' }.
//   Scope requis : clips:edit.

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

const CLIP_SCOPE = 'clips:edit';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'twitch-clip'))
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
    logger.error('[admin/twitch/clip] token refresh error', err);
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
  if (!hasScope(token.scope, CLIP_SCOPE)) {
    return res.status(403).json({
      error: `Scope manquant : ${CLIP_SCOPE}. Reconnecte la chaîne.`,
      code: 'MISSING_SCOPE',
    });
  }

  try {
    const upstream = await helixFetch(
      token.accessToken,
      `/clips?broadcaster_id=${encodeURIComponent(token.broadcasterId)}`,
      { method: 'POST' }
    );

    const json = (await upstream.json().catch(() => null)) as {
      data?: { id?: string; edit_url?: string }[];
    } | null;

    if (!upstream.ok) {
      logger.error('[admin/twitch/clip] helix create non-OK', upstream.status);
      return res.status(502).json({
        error: 'Twitch clip creation failed.',
        code: 'TWITCH_HELIX_ERROR',
      });
    }

    const clip = json?.data?.[0] ?? null;
    const id = clip?.id ?? null;
    const editUrl = clip?.edit_url ?? null;

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'twitch_clip',
        entity_id: id,
        tenant_id: ctx.tenantId,
        payload: { action: 'create_twitch_clip' },
      });
    }

    return res.status(200).json({ id, edit_url: editUrl });
  } catch (err) {
    logger.error('[admin/twitch/clip] helix create error', err);
    return res.status(502).json({
      error: 'Twitch clip creation failed.',
      code: 'TWITCH_HELIX_ERROR',
    });
  }
}

export default withStaffRoute(handler, 'manager');
