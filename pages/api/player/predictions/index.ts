// pages/api/player/predictions/index.ts
//
// GET → les matchs à pronostiquer (à venir, encore ouverts, hors matchs de ses
// propres équipes) et ses derniers pronostics avec leur résultat. Alimente le
// panneau « Pronostics » de la page TCG.
//
// LA LISTE AFFICHE, ELLE NE DÉCIDE PAS. Le filtrage des matchs de ses équipes
// et du staff sert à ne pas proposer un bouton voué au refus ; l'autorité reste
// `PUT /api/player/predictions/{matchId}` et le déclencheur en base.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { getStaffByUserId, withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { logger } from '@/utils/logger';
import { readPlayerPredictions } from '@/utils/predictions/readState';

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenantId = resolveTenantIdForUserRequest(req);
  const staff = await getStaffByUserId(user.id);
  const read = await readPlayerPredictions({
    tenantId,
    userId: user.id,
    isStaff: Boolean(staff),
    now: new Date(),
  });
  if (!read.ok) {
    logger.error('[predictions] liste illisible: %s', read.error);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  return res.status(200).json(read.value);
});
