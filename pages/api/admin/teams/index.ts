// pages/api/admin/teams/index.ts
// Admin: liste des équipes avec filtres simples

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import {
  parsePagination,
  sanitizeSearch,
  escapePostgrestValue,
} from '@/utils/apiHelpers';

import { logger } from '../../../../utils/logger';
export type TeamRow = {
  id: string;
  name: string;
  [key: string]: any;
};

type TeamsApiResponse =
  | {
      teams: TeamRow[];
      total: number | null;
    }
  | { error: string };

// Rôle minimum : manager (vision globale sur les équipes)
export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TeamsApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(req, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: unknown) {
    logger.error('[/api/admin/teams] internal error:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse<TeamsApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  const { isActive, includeTotal, tournamentId } = req.query;

  const { limit: limitNum, offset: offsetNum } = parsePagination(req, {
    limit: 50,
  });
  const search = sanitizeSearch(req.query.search);

  const activeFilter =
    isActive === 'true' ? true : isActive === 'false' ? false : undefined;

  let query = supabaseAdmin
    .from('teams')
    .select('*', {
      count:
        includeTotal === '1' || includeTotal === 'true' ? 'exact' : undefined,
    })
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
    .range(offsetNum, offsetNum + limitNum - 1);

  if (typeof activeFilter === 'boolean') {
    query = query.eq('is_active', activeFilter);
  }

  // Search across name + slug + short_name (mirrors the SSR loader in
  // pages/admin/teams/index.tsx). Sanitised via escapePostgrestValue so user
  // input can't alter the PostgREST `.or(...)` filter structure.
  if (search) {
    const s = `%${escapePostgrestValue(search)}%`;
    query = query.or(`name.ilike.${s},slug.ilike.${s},short_name.ilike.${s}`);
  }

  // Filter by tournament: find team IDs linked via tournament_teams
  if (tournamentId && !Array.isArray(tournamentId)) {
    const { data: ttRows } = await supabaseAdmin
      .from('tournament_teams')
      .select('team_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('tournament_id', tournamentId);

    const teamIds = (ttRows || []).map((r: any) => r.team_id);
    if (teamIds.length > 0) {
      query = query.in('id', teamIds);
    } else {
      // No teams in this tournament
      return res.status(200).json({ teams: [], total: 0 });
    }
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error('admin GET teams error:', error);
    return res.status(500).json({
      error: 'Failed to fetch teams',
    });
  }

  return res.status(200).json({
    teams: (data || []) as TeamRow[],
    total: typeof count === 'number' ? count : null,
  });
}
