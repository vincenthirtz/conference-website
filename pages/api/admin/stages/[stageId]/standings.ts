// pages/api/admin/stages/[stageId]/standings.ts
// GET : retourne le classement generique d'un stage.

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

  try {
    // Fetch stage to get type
    const { data: stage, error: stageErr } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, stage_type')
      .eq('id', id)
      .maybeSingle();

    if (stageErr || !stage) {
      return res.status(404).json({ error: 'Stage not found' });
    }

    const stageType = stage.stage_type || 'other';
    const standings = await computeStageStandings(id, stageType);

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
