// pages/api/admin/stages/[stageId]/completion-status.ts
// GET : retourne le statut de completion d'une phase et suggère
// l'avancement vers la phase suivante si tout est terminé.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';

export default withStaffRoute(handler, 'caster');

async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  try {
    // Fetch stage
    const { data: stage, error: stageErr } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, tournament_id, name, stage_type, order_index, settings')
      .eq('id', id)
      .maybeSingle();

    if (stageErr || !stage) {
      return res.status(404).json({ error: 'Stage not found' });
    }

    // Count matches by status (exclude cancelled)
    const { data: matches, error: matchErr } = await supabaseAdmin
      .from('matches')
      .select('id, status')
      .eq('stage_id', id)
      .neq('status', 'cancelled');

    if (matchErr) {
      return res.status(500).json({ error: 'Failed to fetch matches' });
    }

    const allMatches = matches || [];
    const totalMatches = allMatches.length;
    const finishedMatches = allMatches.filter(
      (m) => m.status === 'finished'
    ).length;
    const pendingMatches = allMatches.filter(
      (m) => m.status === 'pending'
    ).length;
    const ongoingMatches = allMatches.filter(
      (m) => m.status === 'ongoing'
    ).length;

    const isComplete = totalMatches > 0 && finishedMatches === totalMatches;

    // Find the next stage by order_index
    let nextStage: {
      id: string;
      name: string;
      stage_type: string | null;
    } | null = null;

    if (stage.order_index !== null) {
      const { data: nextStageData } = await supabaseAdmin
        .from('tournament_stages')
        .select('id, name, stage_type, order_index')
        .eq('tournament_id', stage.tournament_id)
        .gt('order_index', stage.order_index)
        .order('order_index', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextStageData) {
        nextStage = {
          id: nextStageData.id,
          name: nextStageData.name,
          stage_type: nextStageData.stage_type,
        };
      }
    }

    const advancementRules = stage.settings?.advancement_rules ?? null;
    const hasAutoAdvancement = !!(
      advancementRules?.advance_top && advancementRules?.target_stage_id
    );
    const canAdvance = isComplete && (nextStage !== null || hasAutoAdvancement);

    return res.status(200).json({
      stageId: id,
      stageName: stage.name,
      stageType: stage.stage_type,
      totalMatches,
      finishedMatches,
      pendingMatches,
      ongoingMatches,
      isComplete,
      nextStage,
      canAdvance,
      advancementRules: hasAutoAdvancement ? advancementRules : undefined,
    });
  } catch (err: unknown) {
    console.error(
      '[/api/admin/stages/[stageId]/completion-status] error:',
      err
    );
    return res.status(500).json({ error: 'Internal server error' });
  }
}
