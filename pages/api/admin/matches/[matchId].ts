// @ts-nocheck
// pages/api/admin/matches/[matchId].ts
// Route admin pour gérer un match :
// - GET : détail du match (+ équipes, + games optionnelles)
// - PUT/PATCH : update score (avec propagation) OU méta-données
// - DELETE : annuler ou supprimer un match

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { applyMatchScore } from '@/utils/matches/applyScore';
import { logStaffAction } from '@/utils/staffLogs';

export default withStaffRoute(handler, 'manager'); // rôle min : manager

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: any) {
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
  } catch (err: any) {
    console.error('[/api/admin/matches/[matchId]] error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      detail: err?.message,
    });
  }
}

/* -----------------------------------------------------------
 * GET : détail du match (+ option includeGames=1)
 * ---------------------------------------------------------*/

async function handleGet(
  matchId: string,
  req: NextApiRequest,
  res: NextApiResponse
) {
  const includeGames =
    req.query.includeGames === '1' || req.query.includeGames === 'true';

  const baseSelect = `
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
    stage:stage_id(id, name, stage_type, order_index),
    tournament:tournament_id(id, name, slug)
  `;

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const select = includeGames ? `${baseSelect}, games:games(*)` : baseSelect;

  const { data, error } = await supabaseAdmin
    .from('matches')
    .select(select)
    .eq('id', matchId)
    .maybeSingle();

  if (error || !data) {
    console.error('admin GET match error:', error);
    return res.status(404).json({ error: 'Match not found' });
  }

  return res.status(200).json({ match: data });
}

/* -----------------------------------------------------------
 * PUT / PATCH :
 *  - mode "score" : appliquer un score + propagation
 *  - mode "meta"  : mise à jour des champs méta (planning, liens bracket, etc.)
 * Body :
 *  { mode: "score", team1Score, team2Score, winnerTeamId?, status?, propagate? }
 *  ou
 *  { mode: "meta", ...champs à mettre à jour... }
 * ---------------------------------------------------------*/

async function handlePut(
  matchId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const { mode } = req.body as { mode?: 'score' | 'meta' };

  if (mode === 'score' || hasScorePayload(req.body)) {
    // --- Update score (avec helper applyMatchScore) ---
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
      winnerTeamId: typeof winnerTeamId === 'string' ? winnerTeamId : undefined,
      status,
      markFinished: status === 'finished' || !status,
      staffId: ctx.staff?.id ?? null,
      propagateBracket: propagate !== false,
    });

    return res.status(200).json(result);
  }

  // --- Update méta-données du match ---
  const metaFieldsWhitelist: string[] = [
    'tournament_id',
    'stage_id',
    'status',
    'is_bye',
    'match_format',
    'round_name',
    'round_number',
    'bracket_side',
    'group_key',
    'team1_id',
    'team2_id',
    'scheduled_at',
    'completed_at',
    'stream_url',
    'lobby_code',
    'notes',
    'next_match_win_id',
    'next_match_win_slot',
    'next_match_lose_id',
    'next_match_lose_slot',
  ];

  const updatePayload: Record<string, any> = {};

  for (const key of metaFieldsWhitelist) {
    if (key in req.body) {
      updatePayload[key] = (req.body as any)[key];
    }
  }

  if (Object.keys(updatePayload).length === 0) {
    return res.status(400).json({
      error:
        "No valid meta fields in body. Use mode='score' for score updates.",
    });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const { data: before, error: fetchErr } = await supabaseAdmin
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .maybeSingle();

  if (fetchErr || !before) {
    return res.status(404).json({ error: 'Match not found' });
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('matches')
    .update(updatePayload)
    .eq('id', matchId)
    .select('*')
    .maybeSingle();

  if (updErr || !updated) {
    console.error('admin PUT match meta error:', updErr);
    return res.status(500).json({
      error: 'Failed to update match metadata',
    });
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'update_match',
      entity_type: 'match',
      entity_id: matchId,
      tournament_id: updated.tournament_id ?? null,
      payload: {
        mode: 'meta',
        before,
        after: updated,
      },
    });
  }

  return res.status(200).json({ match: updated });
}

/* -----------------------------------------------------------
 * DELETE :
 *  - par défaut : status="cancelled" + reset scores + winner
 *  - query.hard=1 : suppression DB
 * ---------------------------------------------------------*/

async function handleDelete(
  matchId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const hard = req.query.hard === '1' || req.query.hard === 'true';

  const { data: match, error: fetchErr } = await supabaseAdmin
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .maybeSingle();

  if (fetchErr || !match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  if (hard) {
    const { error } = await supabaseAdmin
      .from('matches')
      .delete()
      .eq('id', matchId);

    if (error) {
      console.error('admin hard delete match error:', error);
      return res.status(500).json({
        error: 'Failed to hard-delete match',
      });
    }

    if (ctx?.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'delete_match',
        entity_type: 'match',
        entity_id: matchId,
        tournament_id: match.tournament_id ?? null,
        payload: {
          hard_delete: true,
        },
      });
    }

    return res.status(200).json({
      success: true,
      hardDeleted: true,
    });
  }

  // Soft delete / cancel
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
    console.error('admin cancel match error:', error);
    return res.status(500).json({
      error: 'Failed to cancel match',
    });
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'update_match',
      entity_type: 'match',
      entity_id: matchId,
      tournament_id: match.tournament_id ?? null,
      payload: {
        cancelled: true,
        hard_delete: false,
      },
    });
  }

  return res.status(200).json({
    success: true,
    hardDeleted: false,
  });
}

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function hasScorePayload(body: any): boolean {
  return (
    typeof body?.team1Score === 'number' && typeof body?.team2Score === 'number'
  );
}
