// pages/api/admin/stages/[stageId]/history.ts
// Historique staff d’une phase (stage) de tournoi.
//
// - GET : retourne la liste des actions staff liées à ce stage :
//   * logs avec entity_type = "stage" + entity_id = [stageId]
//   * + logs dont le payload contient { stage_id: [stageId] } (ex: création de matchs dans cette phase)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { StaffLog, formatStaffLog } from '@/utils/staffLogs';
import { parsePagination } from '@/utils/apiHelpers';

type StageHistoryResponse = {
  stageId: string;
  logs: Array<ReturnType<typeof formatStaffLog>>;
};

// Rôle minimum : manager (vision structure tournois)
export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    StageHistoryResponse | { error: string; detail?: string }
  >,
  _ctx: any
) {
  const { stageId } = req.query;

  if (!stageId || Array.isArray(stageId)) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const id = String(stageId);

    /**
     * Optional query params:
     *  - entityType?: string  (ex: "stage", "match", "tournament_map", etc.)
     *  - action?: string      (ex: "update_stage", "create_match", ...)
     *  - limit?: number       (par défaut 200)
     */
    const { entityType, action } = req.query;

    const { limit: limitNum } = parsePagination(req, { limit: 200 });

    // 1) Logs directement attachés au stage
    let stageLogsQuery = supabaseAdmin
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
        staff:staff(
          id,
          auth_user_id,
          role,
          display_name,
          avatar_url
        )
      `
      )
      .eq('entity_type', 'stage')
      .eq('entity_id', id);

    if (entityType && !Array.isArray(entityType)) {
      // Si l'utilisateur veut restreindre à entity_type différent,
      // on applique le filtre sur la requête "payload.stage_id" plus bas,
      // mais pour les logs "stage" on ignore ce filtre pour ne pas perdre l'historique direct.
    }

    if (action && !Array.isArray(action)) {
      stageLogsQuery = stageLogsQuery.eq('action', action);
    }

    stageLogsQuery = stageLogsQuery
      .order('created_at', { ascending: false })
      .limit(limitNum);

    const { data: stageLogsData, error: stageErr } = await stageLogsQuery;

    if (stageErr) {
      console.error('stage history: stageLogs error:', stageErr);
    }

    // 2) Logs d'autres entités (matchs, maps, etc.) qui référencent ce stage via payload.stage_id
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
        staff:staff(
          id,
          auth_user_id,
          role,
          display_name,
          avatar_url
        )
      `
      )
      .contains('payload', { stage_id: id });

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
      console.error('stage history: payloadLogs error:', payloadErr);
    }

    // 3) Merge + tri chrono desc
    const rawLogs: StaffLog[] = [
      ...(((stageLogsData as unknown as StaffLog[]) ?? []) as StaffLog[]),
      ...(((payloadLogsData as unknown as StaffLog[]) ?? []) as StaffLog[]),
    ];

    rawLogs.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    const formatted = rawLogs.map((log) => formatStaffLog(log));

    return res.status(200).json({
      stageId: id,
      logs: formatted,
    });
  } catch (err: any) {
    console.error('[/api/admin/stages/[stageId]/history] error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      detail: err?.message,
    });
  }
}
