// pages/api/admin/leagues/[id]/recompute.ts
// POST → recalcule les standings d'une league à partir des final_rankings
// des tournois liés ET des scrims rattachés, puis remplace league_standings.
// → { standings_count }.
//
// Le calcul lui-même vit dans `utils/leagues/recomputeLeagueStandings.ts`
// (réutilisable hors HTTP) ; ce handler ne porte que l'auth staff, le
// rate-limit, l'idempotence et le journal.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { recomputeLeagueStandings } from '@/utils/leagues/recomputeLeagueStandings';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 10, windowMs: 60_000 },
      'admin-leagues-recompute'
    )
  )
    return;

  const rawId = req.query.id;
  const leagueId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!leagueId || !isValidUUID(leagueId)) {
    return res.status(400).json({ error: 'Missing or invalid league id' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const result = await recomputeLeagueStandings(ctx.tenantId, leagueId);
  if (!result.ok) {
    if (result.error === 'league_not_found') {
      return res.status(404).json({ error: 'League not found' });
    }
    return res.status(500).json({ error: result.error });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'league',
    entity_id: leagueId,
    tenant_id: ctx.tenantId,
    payload: {
      operation: 'recompute_standings',
      standings_count: result.standingsCount,
      scrims_counted: result.scrimsCounted,
    },
  });

  return res.status(200).json({ standings_count: result.standingsCount });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'leagues-recompute' }),
  { permission: 'manage_tournaments' }
);
