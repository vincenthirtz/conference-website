// pages/api/matches/[matchId].ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, StaffContext } from '@/utils/staff';
import { applyMatchScore } from '@/utils/matches/applyScore';
import { logStaffAction } from '@/utils/staffLogs';

export default withStaffRoute(handler, 'manager');

/* -----------------------------------------------------------
 * API HANDLER PRINCIPAL
 * ---------------------------------------------------------*/

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: StaffContext) {
  const { matchId } = req.query;

  if (!matchId || Array.isArray(matchId)) {
    return res.status(400).json({ error: 'Invalid matchId' });
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(matchId, req, res);

      case 'PUT':
      case 'PATCH':
        return await handlePut(matchId, req, res, ctx);

      case 'DELETE':
        return await handleDelete(matchId, req, res, ctx);

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (e: any) {
    console.error('[/api/matches/[matchId]] error:', e);
    return res
      .status(500)
      .json({ error: 'Internal server error', detail: e.message });
  }
}

/* -----------------------------------------------------------
 * GET : récupérer le match + games
 * ---------------------------------------------------------*/

async function handleGet(
  matchId: string,
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { data, error } = await supabaseAdmin
    .from('matches')
    .select(
      `
      id,
      tournament_id,
      stage_id,
      status,
      is_bye,
      match_format,
      round_name,
      round_number,
      bracket_side,
      group_key,
      team1_id,
      team2_id,
      team1_score,
      team2_score,
      winner_team_id,
      scheduled_at,
      completed_at,
      stream_url,
      lobby_code,
      notes,
      next_match_win_id,
      next_match_win_slot,
      next_match_lose_id,
      next_match_lose_slot,
      team1:team1_id(id, name, short_name, logo_url),
      team2:team2_id(id, name, short_name, logo_url),
      games:games(*)
    `
    )
    .eq('id', matchId)
    .maybeSingle();

  if (error || !data) {
    return res.status(404).json({ error: 'Match not found' });
  }

  return res.status(200).json({ match: data });
}

/* -----------------------------------------------------------
 * PUT / PATCH : mettre à jour le score du match
 * ---------------------------------------------------------*/

async function handlePut(
  matchId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: StaffContext
) {
  const {
    team1Score,
    team2Score,
    winnerTeamId,
    status,
    propagate = true,
  } = req.body;

  if (typeof team1Score !== 'number' || typeof team2Score !== 'number') {
    return res.status(400).json({
      error: 'Missing numeric team1Score / team2Score',
    });
  }

  const result = await applyMatchScore({
    matchId,
    team1Score,
    team2Score,
    winnerTeamId,
    status,
    markFinished: status === 'finished' || !status,
    staffId: ctx.staff?.id ?? null,
    propagateBracket: propagate !== false,
  });

  return res.status(200).json(result);
}

/* -----------------------------------------------------------
 * DELETE : annuler un match (status = "cancelled")
 * ---------------------------------------------------------*/

async function handleDelete(
  matchId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: StaffContext
) {
  const { data: match, error: fetchErr } = await supabaseAdmin
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .maybeSingle();

  if (fetchErr || !match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  const { error } = await supabaseAdmin
    .from('matches')
    .update({
      status: 'cancelled',
      team1_score: null,
      team2_score: null,
      winner_team_id: null,
    })
    .eq('id', matchId);

  if (error) {
    console.error('delete match error:', error);
    return res.status(500).json({ error: 'Error cancelling match' });
  }

  // Log staff
  await logStaffAction({
    staff_id: ctx.staff!.id,
    action: 'update_match',
    entity_type: 'match',
    entity_id: matchId,
    tournament_id: match.tournament_id,
    payload: {
      cancelled: true,
    },
  });

  return res.status(200).json({ success: true });
}
