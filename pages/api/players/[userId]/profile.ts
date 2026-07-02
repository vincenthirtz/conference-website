// pages/api/players/[userId]/profile.ts
// API publique : profil complet d'un joueur (rating, courbe d'history,
// matches récents, head-to-head). 404 si le joueur n'a pas de player_ratings.
//
// La logique de lecture vit dans `utils/rating/readPlayerProfile.ts` (partagée
// avec l'ISR de `pages/player/[userId].tsx`). Ce handler ne fait que
// l'auth/rate-limit/validation + le mapping erreur → status.

import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from '@/utils/rateLimit';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';
import { logger } from '@/utils/logger';
import { readPlayerProfile } from '@/utils/rating/readPlayerProfile';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'players-profile')
  )
    return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawUserId = req.query.userId;
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'Missing userId' });
  }

  try {
    const tenantId = resolveTenantIdForPublicRequest(req);
    const response = await readPlayerProfile(userId, tenantId);
    if (!response) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=120'
    );
    return res.status(200).json(response);
  } catch (err) {
    logger.error('[players/profile] internal error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
