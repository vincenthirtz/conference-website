// pages/api/scrims/[id].ts
// Public: detail d'un scrim (par id OU par slug) + matchs associes.
// Seuls les scrims avec is_public = true et status != draft sont exposes.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { isValidUUID } from '@/utils/apiHelpers';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';
import { logger } from '../../../utils/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!supabaseAdmin)
    return res.status(500).json({ error: 'Service unavailable' });

  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const matchByUuid = isValidUUID(id);
  const tenantId = resolveTenantIdForPublicRequest(req);

  let scrimQuery = supabaseAdmin
    .from('scrims')
    .select(
      `
      id, name, slug, game, status,
      scheduled_date, timezone, logo_url, banner_url, description, stream_url,
      team1_id, team2_id,
      team1:teams!scrims_team1_id_fkey(id, name, short_name, slug, logo_url),
      team2:teams!scrims_team2_id_fkey(id, name, short_name, slug, logo_url)
    `
    )
    .eq('is_public', true)
    .eq('tenant_id', tenantId)
    .neq('status', 'draft');

  scrimQuery = matchByUuid ? scrimQuery.eq('id', id) : scrimQuery.eq('slug', id);

  const { data: scrim, error: scrimErr } = await scrimQuery.maybeSingle();
  if (scrimErr) {
    logger.error('[scrims/:id] fetch error:', scrimErr);
    return res.status(500).json({ error: 'Failed to load scrim' });
  }
  if (!scrim) return res.status(404).json({ error: 'Scrim not found' });

  const { data: matches, error: matchesErr } = await supabaseAdmin
    .from('matches')
    .select(
      `
      id, status, is_bye, best_of, match_format,
      team1_id, team2_id, team1_score, team2_score, winner_team_id, forfeit_team_id,
      scheduled_at, started_at, completed_at,
      stream_url, replay_url, lobby_code,
      team1:teams!matches_team1_id_fkey(id, name, short_name, logo_url),
      team2:teams!matches_team2_id_fkey(id, name, short_name, logo_url)
    `
    )
    .eq('scrim_id', scrim.id)
    .eq('tenant_id', tenantId)
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (matchesErr) {
    logger.error('[scrims/:id] matches error:', matchesErr);
  }

  return res.status(200).json({
    scrim,
    matches: matches ?? [],
  });
}
