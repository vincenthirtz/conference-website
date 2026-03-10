// pages/api/admin/stages/[stageId]/swiss-status.ts
// GET : retourne le statut de progression Swiss d'une phase.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';

export default withStaffRoute(handler, 'caster');

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { stageId } = req.query;

  if (!stageId || Array.isArray(stageId)) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable (missing service role).' });
  }

  const id = String(stageId);

  try {
    // Verify stage exists and is Swiss
    const { data: stage, error: stageErr } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, tournament_id, stage_type, settings')
      .eq('id', id)
      .maybeSingle();

    if (stageErr || !stage) {
      return res.status(404).json({ error: 'Stage not found' });
    }

    if (stage.stage_type !== 'swiss') {
      return res.status(400).json({
        error: "This endpoint is only for swiss stages.",
      });
    }

    // Fetch all non-cancelled matches
    const { data: matches, error: matchErr } = await supabaseAdmin
      .from('matches')
      .select('id, round_number, status')
      .eq('stage_id', id)
      .neq('status', 'cancelled');

    if (matchErr) {
      return res.status(500).json({ error: 'Failed to fetch matches' });
    }

    const allMatches = matches || [];

    // Current round
    const currentRound = allMatches.reduce(
      (acc, m) => Math.max(acc, m.round_number ?? 0),
      0
    );

    // Total rounds from settings
    const totalRounds: number | null =
      typeof stage.settings?.total_rounds === 'number'
        ? stage.settings.total_rounds
        : null;

    // Round status for current round
    const currentRoundMatches = allMatches.filter(
      (m) => m.round_number === currentRound
    );

    const finished = currentRoundMatches.filter((m) => m.status === 'finished').length;
    const pending = currentRoundMatches.filter((m) => m.status === 'pending').length;
    const ongoing = currentRoundMatches.filter((m) => m.status === 'ongoing').length;

    const allCurrentRoundFinished =
      currentRound > 0 && currentRoundMatches.length > 0 && finished === currentRoundMatches.length;

    const canGenerateNext =
      allCurrentRoundFinished &&
      (totalRounds === null || currentRound < totalRounds);

    const isComplete =
      totalRounds !== null &&
      currentRound >= totalRounds &&
      allCurrentRoundFinished;

    return res.status(200).json({
      stageId: id,
      currentRound,
      totalRounds,
      roundStatus: {
        round: currentRound,
        total: currentRoundMatches.length,
        finished,
        pending,
        ongoing,
      },
      allCurrentRoundFinished,
      canGenerateNext,
      isComplete,
    });
  } catch (err: any) {
    console.error('[/api/admin/stages/[stageId]/swiss-status] error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
