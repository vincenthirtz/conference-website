// pages/api/admin/tournament/[id]/bracket.ts
// Admin: génération et sauvegarde de brackets
// - POST action=generate : crée un bracket single-elimination vide
// - POST action=save     : batch update des slots d'équipes et horaires

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';

type BracketSide = 'wb' | 'lb' | 'final' | 'none';

export default withStaffRoute(handler, 'manager');

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: any) {
  const { id } = req.query;

  if (!id || Array.isArray(id)) {
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
    } else if (action === 'save') {
      return await handleSave(tournamentId, req, res, ctx);
    } else {
      return res
        .status(400)
        .json({ error: "action must be 'generate' or 'save'" });
    }
  } catch (err: any) {
    console.error('[/api/admin/tournament/[id]/bracket] error:', err);
    return res
      .status(500)
      .json({ error: 'Internal server error', detail: err?.message });
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
  ctx: any
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

  const totalRounds = Math.log2(size);

  // Build match structure: round by round
  // Round 1 has size/2 matches, round 2 has size/4, ..., final has 1
  type MatchDraft = {
    round_number: number;
    positionInRound: number; // local only, not a DB column
    bracket_side: BracketSide;
    round_name: string;
    match_format: string | null;
    scheduled_at: string | null;
  };

  const drafts: MatchDraft[] = [];
  const baseDate = startDate ? new Date(startDate) : null;
  let matchCounter = 0;

  for (let round = 1; round <= totalRounds; round++) {
    const matchesInRound = size / Math.pow(2, round);
    let roundName: string;

    if (round === totalRounds) {
      roundName = 'Finale';
    } else if (round === totalRounds - 1) {
      roundName = 'Demi-finales';
    } else if (round === totalRounds - 2 && totalRounds >= 3) {
      roundName = 'Quarts de finale';
    } else {
      roundName = `Round ${round}`;
    }

    for (let pos = 1; pos <= matchesInRound; pos++) {
      let scheduledAt: string | null = null;
      if (baseDate) {
        const d = new Date(
          baseDate.getTime() + matchCounter * intervalMinutes * 60 * 1000
        );
        scheduledAt = d.toISOString();
      }

      drafts.push({
        round_number: round,
        positionInRound: pos,
        bracket_side: 'wb',
        round_name: roundName,
        match_format: bestOf ? `bo${bestOf}` : null,
        scheduled_at: scheduledAt,
      });

      matchCounter++;
    }
  }

  // Step 1: Insert all matches without linkages
  // Only include columns that exist in the DB (aligned with matches.ts POST)
  const payload = drafts.map((d) => ({
    tournament_id: tournamentId,
    stage_id: stageId ?? null,
    status: 'pending' as const,
    is_bye: false,
    match_format: d.match_format,
    round_name: d.round_name,
    round_number: d.round_number,
    bracket_side: d.bracket_side,
    group_key: null,
    team1_id: null,
    team2_id: null,
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    scheduled_at: d.scheduled_at,
    completed_at: null,
    stream_url: null,
    lobby_code: null,
    notes: null,
    next_match_win_id: null,
    next_match_win_slot: null,
    next_match_lose_id: null,
    next_match_lose_slot: null,
  }));

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('matches')
    .insert(payload)
    .select('id, round_number')
    .order('round_number', { ascending: true });

  if (insertError) {
    console.error('bracket generate insert error:', insertError);
    return res.status(500).json({
      error: 'Failed to create bracket matches',
      detail: insertError.message,
      code: insertError.code,
    });
  }

  const rows = inserted || [];

  // Step 2: Build linkages
  // Match at round R, position P feeds into round R+1, position ceil(P/2)
  // Slot: odd P -> slot 1 (team1), even P -> slot 2 (team2)
  //
  // Since rows are ordered by round_number + created_at, we derive
  // position within each round from the insertion order.
  type RowWithPos = { id: string; round_number: number; pos: number };
  const enriched: RowWithPos[] = [];
  const posCounters = new Map<number, number>();

  for (const row of rows) {
    const count = (posCounters.get(row.round_number) ?? 0) + 1;
    posCounters.set(row.round_number, count);
    enriched.push({ id: row.id, round_number: row.round_number, pos: count });
  }

  const roundMap = new Map<string, string>(); // "round:position" -> id
  for (const r of enriched) {
    roundMap.set(`${r.round_number}:${r.pos}`, r.id);
  }

  const updates: { id: string; next_match_win_id: string; next_match_win_slot: 1 | 2 }[] = [];

  for (const r of enriched) {
    if (r.round_number >= totalRounds) continue; // finale has no next match

    const nextRound = r.round_number + 1;
    const nextPos = Math.ceil(r.pos / 2);
    const nextSlot: 1 | 2 = r.pos % 2 === 1 ? 1 : 2;

    const nextId = roundMap.get(`${nextRound}:${nextPos}`);
    if (nextId) {
      updates.push({
        id: r.id,
        next_match_win_id: nextId,
        next_match_win_slot: nextSlot,
      });
    }
  }

  // Batch update linkages
  if (updates.length > 0) {
    for (const u of updates) {
      const { error: linkError } = await supabaseAdmin
        .from('matches')
        .update({
          next_match_win_id: u.next_match_win_id,
          next_match_win_slot: u.next_match_win_slot,
        })
        .eq('id', u.id);

      if (linkError) {
        console.error('bracket linkage update error:', linkError);
      }
    }
  }

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
      console.error('logStaffAction error:', e);
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
  ctx: any
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
      .eq('tournament_id', tournamentId);

    if (error) {
      errors.push(`Match ${m.id}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    console.error('bracket save errors:', errors);
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
      console.error('logStaffAction error:', e);
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
