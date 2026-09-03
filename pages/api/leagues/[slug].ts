// pages/api/leagues/[slug].ts
// API publique : détail d'une league (league + standings joins teams +
// tournois liés). 404 si league inconnue, non-publique, ou en draft.
//
// La logique de lecture vit dans `utils/leagues/readLeagueDetail.ts` (partagée
// avec l'ISR de `pages/leagues/[slug].tsx`). Ce handler ne fait que
// l'auth/rate-limit/validation + le mapping erreur → status.

import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from '@/utils/rateLimit';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';
import { logger } from '@/utils/logger';
import { readLeagueDetail } from '@/utils/leagues/readLeagueDetail';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'leagues-detail'))
    return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawSlug = req.query.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Missing slug' });
  }

  try {
    const tenantId = await resolveTenantIdForPublicRequestAsync(req);
    const response = await readLeagueDetail(slug, tenantId);
    if (!response) {
      return res.status(404).json({ error: 'League not found' });
    }
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=120, stale-while-revalidate=300'
    );
    return res.status(200).json(response);
  } catch (err) {
    logger.error('[leagues/slug] internal error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
