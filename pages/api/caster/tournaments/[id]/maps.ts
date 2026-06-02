// pages/api/caster/tournaments/[id]/maps.ts
// Public read-only: enabled tournament maps, for the caster app.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { resolveTenantId } from '@/utils/tenant';
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
      'caster-tournament-maps'
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

  // Tenant via `x-tenant-id` header (caster desktop app); default fallback.
  const tenantId = resolveTenantId(req);

  const { data, error } = await supabaseAdmin
    .from('tournament_maps')
    .select('id, map_name, map_type, image_url')
    .eq('tournament_id', id)
    .eq('tenant_id', tenantId)
    .eq('enabled', true)
    .order('map_name', { ascending: true });

  if (error) {
    logger.error('[caster/tournaments/:id/maps] error:', error);
    return res.status(500).json({ error: 'Failed to load maps' });
  }

  return res.status(200).json({ maps: data ?? [] });
}
