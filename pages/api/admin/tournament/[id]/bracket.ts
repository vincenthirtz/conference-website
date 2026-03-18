// pages/api/admin/tournament/[id]/bracket.ts
// Admin: génération et sauvegarde de brackets
// - POST action=generate : crée un bracket single-elimination vide
// - POST action=save     : batch update des slots d'équipes et horaires

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import type { BracketSide } from '@/types/admin';
import type { MatchForGraph } from '@/types/bracket';
import { buildBracketGraph, validateBracketGraph } from '@/utils/bracket/buildGraph';

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
    } else if (action === 'generate_double_elim') {
      return await handleGenerateDoubleElim(tournamentId, req, res, ctx);
    } else if (action === 'save') {
      return await handleSave(tournamentId, req, res, ctx);
    } else if (action === 'validate') {
      return await handleValidate(tournamentId, req, res);
    } else {
      return res
        .status(400)
        .json({ error: "action must be 'generate', 'generate_double_elim', 'save', or 'validate'" });
    }
  } catch (err: any) {
    console.error('[/api/admin/tournament/[id]/bracket] error:', err);
    return res
      .status(500)
      .json({ error: 'Internal server error' });
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

/* -----------------------------------------------------------
 * VALIDATE : détecte les cycles, orphelins et matchs déconnectés
 *
 * Body :
 *  { action: "validate", stageId?: string }
 * ---------------------------------------------------------*/

async function handleValidate(
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { stageId } = req.body;

  let query = supabaseAdmin
    .from('matches')
    .select(
      'id, tournament_id, round_number, bracket_side, group_key, next_match_win_id, next_match_lose_id'
    )
    .eq('tournament_id', tournamentId)
    .neq('status', 'cancelled');

  if (stageId && typeof stageId === 'string') {
    query = query.eq('stage_id', stageId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('bracket validate: fetch error', error);
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
  ctx: any
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

  const wbRounds = Math.log2(size);
  const lbRounds = 2 * (wbRounds - 1);

  type MatchDraft = {
    round_number: number;
    bracket_side: BracketSide;
    round_name: string;
    match_format: string | null;
    scheduled_at: string | null;
    // Internal tracking
    _wb_round?: number;
    _wb_pos?: number;
    _lb_round?: number;
    _lb_pos?: number;
  };

  const drafts: MatchDraft[] = [];
  const baseDate = startDate ? new Date(startDate) : null;
  let matchCounter = 0;

  function nextSchedule(): string | null {
    if (!baseDate) return null;
    const d = new Date(baseDate.getTime() + matchCounter * intervalMinutes * 60 * 1000);
    matchCounter++;
    return d.toISOString();
  }

  // --- Winners bracket ---
  for (let round = 1; round <= wbRounds; round++) {
    const matchesInRound = size / Math.pow(2, round);
    let roundName: string;

    if (round === wbRounds) roundName = 'WB Finale';
    else if (round === wbRounds - 1) roundName = 'WB Demi-finales';
    else if (round === wbRounds - 2 && wbRounds >= 3) roundName = 'WB Quarts';
    else roundName = `WB Round ${round}`;

    for (let pos = 1; pos <= matchesInRound; pos++) {
      drafts.push({
        round_number: round,
        bracket_side: 'wb',
        round_name: roundName,
        match_format: bestOf ? `bo${bestOf}` : null,
        scheduled_at: nextSchedule(),
        _wb_round: round,
        _wb_pos: pos,
      });
    }
  }

  // --- Losers bracket ---
  // LB round 1: size/4 matches (losers from WB R1)
  // LB round 2: size/4 matches (LB R1 winners vs losers from WB R2)... etc.
  // Structure: LB has alternating "minor" (internal) and "major" (receive WB loser) rounds.
  // Actually for standard DE:
  //   LB Round 1: size/4 matches (from WB R1 losers)
  //   LB Round 2: size/4 matches (LB R1 winners, may get WB R2 losers depending on size)
  //
  // More precisely:
  //   LB has pairs of rounds for each WB round > 1:
  //     - LB pair k (k=1..wbRounds-1):
  //       round A: receives losers from WB round k+1, plays vs LB survivors
  //       round B: internal LB matchups
  //
  //   LB Round 1: size/4 matches (WB R1 losers paired)
  //   LB Round 2: size/4 matches (LB R1 winners vs WB R2 losers)
  //   LB Round 3: size/8 matches (internal)
  //   LB Round 4: size/8 matches (LB R3 winners vs WB R3 losers)
  //   ... and so on

  // Calculate matches per LB round
  const lbMatchesPerRound: number[] = [];
  let lbCurrentTeams = size / 2; // Number of WB R1 losers

  for (let lbR = 1; lbR <= lbRounds; lbR++) {
    if (lbR === 1) {
      // First LB round: pair up WB R1 losers
      lbMatchesPerRound.push(lbCurrentTeams / 2);
      lbCurrentTeams = lbCurrentTeams / 2;
    } else if (lbR % 2 === 0) {
      // Even rounds: WB losers drop in, play vs LB survivors
      // Number of matches = current LB survivors (already halved from previous round)
      lbMatchesPerRound.push(lbCurrentTeams);
      // Team count stays the same (same number of matches, losers are eliminated)
    } else {
      // Odd rounds (after R1): internal LB matchups, halves
      lbMatchesPerRound.push(lbCurrentTeams / 2);
      lbCurrentTeams = lbCurrentTeams / 2;
    }
  }

  for (let lbR = 1; lbR <= lbRounds; lbR++) {
    const matchesInRound = lbMatchesPerRound[lbR - 1];
    let roundName: string;

    if (lbR === lbRounds) roundName = 'LB Finale';
    else roundName = `LB Round ${lbR}`;

    for (let pos = 1; pos <= matchesInRound; pos++) {
      drafts.push({
        round_number: wbRounds + lbR, // offset to avoid collision with WB round numbers
        bracket_side: 'lb',
        round_name: roundName,
        match_format: bestOf ? `bo${bestOf}` : null,
        scheduled_at: nextSchedule(),
        _lb_round: lbR,
        _lb_pos: pos,
      });
    }
  }

  // --- Grand Final ---
  drafts.push({
    round_number: wbRounds + lbRounds + 1,
    bracket_side: 'final',
    round_name: 'Grande Finale',
    match_format: bestOf ? `bo${bestOf}` : null,
    scheduled_at: nextSchedule(),
  });

  // --- Grand Final Reset (optional) ---
  if (grandFinalReset) {
    drafts.push({
      round_number: wbRounds + lbRounds + 2,
      bracket_side: 'final',
      round_name: 'Grande Finale (Reset)',
      match_format: bestOf ? `bo${bestOf}` : null,
      scheduled_at: nextSchedule(),
    });
  }

  // Insert all matches
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
    .select('id, round_number, bracket_side')
    .order('round_number', { ascending: true });

  if (insertError) {
    console.error('double elim generate insert error:', insertError);
    return res.status(500).json({
      error: 'Failed to create double elimination matches',
      detail: insertError.message,
    });
  }

  const rows = inserted || [];

  // Build lookup maps
  // WB matches: side='wb', grouped by round_number
  // LB matches: side='lb', grouped by round_number
  // GF matches: side='final'

  type RowInfo = { id: string; round_number: number; bracket_side: string; pos: number };
  const enriched: RowInfo[] = [];
  const posCounters = new Map<string, number>();

  for (const row of rows) {
    const key = `${row.bracket_side}:${row.round_number}`;
    const count = (posCounters.get(key) ?? 0) + 1;
    posCounters.set(key, count);
    enriched.push({ ...row, pos: count });
  }

  // Build per-side-round map: "side:round:pos" -> id
  const matchMap = new Map<string, string>();
  for (const r of enriched) {
    matchMap.set(`${r.bracket_side}:${r.round_number}:${r.pos}`, r.id);
  }

  // Helper to get match id
  function getMatchId(side: string, roundNumber: number, pos: number): string | undefined {
    return matchMap.get(`${side}:${roundNumber}:${pos}`);
  }

  const updates: { id: string; data: Record<string, unknown> }[] = [];

  // --- Link WB matches ---
  for (const r of enriched) {
    if (r.bracket_side !== 'wb') continue;

    const wbRound = r.round_number;
    const wbPos = r.pos;

    // WB winner -> next WB round
    if (wbRound < wbRounds) {
      const nextWbRound = wbRound + 1;
      const nextWbPos = Math.ceil(wbPos / 2);
      const nextWbSlot: 1 | 2 = wbPos % 2 === 1 ? 1 : 2;
      const nextWbId = getMatchId('wb', nextWbRound, nextWbPos);

      if (nextWbId) {
        updates.push({
          id: r.id,
          data: {
            next_match_win_id: nextWbId,
            next_match_win_slot: nextWbSlot,
          },
        });
      }
    }

    // WB loser -> LB
    // WB R1 losers go to LB R1
    // WB R2 losers go to LB R2
    // WB R(k) losers go to LB R(2*(k-1)) for k>=2
    let lbTargetRound: number;
    if (wbRound === 1) {
      lbTargetRound = 1;
    } else {
      lbTargetRound = 2 * (wbRound - 1);
    }

    const lbRoundNumber = wbRounds + lbTargetRound;
    const lbMatchesInTarget = lbMatchesPerRound[lbTargetRound - 1];

    if (lbMatchesInTarget > 0) {
      let lbTargetPos: number;
      let lbTargetSlot: 1 | 2;

      if (wbRound === 1) {
        // WB R1 losers pair up: pos 1&2 -> LB match 1, pos 3&4 -> LB match 2, etc.
        lbTargetPos = Math.ceil(wbPos / 2);
        lbTargetSlot = wbPos % 2 === 1 ? 1 : 2;
      } else {
        // WB R(k) losers drop into slot 2 of the corresponding LB even-round match
        // They play against LB survivors (slot 1)
        lbTargetPos = wbPos;
        lbTargetSlot = 2;
      }

      const lbTargetId = getMatchId('lb', lbRoundNumber, lbTargetPos);
      if (lbTargetId) {
        const existing = updates.find((u) => u.id === r.id);
        if (existing) {
          existing.data.next_match_lose_id = lbTargetId;
          existing.data.next_match_lose_slot = lbTargetSlot;
        } else {
          updates.push({
            id: r.id,
            data: {
              next_match_lose_id: lbTargetId,
              next_match_lose_slot: lbTargetSlot,
            },
          });
        }
      }
    }

    // WB Final winner -> Grand Final
    if (wbRound === wbRounds) {
      const gfId = getMatchId('final', wbRounds + lbRounds + 1, 1);
      if (gfId) {
        const existing = updates.find((u) => u.id === r.id);
        if (existing) {
          existing.data.next_match_win_id = gfId;
          existing.data.next_match_win_slot = 1;
        } else {
          updates.push({
            id: r.id,
            data: { next_match_win_id: gfId, next_match_win_slot: 1 },
          });
        }
      }
    }
  }

  // --- Link LB matches ---
  for (const r of enriched) {
    if (r.bracket_side !== 'lb') continue;

    const lbR = r.round_number - wbRounds; // 1-based LB round
    const lbPos = r.pos;

    if (lbR < lbRounds) {
      // LB winner goes to next LB round
      const nextLbR = lbR + 1;
      const nextLbRoundNumber = wbRounds + nextLbR;
      const nextLbMatchCount = lbMatchesPerRound[nextLbR - 1];

      let nextLbPos: number;
      let nextLbSlot: 1 | 2;

      if (nextLbR % 2 === 0) {
        // Next round is an even round (receives WB losers in slot 2)
        // LB survivors go to slot 1
        nextLbPos = lbPos;
        nextLbSlot = 1;
      } else {
        // Next round is odd (internal LB), halves the field
        nextLbPos = Math.ceil(lbPos / 2);
        nextLbSlot = lbPos % 2 === 1 ? 1 : 2;
      }

      if (nextLbPos <= nextLbMatchCount) {
        const nextLbId = getMatchId('lb', nextLbRoundNumber, nextLbPos);
        if (nextLbId) {
          updates.push({
            id: r.id,
            data: {
              next_match_win_id: nextLbId,
              next_match_win_slot: nextLbSlot,
            },
          });
        }
      }
    } else {
      // LB Final winner -> Grand Final slot 2
      const gfId = getMatchId('final', wbRounds + lbRounds + 1, 1);
      if (gfId) {
        updates.push({
          id: r.id,
          data: { next_match_win_id: gfId, next_match_win_slot: 2 },
        });
      }
    }
  }

  // --- Link Grand Final ---
  if (grandFinalReset) {
    const gfId = getMatchId('final', wbRounds + lbRounds + 1, 1);
    const gfResetId = getMatchId('final', wbRounds + lbRounds + 2, 1);
    if (gfId && gfResetId) {
      // GF loser (if it's the WB winner who loses) -> GF Reset
      // Both go to GF Reset
      updates.push({
        id: gfId,
        data: {
          next_match_lose_id: gfResetId,
          next_match_lose_slot: 1,
          next_match_win_id: gfResetId,
          next_match_win_slot: 2,
        },
      });
    }
  }

  // Apply all linkage updates
  for (const u of updates) {
    const { error: linkError } = await supabaseAdmin
      .from('matches')
      .update(u.data)
      .eq('id', u.id);

    if (linkError) {
      console.error('double elim linkage update error:', linkError);
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
      console.error('logStaffAction error:', e);
    }
  }

  return res.status(201).json({
    ok: true,
    match_count: rows.length,
    match_ids: rows.map((r) => r.id),
  });
}
