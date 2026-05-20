// pages/api/admin/teams/[teamId]/history.ts
// Historique staff d’une équipe.
//
// - GET : retourne la liste des actions staff liées à cette équipe :
//   * logs avec entity_type = "team" + entity_id = [teamId]
//   * + logs dont le payload contient { team_id: [teamId] } (par ex. ajout au stage, matches créés, etc.)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { StaffLog, formatStaffLog } from '@/utils/staffLogs';
import { parsePagination, isValidUUID } from '@/utils/apiHelpers';

import { logger } from '../../../../../utils/logger';
type TeamHistoryResponse = {
  teamId: string;
  logs: Array<ReturnType<typeof formatStaffLog>>;
};

// Rôle minimum : manager (vision globale sur les équipes)
export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    TeamHistoryResponse | { error: string; detail?: string }
  >,
  ctx: AuthenticatedStaffContext
) {
  const { teamId } = req.query;

  if (!teamId || Array.isArray(teamId) || !isValidUUID(teamId)) {
    return res.status(400).json({ error: 'Invalid teamId' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const id = String(teamId);

    /**
     * Optional query params:
     *  - entityType?: string   (ex: "team", "match", "stage", "tournament", ...)
     *  - action?: string       (ex: "update_team", "create_match", "join_stage", ...)
     *  - limit?: number        (par défaut 200)
     */
    const { entityType, action } = req.query;

    const { limit: limitNum } = parsePagination(req, { limit: 200 });

    // 1) Logs directement attachés à l'équipe (entity_type = "team")
    let directLogsQuery = supabaseAdmin
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
      .eq('entity_type', 'team')
      .eq('entity_id', id);

    if (action && !Array.isArray(action)) {
      directLogsQuery = directLogsQuery.eq('action', action);
    }

    directLogsQuery = directLogsQuery
      .order('created_at', { ascending: false })
      .limit(limitNum);

    const { data: directLogsData, error: directErr } = await directLogsQuery;

    if (directErr) {
      logger.error('team history: directLogs error:', directErr);
    }

    // 2) Logs d'autres entités (tournament, stage, match, etc.)
    //    qui référencent cette équipe via payload.team_id
    let payloadLogsQuery = supabaseAdmin
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
      .contains('payload', { team_id: id });

    if (entityType && !Array.isArray(entityType)) {
      payloadLogsQuery = payloadLogsQuery.eq('entity_type', entityType);
    }

    if (action && !Array.isArray(action)) {
      payloadLogsQuery = payloadLogsQuery.eq('action', action);
    }

    payloadLogsQuery = payloadLogsQuery
      .order('created_at', { ascending: false })
      .limit(limitNum);

    const { data: payloadLogsData, error: payloadErr } = await payloadLogsQuery;

    if (payloadErr) {
      logger.error('team history: payloadLogs error:', payloadErr);
    }

    // 3) Merge + tri chrono desc
    const rawLogs: StaffLog[] = [
      ...(((directLogsData as unknown as StaffLog[]) ?? []) as StaffLog[]),
      ...(((payloadLogsData as unknown as StaffLog[]) ?? []) as StaffLog[]),
    ];

    rawLogs.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    const formatted = rawLogs.map((log) => formatStaffLog(log));

    return res.status(200).json({
      teamId: id,
      logs: formatted,
    });
  } catch (err: unknown) {
    logger.error('[/api/admin/teams/[teamId]/history] error:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}
