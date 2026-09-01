// pages/api/admin/tournament/[id]/history.ts
// Historique staff d’un tournoi :
// - GET : retourne la liste des actions staff liées au tournoi
//   * logs avec tournament_id = [id]
//   * + éventuellement filtrage par entity_type si besoin côté front

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { StaffLog, formatStaffLog } from '@/utils/staffLogs';
import { isValidUUID, parsePagination } from '@/utils/apiHelpers';

import { logger } from '../../../../../utils/logger';
type TournamentHistoryResponse = {
  tournamentId: string;
  logs: Array<ReturnType<typeof formatStaffLog>>;
};

// Rôle minimum : manager (vision globale du tournoi)
export default withStaffRoute(handler, { permission: 'manage_tournaments' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    TournamentHistoryResponse | { error: string; detail?: string }
  >,
  ctx: AuthenticatedStaffContext
) {
  const { id } = req.query;

  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament id' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const tournamentId = String(id);

    /**
     * Optional query params:
     *  - entityType?: string    (ex: "tournament", "match", "tournament_stage", "tournament_map")
     *  - action?: string        (filtre sur le type d'action: "update_tournament", "create_tournament", ...)
     *  - limit?: number         (par défaut 200)
     */
    const { entityType, action } = req.query;

    const { limit: limitNum } = parsePagination(req, { limit: 200 });

    let query = supabaseAdmin
      .from('staff_logs')
      .select(
        `
        id,
        created_at,
        staff_id,
        action,
        entity_type,
        entity_id,
        tournament_id,
        payload,
        staff:staff!fk_staff_logs_staff(
          id,
          auth_user_id,
          role,
          display_name,
          avatar_url
        )
      `
      )
      .eq('tenant_id', ctx.tenantId)
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: false })
      .limit(limitNum);

    if (entityType && !Array.isArray(entityType)) {
      query = query.eq('entity_type', entityType);
    }

    if (action && !Array.isArray(action)) {
      query = query.eq('action', action);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('tournament history logs error:', error);
      return res.status(500).json({
        error: 'Failed to fetch tournament history',
      });
    }

    const rawLogs = (data || []) as unknown as StaffLog[];

    // Formatage human-readable
    const formatted = rawLogs.map((log) => formatStaffLog(log));

    return res.status(200).json({
      tournamentId,
      logs: formatted,
    });
  } catch (err: unknown) {
    logger.error('[/api/admin/tournament/[id]/history] error:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}
