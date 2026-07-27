// GET /api/auth/battlenet/available
//
// Dit à une page ANONYME (la page de connexion) si la connexion Battle.net est
// disponible. Sans ça, la page devrait afficher un bouton qui mènerait à un 503
// quand la feature est dormante.
//
// N'expose qu'un booléen : la présence d'une intégration Blizzard, rien sur les
// identifiants. Le pendant authentifié, `/api/player/battlenet-status`, renvoie
// en plus l'état du lien de la joueuse connectée.

import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from '@/utils/rateLimit';
import { isBattlenetConfigured } from '@/utils/battlenet';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'battlenet-available')
  )
    return;

  return res.status(200).json({ configured: isBattlenetConfigured() });
}
