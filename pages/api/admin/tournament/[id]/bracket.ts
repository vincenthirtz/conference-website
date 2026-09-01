// pages/api/admin/tournament/[id]/bracket.ts
// Admin: génération et sauvegarde de brackets
// - POST action=generate : crée un bracket single-elimination vide
// - POST action=save     : batch update des slots d'équipes et horaires

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import type { MatchForGraph } from '@/types/bracket';
import { logger } from '../../../../../utils/logger';
import {
  buildBracketGraph,
  validateBracketGraph,
} from '@/utils/bracket/buildGraph';
import {
  generateSingleElim,
  generateDoubleElim,
} from '@/utils/bracket/generateBracket';

export default withStaffRoute(handler, { permission: 'manage_tournaments' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { id } = req.query;

  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament id' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tournamentId = String(id);
  const { action } = req.body;

  try {
    if (action === 'generate') {
      return await handleGenerate(tournamentId, req, res, ctx);
    } else if (action === 'generate_double_elim') {
      return await handleGenerateDoubleElim(tournamentId, req, res, ctx);
    } else if (action === 'save') {
      return await handleSave(tournamentId, req, res, ctx);
    } else if (action === 'validate') {
      return await handleValidate(tournamentId, req, res, ctx);
    } else {
      return res.status(400).json({
        error:
          "action must be 'generate', 'generate_double_elim', 'save', or 'validate'",
      });
    }
  } catch (err: unknown) {
    logger.error('[/api/admin/tournament/[id]/bracket] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* -----------------------------------------------------------
 * GENERATE : crée un bracket single-elimination
 *
 * Body :
 *  {
 *    action: "generate",
 *    size: 4 | 8 | 16 | 32,
 *    bestOf?: number,
 *    startDate?: string (ISO),
 *    intervalMinutes?: number,
 *    stageId?: string
 *  }
 * ---------------------------------------------------------*/

async function handleGenerate(
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const {
    size,
    bestOf = 3,
    startDate,
    intervalMinutes = 60,
    stageId,
  } = req.body;

  const validSizes = [4, 8, 16, 32];
  if (!validSizes.includes(size)) {
    return res
      .status(400)
      .json({ error: `size must be one of: ${validSizes.join(', ')}` });
  }

  // Match structure + linkage now live in the shared engine
  // (utils/bracket/generateBracket.ts) so /api/admin/quick-bracket reuses the
  // exact same generation. Behavior is preserved: same insert payload, same
  // linkage, same rollback-on-failure, same 500 messages.
  const result = await generateSingleElim({
    tenantId: ctx.tenantId,
    tournamentId,
    stageId: stageId ?? null,
    size,
    bestOf,
    startDate,
    intervalMinutes,
  });

  if (!result.ok) {
    return res.status(500).json({ error: result.error });
  }

  const rows = result.rows;

  // Log
  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'create_match',
        entity_type: 'tournament',
        entity_id: tournamentId,
        tournament_id: tournamentId,
        payload: {
          size,
          bestOf,
          startDate,
          intervalMinutes,
          match_count: rows.length,
          match_ids: rows.map((r) => r.id),
        },
      });
    } catch (e) {
      logger.error('logStaffAction error:', e);
    }
  }

  return res.status(201).json({
    ok: true,
    match_count: rows.length,
    match_ids: rows.map((r) => r.id),
  });
}

/* -----------------------------------------------------------
 * SAVE : batch update des matchs (slots d'équipes + horaires)
 *
 * Body :
 *  {
 *    action: "save",
 *    matches: [{ id, team1_id?, team2_id?, scheduled_at? }]
 *  }
 * ---------------------------------------------------------*/

async function handleSave(
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { matches } = req.body as {
    matches: {
      id: string;
      team1_id?: string | null;
      team2_id?: string | null;
      scheduled_at?: string | null;
    }[];
  };

  if (!Array.isArray(matches) || matches.length === 0) {
    return res
      .status(400)
      .json({ error: "Body must include non-empty array 'matches'" });
  }

  const errors: string[] = [];

  for (const m of matches) {
    const updateData: Record<string, unknown> = {};

    if ('team1_id' in m) updateData.team1_id = m.team1_id ?? null;
    if ('team2_id' in m) updateData.team2_id = m.team2_id ?? null;
    if ('scheduled_at' in m) updateData.scheduled_at = m.scheduled_at ?? null;

    const { error } = await supabaseAdmin
      .from('matches')
      .update(updateData)
      .eq('id', m.id)
      .eq('tournament_id', tournamentId)
      .eq('tenant_id', ctx.tenantId);

    if (error) {
      errors.push(`Match ${m.id}: update failed`);
    }
  }

  if (errors.length > 0) {
    logger.error('bracket save errors:', errors);
  }

  // Log
  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'update_bracket',
        entity_type: 'tournament',
        entity_id: tournamentId,
        tournament_id: tournamentId,
        payload: {
          match_count: matches.length,
          errors: errors.length > 0 ? errors : undefined,
        },
      });
    } catch (e) {
      logger.error('logStaffAction error:', e);
    }
  }

  if (errors.length > 0) {
    return res.status(207).json({
      ok: false,
      errors,
      updated: matches.length - errors.length,
    });
  }

  return res.status(200).json({ ok: true, updated: matches.length });
}

