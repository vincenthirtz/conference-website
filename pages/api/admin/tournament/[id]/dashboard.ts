// pages/api/admin/tournament/[id]/dashboard.ts
// GET : retourne le payload du mega-dashboard (KPIs, signaux, guards, vélocité,
// activité staff récente, etc.). La logique vit dans utils/dashboard/buildTournamentDashboard.ts
// pour pouvoir être réutilisée par le SSR de /admin/tournament/[id]/dashboard
// et par /api/admin/alerts-summary (badge navbar).

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute } from '@/utils/staff';
import { fetchDashboardData } from '@/utils/dashboard/buildTournamentDashboard';
import type { DashboardData } from '@/utils/dashboard/buildTournamentDashboard';

type ApiResponse = DashboardData | { error: string };

export default withStaffRoute(handler, 'manager');

async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid tournament id' });
  }

  const result = await fetchDashboardData(String(id));
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  // Cache 30s, stale-while-revalidate 60s pour les gros tournois
  res.setHeader(
    'Cache-Control',
    'private, max-age=30, stale-while-revalidate=60'
  );
  return res.status(200).json(result.data);
}
