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

    // Fetch all non-cancelled matches (with team & winner info for threshold tracking)
    const { data: matches, error: matchErr } = await supabaseAdmin
      .from('matches')
      .select('id, round_number, status, is_bye, team1_id, team2_id, winner_team_id')
      .eq('stage_id', id)
      .neq('status', 'cancelled');

    if (matchErr) {
      return res.status(500).json({ error: 'Failed to fetch matches' });
    }

    const allMatches = matches || [];

    // Current round
    const currentRound = allMatches.reduce(
      (acc: number, m: any) => Math.max(acc, m.round_number ?? 0),
      0
    );

    // Settings
    const totalRounds: number | null =
      typeof stage.settings?.total_rounds === 'number'
        ? stage.settings.total_rounds
        : null;
    const winThreshold: number | null =
      typeof stage.settings?.win_threshold === 'number'
        ? stage.settings.win_threshold
        : null;
    const lossThreshold: number | null =
      typeof stage.settings?.loss_threshold === 'number'
        ? stage.settings.loss_threshold
        : null;

    // Round status for current round
    const currentRoundMatches = allMatches.filter(
      (m: any) => m.round_number === currentRound
    );

    const finished = currentRoundMatches.filter((m: any) => m.status === 'finished').length;
    const pending = currentRoundMatches.filter((m: any) => m.status === 'pending').length;
    const ongoing = currentRoundMatches.filter((m: any) => m.status === 'ongoing').length;

    const allCurrentRoundFinished =
      currentRound > 0 && currentRoundMatches.length > 0 && finished === currentRoundMatches.length;

    // Compute W/L per team from finished matches for threshold tracking
    const finishedMatchList = allMatches.filter((m: any) => m.status === 'finished');
    const winsMap = new Map<string, number>();
    const lossesMap = new Map<string, number>();

    for (const m of finishedMatchList) {
      if (!m.team1_id) continue;
      if (m.is_bye) {
        winsMap.set(m.team1_id, (winsMap.get(m.team1_id) ?? 0) + 1);
        continue;
      }
      if (!m.team2_id) continue;
      if (m.winner_team_id === m.team1_id) {
        winsMap.set(m.team1_id, (winsMap.get(m.team1_id) ?? 0) + 1);
        lossesMap.set(m.team2_id, (lossesMap.get(m.team2_id) ?? 0) + 1);
      } else if (m.winner_team_id === m.team2_id) {
        winsMap.set(m.team2_id, (winsMap.get(m.team2_id) ?? 0) + 1);
        lossesMap.set(m.team1_id, (lossesMap.get(m.team1_id) ?? 0) + 1);
      }
    }

    // Fetch stage_teams to know total participant count
    const { data: stageTeams } = await supabaseAdmin
      .from('stage_teams')
      .select('team_id')
      .eq('stage_id', id);

    const allTeamIds = (stageTeams || []).map((st: any) => st.team_id);

    // Identify eliminated teams
    type EliminatedInfo = { teamId: string; reason: string; wins: number; losses: number };
    const eliminated: EliminatedInfo[] = [];

    for (const teamId of allTeamIds) {
      const wins = winsMap.get(teamId) ?? 0;
      const losses = lossesMap.get(teamId) ?? 0;
      if (winThreshold !== null && wins >= winThreshold) {
        eliminated.push({ teamId, reason: 'win_threshold', wins, losses });
      } else if (lossThreshold !== null && losses >= lossThreshold) {
        eliminated.push({ teamId, reason: 'loss_threshold', wins, losses });
      }
    }

    const activeCount = allTeamIds.length - eliminated.length;

    // Stage completion: round limit reached OR all teams eliminated (≤1 active)
    const roundLimitReached =
      totalRounds !== null && currentRound >= totalRounds && allCurrentRoundFinished;
    const allEliminated = allCurrentRoundFinished && activeCount <= 1;
    const isComplete = roundLimitReached || allEliminated;

    const canGenerateNext =
      allCurrentRoundFinished &&
      !isComplete &&
      (totalRounds === null || currentRound < totalRounds) &&
      activeCount > 1;

    return res.status(200).json({
      stageId: id,
      currentRound,
      totalRounds,
      winThreshold,
      lossThreshold,
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
      eliminated,
      activeTeamCount: activeCount,
      totalTeamCount: allTeamIds.length,
    });
  } catch (err: any) {
    console.error('[/api/admin/stages/[stageId]/swiss-status] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