/* -----------------------------------------------------------
 * VALIDATE : détecte les cycles, orphelins et matchs déconnectés
 *
 * Body :
 *  { action: "validate", stageId?: string }
 * ---------------------------------------------------------*/

async function handleValidate(
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { stageId } = req.body;

  let query = supabaseAdmin
    .from('matches')
    .select(
      'id, tournament_id, round_number, bracket_side, group_key, next_match_win_id, next_match_lose_id'
    )
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', ctx.tenantId)
    .neq('status', 'cancelled');

  if (stageId && typeof stageId === 'string') {
    query = query.eq('stage_id', stageId);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('bracket validate: fetch error', error);
    return res.status(500).json({ error: 'Failed to fetch matches' });
  }

  const matches: MatchForGraph[] = (data || []).map((m: any) => ({
    id: m.id,
    tournament_id: m.tournament_id,
    round_number: m.round_number ?? 0,
    bracket_side: m.bracket_side ?? 'none',
    group_key: m.group_key ?? null,
    next_match_win_id: m.next_match_win_id ?? null,
    next_match_lose_id: m.next_match_lose_id ?? null,
  }));

  const graph = buildBracketGraph(matches);
  const validation = validateBracketGraph(graph);

  return res.status(200).json(validation);
}

/* -----------------------------------------------------------
 * GENERATE DOUBLE ELIMINATION
 *
 * Body :
 *  {
 *    action: "generate_double_elim",
 *    size: 4 | 8 | 16 | 32,
 *    bestOf?: number,
 *    startDate?: string (ISO),
 *    intervalMinutes?: number,
 *    stageId?: string,
 *    grandFinalReset?: boolean
 *  }
 *
 * Creates:
 *  - Winners bracket (same as single elim)
 *  - Losers bracket (losers from WB drop here)
 *  - Grand Final (WB winner vs LB winner)
 *  - Optional Grand Final Reset (if LB winner wins GF)
 *
 * Loser bracket structure for size N:
 *   WB has log2(N) rounds.
 *   LB has 2*(log2(N)-1) rounds:
 *     - Odd LB rounds receive losers from WB
 *     - Even LB rounds are internal LB matchups
 * ---------------------------------------------------------*/

async function handleGenerateDoubleElim(
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const {
    size,
    bestOf = 3,
    startDate,
    intervalMinutes = 60,
    stageId,
    grandFinalReset = false,
  } = req.body;

  const validSizes = [4, 8, 16, 32];
  if (!validSizes.includes(size)) {
    return res
      .status(400)
      .json({ error: `size must be one of: ${validSizes.join(', ')}` });
  }

  // Match structure + linkage now live in the shared engine
  // (utils/bracket/generateBracket.ts) so /api/admin/quick-bracket reuses the
  // exact same generation. Behavior is preserved: same insert payload, same
  // linkage, same rollback-on-failure, same 500 messages.
  const result = await generateDoubleElim({
    tenantId: ctx.tenantId,
    tournamentId,
    stageId: stageId ?? null,
    size,
    bestOf,
    startDate,
    intervalMinutes,
    grandFinalReset,
  });

  if (!result.ok) {
    return res.status(500).json({ error: result.error });
  }

  const rows = result.rows;

  // Log
  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'create_match',
        entity_type: 'tournament',
        entity_id: tournamentId,
        tournament_id: tournamentId,
        payload: {
          type: 'double_elimination',
          size,
          bestOf,
          grandFinalReset,
          match_count: rows.length,
          wb_matches: rows.filter((r) => r.bracket_side === 'wb').length,
          lb_matches: rows.filter((r) => r.bracket_side === 'lb').length,
          gf_matches: rows.filter((r) => r.bracket_side === 'final').length,
        },
      });
    } catch (e) {
      logger.error('logStaffAction error:', e);
    }
  }

  return res.status(201).json({
    ok: true,
    match_count: rows.length,
    match_ids: rows.map((r) => r.id),
  });
}
