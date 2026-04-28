// pages/api/admin/alerts-summary.ts
// GET : retourne le total d'alertes actives sur le tournoi "en cours"
// (ou un autre tournoi via ?tournament_id=). Utilisé par le badge navbar
// pour signaler "où ça brûle" sans charger tout le dashboard.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { resolveCurrentTournamentId } from '@/utils/currentTournament';
import {
  fetchDashboardData,
  computeAlertsSummary,
  type AlertsSummary,
} from '@/utils/dashboard/buildTournamentDashboard';

type ApiResponse = AlertsSummary | { error: string };

export default withStaffRoute(handler, 'caster');

async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 60 req/min/IP : la navbar poll toutes les ~60s, on a de la marge.
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-alerts-summary'
    )
  )
    return;

  // Allow override via query param, otherwise auto-resolve.
  let tournamentId: string | null = null;
  const rawId = req.query.tournament_id;
  if (typeof rawId === 'string' && rawId) {
    if (!isValidUUID(rawId)) {
      return res.status(400).json({ error: 'Invalid tournament_id' });
    }
    tournamentId = rawId;
  } else {
    tournamentId = await resolveCurrentTournamentId();
  }

  if (!tournamentId) {
    // Pas de tournoi en cours : pas d'alertes. Réponse 200 avec total=0.
    res.setHeader('Cache-Control', 'private, max-age=30');
    return res.status(200).json(computeAlertsSummary(null));
  }

  const result = await fetchDashboardData(tournamentId);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  res.setHeader('Cache-Control', 'private, max-age=30');
  return res.status(200).json(computeAlertsSummary(result.data));
}
