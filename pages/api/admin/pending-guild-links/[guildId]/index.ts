// pages/api/admin/pending-guild-links/[guildId]/index.ts
//
// S7 : DELETE rejette une demande de lien guild → tenant. Manager+ requis.
//
// TODO V2 : poster un signal vers le bot pour qu'il fasse `guild.leave()`
// automatiquement. En V1 c'est manuel.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';

const GUILD_ID_RE = /^[0-9]{15,25}$/;

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
      'admin-pending-guild-reject'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { guildId } = req.query;
  if (!guildId || typeof guildId !== 'string' || !GUILD_ID_RE.test(guildId)) {
    return res
      .status(400)
      .json({ error: 'Invalid guildId.', code: 'INVALID_GUILD_ID' });
  }

  const { data: existing, error: lookupErr } = await supabaseAdmin
    .from('pending_guild_links')
    .select('guild_id')
    .eq('guild_id', guildId)
    .maybeSingle();
  if (lookupErr) {
    logger.error(
      '[admin/pending-guild-links/[guildId]] lookup error',
      lookupErr
    );
    return res.status(500).json({ error: 'Failed to check pending link.' });
  }
  if (!existing) {
    return res.status(404).json({ error: 'No pending link for this guild.' });
  }

  const { error } = await supabaseAdmin
    .from('pending_guild_links')
    .delete()
    .eq('guild_id', guildId);
  if (error) {
    logger.error('[admin/pending-guild-links/[guildId]] delete error', error);
    return res.status(500).json({ error: 'Failed to delete pending link.' });
  }

  return res.status(200).json({ deleted: true, guild_id: guildId });
}

export default withStaffRoute(handler, 'manager');
