// GET /api/admin/twitch/channel-points/rewards
//
// Liste les rewards de points de chaîne gérables (only_manageable_rewards=true,
// c.-à-d. créés par NOTRE client_id — voir le caveat dans BOT_API_CONTRACT.md).
//
// withStaffRoute(..., 'manager'). getValidBroadcasterToken + helixFetch.
//   409 { code:'NOT_CONNECTED' } / 403 { code:'MISSING_SCOPE' }.
//   Scope requis : channel:read:redemptions.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logger } from '@/utils/logger';
import {
  getValidBroadcasterToken,
  helixFetch,
  hasScope,
} from '@/utils/twitchBroadcaster';

const REDEMPTIONS_READ_SCOPE = 'channel:read:redemptions';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'twitch-cp-rewards')
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

export default withStaffRoute(handler, 'manager');
