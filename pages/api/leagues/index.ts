// pages/api/leagues/index.ts
// API publique : liste des leagues publiques (is_public=true, status≠draft).
// Lecture déléguée à `utils/leagues/readPublicLeagues` (partagée avec l'ISR de
// `pages/leagues/index.tsx`).

import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from '@/utils/rateLimit';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';
import { logger } from '@/utils/logger';
import { readPublicLeagues } from '@/utils/leagues/readPublicLeagues';

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
    const response = await readPublicLeagues(tenantId);

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=120, stale-while-revalidate=300'
    );
    return res.status(200).json(response);
  } catch (err) {
    if (err instanceof Error && err.message === 'Failed to load leagues') {
      return res.status(500).json({ error: 'Failed to load leagues' });
    }
    logger.error('[leagues] internal error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
