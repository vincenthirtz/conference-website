// pages/api/admin/logs.ts
// Admin: lecture des staff_logs globaux (journal d'audit).
//
// - GET : liste paginée/filtrée des logs staff, formatés via formatStaffLog()
//
// Query params :
//   - staffId?: string                  → filtre sur un staff précis
//   - tournamentId?: string            → filtre sur un tournoi
//   - entityType?: string              → filtre sur le type d'entité ("match", "tournament", "stage", "team", "demande", etc.)
//   - action?: string                  → filtre sur l'action ("update_match", "create_tournament", "staff_batch_action", etc.)
//   - from?: ISO date                  → created_at >= from
//   - to?: ISO date                    → created_at <= to
//   - search?: string                  → ilike sur action, entity_type, payload::text (simple)
//   - limit?: number (default 100)
//   - offset?: number (default 0)
//   - orderDir?: "asc" | "desc" (default "desc")
//   - includeTotal?: "1" | "true"      → inclut le count total (exact)
//
// Réponse :
// {
//   logs: Array<ReturnType<typeof formatStaffLog>>,
//   total: number | null
// }

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { StaffLog, formatStaffLog } from '@/utils/staffLogs';
import {
  parsePagination,
  sanitizeSearch,
  escapePostgrestValue,
} from '@/utils/apiHelpers';

export type AdminLogsResponse = {
  logs: Array<ReturnType<typeof formatStaffLog>>;
  total: number | null;
};

// Rôle minimum : manager (vision globale du journal d'audit)
export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AdminLogsResponse | { error: string; detail?: string }>,
  _ctx: any
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      staffId,
      tournamentId,
      entityType,
      action,
      from,
      to,
      orderDir,
      includeTotal,
    } = req.query;

    const { limit: limitNum, offset: offsetNum } = parsePagination(req, {
      limit: 100,
    });
    const search = sanitizeSearch(req.query.search);

    const ascending = orderDir === 'asc' ? true : false;

    const wantTotal = includeTotal === '1' || includeTotal === 'true';

    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase admin not configured' });
    }

    // Pas de relation FK déclarée côté DB → on reste sur un select simple.
    let query = supabaseAdmin
      .from('staff_logs')
      .select('id, created_at, staff_id, action, entity_type, entity_id', {
        count: wantTotal ? 'exact' : undefined,
      });

    if (staffId && !Array.isArray(staffId)) {
      query = query.eq('staff_id', staffId);
    }

    if (entityType && !Array.isArray(entityType)) {
      query = query.eq('entity_type', entityType);
    }

    if (action && !Array.isArray(action)) {
      query = query.eq('action', action);
    }

    if (from && !Array.isArray(from)) {
      query = query.gte('created_at', from);
    }

    if (to && !Array.isArray(to)) {
      query = query.lte('created_at', to);
    }

    if (search) {
      const safe = escapePostgrestValue(search);
      const s = `%${safe}%`;
      query = query.or(`action.ilike.${s},entity_type.ilike.${s}`);
    }

    query = query
      .order('created_at', { ascending })
      .range(offsetNum, offsetNum + limitNum - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('admin logs GET error:', error);
      return res.status(500).json({
        error: 'Failed to fetch staff logs',
      });
    }

    const rawLogs = ((data as unknown) || []) as StaffLog[];
    const formatted = rawLogs.map((log) => formatStaffLog(log));

    return res.status(200).json({
      logs: formatted,
      total: typeof count === 'number' ? count : null,
    });
  } catch (err: unknown) {
    console.error('[/api/admin/logs] internal error:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}
