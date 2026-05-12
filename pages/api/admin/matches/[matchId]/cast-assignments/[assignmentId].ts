// pages/api/admin/matches/[matchId]/cast-assignments/[assignmentId].ts
// Admin: delete or patch (reschedule briefing) a single cast assignment.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '../../../../../../utils/logger';

export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { matchId, assignmentId } = req.query;
  if (
    !matchId ||
    Array.isArray(matchId) ||
    !isValidUUID(matchId) ||
    !assignmentId ||
    Array.isArray(assignmentId) ||
    !isValidUUID(assignmentId)
  ) {
    return res.status(400).json({ error: 'IDs invalides' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }

  if (req.method === 'PATCH') {
    const { briefingAt } = req.body || {};
    if (typeof briefingAt !== 'string') {
      return res.status(400).json({ error: 'briefingAt requis' });
    }
    const briefingDate = new Date(briefingAt);
    if (Number.isNaN(briefingDate.getTime())) {
      return res.status(400).json({ error: 'briefingAt invalide' });
    }

    // Rescheduling resets the reminder flag so the bot DMs again at the new time.
    const { data, error } = await supabaseAdmin
      .from('cast_assignments')
      .update({
        briefing_at: briefingDate.toISOString(),
        briefing_reminder_sent_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assignmentId)
      .eq('match_id', matchId)
      .select('*')
      .maybeSingle();

    if (error || !data) {
      logger.error('[admin/cast-assignments/id] patch error', error);
      return res.status(500).json({ error: 'Échec de la mise à jour' });
    }
    return res.status(200).json({ assignment: data });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('cast_assignments')
      .delete()
      .eq('id', assignmentId)
      .eq('match_id', matchId);

    if (error) {
      logger.error('[admin/cast-assignments/id] delete error', error);
      return res.status(500).json({ error: 'Échec de la suppression' });
    }

    if (ctx?.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'delete_cast_assignment',
        entity_type: 'cast_assignment',
        entity_id: String(assignmentId),
        tournament_id: null,
        payload: { match_id: matchId },
      });
    }
    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'PATCH,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
