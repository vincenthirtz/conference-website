// pages/api/player/predictions/leaderboard.ts
//
// GET  → le classement des pronostiqueuses de l'espace, ou d'un tournoi.
// PUT  → j'accepte (ou je retire) d'y être NOMMÉE.
//
// ON COMPTE TOUT LE MONDE, ON NE NOMME QUE SUR ACCORD. Le rang se calcule sur
// tous les pronostics réglés — sinon le classement mentirait sur qui est
// devant ; le nom n'apparaît que si la personne l'a accepté, et chacune voit
// toujours sa propre ligne. C'est la règle de la découverte entre joueuses :
// opt-in, derrière connexion, jamais un annuaire public.
//
// DERRIÈRE CONNEXION, ET PAS INDEXÉ : `withAuthRoute` + `no-store`. Un
// classement de spectatrices n'a rien à faire dans un moteur de recherche.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { logger } from '@/utils/logger';
import {
  readPredictionLeaderboard,
  setLeaderboardVisibility,
} from '@/utils/predictions/readLeaderboard';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  res.setHeader('Cache-Control', 'no-store');
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'PUT') {
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenantId = resolveTenantIdForUserRequest(req);

  if (method === 'PUT') {
    if (
      applyRateLimit(
        req,
        res,
        { max: 20, windowMs: 60_000 },
        'player-predictions-visibility'
      )
    ) {
      return;
    }
    const body = (req.body ?? {}) as { showInLeaderboard?: unknown };
    if (typeof body.showInLeaderboard !== 'boolean') {
      return res
        .status(400)
        .json({ error: 'Choix invalide.', code: 'invalid_choice' });
    }
    const saved = await setLeaderboardVisibility({
      tenantId,
      userId: user.id,
      show: body.showInLeaderboard,
    });
    if (!saved.ok) {
      logger.error('[predictions] préférence non enregistrée: %s', saved.error);
      return res.status(500).json({ error: 'Enregistrement impossible.' });
    }
    return res.status(200).json({ showsMyName: body.showInLeaderboard });
  }

  const rawTournament = req.query.tournamentId;
  const tournamentId =
    typeof rawTournament === 'string' && UUID_RE.test(rawTournament)
      ? rawTournament
      : null;

  const read = await readPredictionLeaderboard({
    tenantId,
    userId: user.id,
    tournamentId,
  });
  if (!read.ok) {
    logger.error('[predictions] classement illisible: %s', read.error);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  return res.status(200).json(read.value);
});
