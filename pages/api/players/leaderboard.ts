// pages/api/players/leaderboard.ts
// API publique : classement des joueurs par rating Glicko-2 persistant.
// Lecture déléguée à `utils/rating/readLeaderboard` (partagée avec l'ISR de
// `pages/leaderboard.tsx`), tenant = DEFAULT_TENANT_ID (style maps/stats.ts).

import type { NextApiRequest, NextApiResponse } from 'next';
import { parsePagination } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';
import { logger } from '@/utils/logger';
import { readLeaderboard } from '@/utils/rating/readLeaderboard';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'players-leaderboard'
    )
  )
    return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { limit, offset } = parsePagination(req, {
    limit: 50,
    offset: 0,
    maxLimit: 200,
  });

  try {
    const tenantId = await resolveTenantIdForPublicRequestAsync(req);
    const response = await readLeaderboard(tenantId, limit, offset);

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=120'
    );
    return res.status(200).json(response);
  } catch (err) {
    if (err instanceof Error && err.message === 'Failed to load leaderboard') {
      return res.status(500).json({ error: 'Failed to load leaderboard' });
    }
    logger.error('[players/leaderboard] internal error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
