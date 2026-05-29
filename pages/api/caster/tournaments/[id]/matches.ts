// pages/api/caster/tournaments/[id]/matches.ts
// Public read-only: matches for a tournament, for the caster app.
// Mirrors the shape the caster's tournaments.js reads directly today.

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

  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'caster-tournament-matches'
    )
  )
    return;

  if (!supabaseAdmin)
    return res.status(500).json({ error: 'Service unavailable' });

  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament id' });
  }

  const tenantId = resolveTenantIdForPublicRequest(req);

  const { data, error } = await supabaseAdmin
    .from('matches')
    .select(
      `
      id, status, best_of, match_format, scheduled_at,
      team1_score, team2_score, round_name, stream_url,
      team1:teams!matches_team1_id_fkey(id, name, short_name, logo_url),
      team2:teams!matches_team2_id_fkey(id, name, short_name, logo_url)
    `
    )
    .eq('tournament_id', id)
    .eq('tenant_id', tenantId)
    .in('status', ['pending', 'ongoing', 'finished'])
    .order('scheduled_at', { ascending: true, nullsFirst: false });

  if (error) {
    logger.error('[caster/tournaments/:id/matches] error:', error);
    return res.status(500).json({ error: 'Failed to load matches' });
  }

  return res.status(200).json({ matches: data ?? [] });
}
