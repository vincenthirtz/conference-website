// pages/api/caster/matches/[id].ts
// Public read-only: single match detail + its games, for the caster app.
// Mirrors the columns the caster's tournaments.js reads directly today.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'caster-match'))
    return;

  if (!supabaseAdmin)
    return res.status(500).json({ error: 'Service unavailable' });

  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid match id' });
  }

  const tenantId = resolveTenantIdForPublicRequest(req);

  const { data: match, error: matchErr } = await supabaseAdmin
    .from('matches')
    .select(
      `
      id, status, best_of, match_format, scheduled_at,
      team1_score, team2_score, round_name,
      team1:teams!matches_team1_id_fkey(id, name, short_name, logo_url),
      team2:teams!matches_team2_id_fkey(id, name, short_name, logo_url)
    `
    )
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (matchErr) {
    logger.error('[caster/matches/:id] match error:', matchErr);
    return res.status(500).json({ error: 'Failed to load match' });
  }
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  const { data: games, error: gamesErr } = await supabaseAdmin
    .from('games')
    .select('id, map_name, map_order, team1_score, team2_score')
    .eq('match_id', id)
    .eq('tenant_id', tenantId)
    .order('map_order', { ascending: true });

  if (gamesErr) {
    logger.error('[caster/matches/:id] games error:', gamesErr);
    return res.status(500).json({ error: 'Failed to load games' });
  }

  return res.status(200).json({ match, games: games ?? [] });
}
