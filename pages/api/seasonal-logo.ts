// /api/seasonal-logo — le logo d'événement à afficher AUJOURD'HUI, ou null.
//
// Public, lu par la navbar de chaque page. Ne rend QUE le logo en cours : le
// calendrier complet (le logo de Noël posé en octobre) reste côté admin.
//
// Cache CDN de 5 minutes : un logo qui arrive ou s'efface cinq minutes après
// minuit n'a aucune importance, une requête base par visite en aurait une.

import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from '@/utils/rateLimit';
import { getSetting } from '@/utils/siteSettings';
import {
  SEASONAL_LOGOS_SETTING_KEY,
  parseSeasonalLogos,
  pickActiveSeasonalLogo,
  todayInParis,
} from '@/utils/seasonalLogo';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'seasonal-logo'))
    return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const active = pickActiveSeasonalLogo(
    parseSeasonalLogos(await getSetting(SEASONAL_LOGOS_SETTING_KEY)),
    todayInParis()
  );

  res.setHeader(
    'Cache-Control',
    'public, s-maxage=300, stale-while-revalidate=600'
  );
  return res.status(200).json({
    logo: active ? { url: active.url, name: active.name } : null,
  });
}
