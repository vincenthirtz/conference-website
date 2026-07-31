// pages/api/scrims/ladder.ts
//
// GET — classement permanent des scrims (R8), PUBLIC.
//
// Public par nature : un classement dont on cache les résultats n'a pas
// d'intérêt, et il ne contient que des noms d'équipes et des scores agrégés —
// aucune donnée personnelle (contrairement aux disponibilités datées, qui
// restent derrière login).
//
// Calculé à la volée depuis `scrims` (cf. utils/scrims/ladder.ts) : pas de
// table de standings à maintenir, donc aucune dérive possible entre le résultat
// d'un scrim et le classement.

import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from '@/utils/rateLimit';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';
import { loadLadder, type LadderRow } from '@/utils/scrims/ladder';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ ladder: LadderRow[] } | { error: string }>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'scrim-ladder')) {
    return;
  }

  const tenantId = resolveTenantIdForPublicRequest(req);
  const ladder = await loadLadder(tenantId);

  res.setHeader(
    'Cache-Control',
    'public, max-age=60, stale-while-revalidate=300'
  );
  return res.status(200).json({ ladder });
}
