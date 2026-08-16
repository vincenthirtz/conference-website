// pages/api/admin/tournament/[id]/checkin.ts
// Admin overview + manual trigger for the per-match check-in flow.
// - GET  : list of all matches for this tournament with their check-in state
// - POST : manually trigger the check-in processor for this tournament
//          (same logic as the cron, scoped to one tournament)

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import {
  listCheckinStatus,
  processCheckinForUpcomingMatches,
} from '@/utils/checkin';
import { logStaffAction } from '@/utils/staffLogs';

import { logger } from '../../../../../utils/logger';
export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { id } = req.query;
  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }

  const tournamentId = String(id);

  try {
    if (req.method === 'GET') {
      const rows = await listCheckinStatus(ctx.tenantId, tournamentId);
      return res.status(200).json({ matches: rows });
    }

    if (req.method === 'POST') {
      const summary = await processCheckinForUpcomingMatches({
        tournamentId,
        tenantId: ctx.tenantId,
      });

      if (ctx?.staff?.id) {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'other',
          entity_type: 'tournament',
          entity_id: tournamentId,
          tournament_id: tournamentId,
          payload: {
            kind: 'checkin_manual_run',
            scanned: summary.scanned,
            acted: summary.acted,
            errors: summary.errors,
          },
        });
      }

      return res.status(200).json({ success: true, ...summary });
    }

    res.setHeader('Allow', 'GET,POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    logger.error('[admin/tournament/checkin] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
