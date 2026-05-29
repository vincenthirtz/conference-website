// pages/api/caster/tournaments/index.ts
// Public read-only: list of tournaments for the caster app.
//
// The Electron caster used to query the `tournaments` table directly. This
// versioned HTTP endpoint decouples it from the DB schema. Tournament data is
// already public (shown on the site), so the posture matches /api/scrims:
// public GET, tenant-scoped read via supabaseAdmin.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';
import { applyRateLimit } from '@/utils/rateLimit';
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
      'caster-tournaments'
    )
  )
    return;

  if (!supabaseAdmin)
    return res.status(500).json({ error: 'Service unavailable' });

  const tenantId = resolveTenantIdForPublicRequest(req);

  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .select('id, name, slug, game, status, start_date, format_type')
    .eq('tenant_id', tenantId)
    .in('status', ['running', 'published'])
    .order('start_date', { ascending: false, nullsFirst: false });

  if (error) {
    logger.error('[caster/tournaments] list error:', error);
    return res.status(500).json({ error: 'Failed to load tournaments' });
  }

  return res.status(200).json({ tournaments: data ?? [] });
}
