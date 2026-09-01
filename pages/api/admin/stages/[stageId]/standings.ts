// pages/api/admin/stages/[stageId]/standings.ts
// GET : retourne le classement generique d'un stage.
// GET ?export=csv : exporte le classement en CSV.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import {
  computeStageStandings,
  computeGroupedStandings,
} from '@/utils/stages/standings';
import type { StageStanding, GroupedStandings } from '@/utils/stages/standings';
import { isValidUUID } from '@/utils/apiHelpers';

import { logger } from '../../../../../utils/logger';
type ApiResponse =
  | {
      stageId: string;
      stageType: string;
      standings: StageStanding[];
      grouped?: GroupedStandings;
    }
  | { error: string };

export default withStaffRoute(handler, { permission: 'manage_tournaments' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { stageId } = req.query;
  if (!stageId || Array.isArray(stageId) || !isValidUUID(stageId)) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const id = String(stageId);
  const exportParam = req.query.export as string | undefined;
  const exportFormat =
    exportParam === 'csv' ? 'csv' : exportParam === 'json' ? 'json' : null;

  try {
    // Fetch stage to get type and name
    const { data: stage, error: stageErr } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, stage_type, name')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (stageErr || !stage) {
      return res.status(404).json({ error: 'Stage not found' });
    }

    const stageType = stage.stage_type || 'other';
    const standings = await computeStageStandings(ctx.tenantId, id, stageType);

    // Pour les stages 'group', on retourne aussi un decoupage par poule
    let grouped: GroupedStandings | undefined;
    if (stageType === 'group') {
      try {
        grouped = await computeGroupedStandings(ctx.tenantId, id);
      } catch (e) {
        logger.error('grouped standings error:', e);
      }
    }

    if (exportFormat === 'csv') {
      const header = [
        'rank',
        'team_name',
        'wins',
        'losses',
        'draws',
        'score',
        'seed',
      ];

      const escapeCsv = (v: string | number | null | undefined) => {
        const s = String(v ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };

      const rows = standings.map((s) =>
        [
          s.rank,
          escapeCsv(s.teamName),
          s.wins,
          s.losses,
          s.draws,
          s.score,
          s.seed ?? '',
        ].join(',')
      );

      const csv = [header.join(','), ...rows].join('\n');
      const filename = `standings-${(stage.name || id).replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`
      );
      res.status(200).end(csv);
      return;
    }

    if (exportFormat === 'json') {
      const exportData = {
        stageId: id,
        stageName: stage.name,
        stageType,
        exportedAt: new Date().toISOString(),
        standings: standings.map((s) => ({
          rank: s.rank,
          teamName: s.teamName,
          teamId: s.teamId,
          wins: s.wins,
          losses: s.losses,
          draws: s.draws,
          score: s.score,
          seed: s.seed,
        })),
      };
      const filename = `standings-${(stage.name || id).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`
      );
      res.status(200).end(JSON.stringify(exportData, null, 2));
      return;
    }

    return res.status(200).json({
      stageId: id,
      stageType,
      standings,
      ...(grouped ? { grouped } : {}),
    });
  } catch (err: unknown) {
    logger.error('[/api/admin/stages/[stageId]/standings] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
