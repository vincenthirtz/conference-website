// pages/api/admin/leagues/[id]/tournaments/[tournamentId].ts
// DELETE → délie un tournoi d'une league.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-leagues-tournaments-unlink'
    )
  )
    return;

  const rawId = req.query.id;
  const rawTid = req.query.tournamentId;
  const leagueId = Array.isArray(rawId) ? rawId[0] : rawId;
  const tournamentId = Array.isArray(rawTid) ? rawTid[0] : rawTid;
  if (!leagueId || !isValidUUID(leagueId)) {
    return res.status(400).json({ error: 'Missing or invalid league id' });
  }
  if (!tournamentId || !isValidUUID(tournamentId)) {
    return res.status(400).json({ error: 'Missing or invalid tournament id' });
  }

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { error } = await supabaseAdmin
    .from('league_tournaments')
    .delete()
    .eq('tenant_id', ctx.tenantId)
    .eq('league_id', leagueId)
    .eq('tournament_id', tournamentId);
  if (error) {
    logger.error('[admin/leagues/tournaments] unlink error', error);
    return res.status(500).json({ error: 'Failed to unlink tournament' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'league',
    entity_id: leagueId,
    tenant_id: ctx.tenantId,
    payload: { operation: 'unlink_tournament', tournament_id: tournamentId },
  });

  return res.status(204).end();
}

export default withStaffRoute(handler, 'manager');
