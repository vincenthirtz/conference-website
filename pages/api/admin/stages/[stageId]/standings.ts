// pages/api/admin/stages/[stageId]/standings.ts
// GET : retourne le classement generique d'un stage.
// GET ?export=csv : exporte le classement en CSV.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { computeStageStandings } from '@/utils/stages/standings';
import type { StageStanding } from '@/utils/stages/standings';

type ApiResponse =
  | { stageId: string; stageType: string; standings: StageStanding[] }
  | { error: string };

export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { stageId } = req.query;
  if (!stageId || Array.isArray(stageId)) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service Supabase indisponible (service role manquant).' });
  }

  const id = String(stageId);
  const exportFormat = req.query.export === 'csv' ? 'csv' : null;

  try {
    // Fetch stage to get type and name
    const { data: stage, error: stageErr } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, stage_type, name')
      .eq('id', id)
      .maybeSingle();

    if (stageErr || !stage) {
      return res.status(404).json({ error: 'Stage not found' });
    }

    const stageType = stage.stage_type || 'other';
    const standings = await computeStageStandings(id, stageType);

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
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).end(csv);
      return;
    }

    return res.status(200).json({
      stageId: id,
      stageType,
      standings,
    });
  } catch (err: any) {
    console.error('[/api/admin/stages/[stageId]/standings] error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
