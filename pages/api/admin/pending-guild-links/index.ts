// pages/api/admin/pending-guild-links/index.ts
//
// S7 : liste les guilds Discord en attente de linkage (table
// `pending_guild_links`, remplie par `POST /api/bot/v1/tenants/link-guild`).
// Manager+ requis.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  _ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-pending-guild-links'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data, error } = await supabaseAdmin
    .from('pending_guild_links')
    .select('guild_id, guild_name, owner_discord_id, requested_at')
    .order('requested_at', { ascending: false });

  if (error) {
    logger.error('[admin/pending-guild-links] list error', error);
    return res
      .status(500)
      .json({ error: 'Failed to load pending guild links.' });
  }

  return res.status(200).json({ links: data ?? [] });
}

export default withStaffRoute(handler, 'manager');
