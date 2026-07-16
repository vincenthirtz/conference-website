// pages/api/admin/tournament/[id]/dashboard.ts
// GET : retourne le payload du mega-dashboard (KPIs, signaux, guards, vélocité,
// activité staff récente, etc.). La logique vit dans utils/dashboard/buildTournamentDashboard.ts
// pour pouvoir être réutilisée par le SSR de /admin/tournament/[id]/dashboard
// et par /api/admin/alerts-summary (badge navbar).

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { fetchDashboardData } from '@/utils/dashboard/buildTournamentDashboard';
import type { DashboardData } from '@/utils/dashboard/buildTournamentDashboard';

type ApiResponse = DashboardData | { error: string };

export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid tournament id' });
  }

  // Defense-in-depth : on rejette les tournament_id d'un autre tenant avant
  // de deleguer au helper (qui est maintenant tenant-aware, S5c).
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable' });
  }
  const { data: tournamentRow } = await supabaseAdmin
    .from('tournaments')
    .select('id')
    .eq('id', String(id))
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!tournamentRow) {
    return res.status(404).json({ error: 'Tournament not found' });
  }

  const result = await fetchDashboardData(String(id), ctx.tenantId);
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
