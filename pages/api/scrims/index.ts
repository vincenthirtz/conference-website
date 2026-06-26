// pages/api/scrims/index.ts
// Public: liste des scrims publics (visibles a tous).
// Seuls les scrims avec is_public = true sont exposes ; les drafts sont caches.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '../../../utils/logger';

// Canonical scrim status enum (mirrors `scrims.status` CHECK constraint and
// types/admin.ts ScrimStatus). The public list endpoint validates the `status`
// query param against this so an unknown value 400s loudly instead of silently
// returning an empty list.
const VALID_SCRIM_STATUSES = [
  'draft',
  'scheduled',
  'running',
  'completed',
  'cancelled',
] as const;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'scrims-list'))
    return;

  if (!supabaseAdmin)
    return res.status(500).json({ error: 'Service unavailable' });

  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const rawStatus = req.query.status;
  const statusQ = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;

  // Validate `status` BEFORE the .eq() : an unrecognised value would otherwise
  // match nothing and return `{ scrims: [] }` with a 200, which looks like
  // "no scrims" rather than "bad query". Reject explicitly.
  if (
    typeof statusQ === 'string' &&
    statusQ &&
    !(VALID_SCRIM_STATUSES as readonly string[]).includes(statusQ)
  ) {
    return res.status(400).json({
      error: `Invalid status. Expected one of: ${VALID_SCRIM_STATUSES.join(', ')}.`,
      code: 'INVALID_STATUS',
    });
  }

  const tenantId = resolveTenantIdForPublicRequest(req);

  let query = supabaseAdmin
    .from('scrims')
    .select(
      `
      id, name, slug, game, status,
      scheduled_date, timezone, logo_url, stream_url,
      team1_id, team2_id,
      team1:teams!scrims_team1_id_fkey(id, name, short_name, slug, logo_url),
      team2:teams!scrims_team2_id_fkey(id, name, short_name, slug, logo_url)
    `
    )
    .eq('is_public', true)
    .eq('tenant_id', tenantId)
    .neq('status', 'draft')
    .order('scheduled_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (typeof statusQ === 'string' && statusQ) {
    // Already validated against VALID_SCRIM_STATUSES above.
    query = query.eq('status', statusQ);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('[scrims] list error:', error);
    return res.status(500).json({ error: 'Failed to load scrims' });
  }

  return res.status(200).json({ scrims: data ?? [] });
}
