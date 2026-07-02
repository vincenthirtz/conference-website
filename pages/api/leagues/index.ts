// pages/api/leagues/index.ts
// API publique : liste des leagues publiques (is_public=true, status≠draft).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';
import { logger } from '@/utils/logger';
import type { League, LeaguesListResponse } from '@/types/leagues';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'leagues-list'))
    return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const tenantId = resolveTenantIdForPublicRequest(req);
    const { data, error } = await supabaseAdmin
      .from('leagues')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_public', true)
      .neq('status', 'draft')
      .order('created_at', { ascending: false });
    if (error) {
      logger.error('[leagues] list error', error);
      return res.status(500).json({ error: 'Failed to load leagues' });
    }

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=120, stale-while-revalidate=300'
    );
    const response: LeaguesListResponse = {
      leagues: (data ?? []) as League[],
    };
    return res.status(200).json(response);
  } catch (err) {
    logger.error('[leagues] internal error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
