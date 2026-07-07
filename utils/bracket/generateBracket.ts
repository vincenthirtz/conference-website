// utils/bracket/generateBracket.ts
//
// Reusable bracket generation engine, EXTRACTED from
// pages/api/admin/tournament/[id]/bracket.ts (handleGenerate /
// handleGenerateDoubleElim). Both the original admin endpoint and the new
// /api/admin/quick-bracket endpoint call these functions so the match
// structure, next_match_* linkage, bye handling, stage_id and bracket_side
// stay identical across entry points.
//
// These functions perform the Supabase writes (insert matches + linkage) and
// roll back on linkage failure, then return a discriminated result. HTTP
// mapping + staff logging stay in the calling endpoint.

import { supabaseAdmin } from '../supabase';
import type { BracketSide } from '@/types/admin';
import { computeProposedSeeding } from '@/utils/stages/autoSeed';
import { propagateBracketForMatch } from '@/utils/bracket/propagate';
import { logger } from '../logger';

export type GeneratedRow = {
  id: string;
  round_number: number;
  bracket_side?: string;
};

export type GenerateBracketResult =
  | { ok: true; rows: GeneratedRow[]; matchIds: string[] }
  | { ok: false; error: string };

export type GenerateSingleElimParams = {
  tenantId: string;
  tournamentId: string;
  stageId: string | null;
  size: number;
  bestOf?: number | null;
  startDate?: string | null;
  intervalMinutes?: number;
};

export type GenerateDoubleElimParams = GenerateSingleElimParams & {
  grandFinalReset?: boolean;
};

/* -----------------------------------------------------------
 * SINGLE ELIMINATION
 *
 * Builds size/2 + size/4 + ... + 1 matches, links each match at (round R,
 * position P) to (round R+1, ceil(P/2)); odd P -> slot 1, even P -> slot 2.
 * Rolls back every inserted match if any linkage update fails.
 * ---------------------------------------------------------*/

export async function generateSingleElim(
  params: GenerateSingleElimParams
): Promise<GenerateBracketResult> {
  const {
    tenantId,
    tournamentId,
    stageId,
    size,
    bestOf = 3,
    startDate,
    intervalMinutes = 60,
  } = params;

  const totalRounds = Math.log2(size);

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
  const payload = drafts.map((d) => ({
    tenant_id: tenantId,
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
    logger.error('bracket generate insert error:', insertError);
    return { ok: false, error: 'Failed to create bracket matches' };
  }

  const rows = (inserted || []) as GeneratedRow[];

  // Step 2: Build linkages
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

  const updates: {
    id: string;
    next_match_win_id: string;
    next_match_win_slot: 1 | 2;
  }[] = [];

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

  // Batch update linkages — rollback all matches if any link fails
  if (updates.length > 0) {
    const linkErrors: string[] = [];
    for (const u of updates) {
      const { error: linkError } = await supabaseAdmin
        .from('matches')
        .update({
          next_match_win_id: u.next_match_win_id,
          next_match_win_slot: u.next_match_win_slot,
        })
        .eq('id', u.id)
        .eq('tenant_id', tenantId);

      if (linkError) {
        linkErrors.push(`Match ${u.id}: ${linkError.message}`);
      }
    }

    if (linkErrors.length > 0) {
      logger.error('bracket linkage errors, rolling back:', linkErrors);
      const matchIds = rows.map((r) => r.id);
      await supabaseAdmin
        .from('matches')
        .delete()
        .in('id', matchIds)
        .eq('tenant_id', tenantId);
      return {
        ok: false,
        error: 'Failed to link bracket matches, all matches rolled back',
      };
    }
  }

  return { ok: true, rows, matchIds: rows.map((r) => r.id) };
}

/* -----------------------------------------------------------
 * DOUBLE ELIMINATION
 *
 * Winners bracket (same as single elim) + Losers bracket + Grand Final
 * (+ optional Grand Final Reset). See the original endpoint for the full
 * LB structural notes. Rolls back on any linkage failure.
 * ---------------------------------------------------------*/

export async function generateDoubleElim(
  params: GenerateDoubleElimParams
): Promise<GenerateBracketResult> {
  const {
    tenantId,
    tournamentId,
    stageId,
    size,
    bestOf = 3,
    startDate,
    intervalMinutes = 60,
    grandFinalReset = false,
  } = params;

  const wbRounds = Math.log2(size);
  const lbRounds = 2 * (wbRounds - 1);

  type MatchDraft = {
    round_number: number;
    bracket_side: BracketSide;
    round_name: string;
    match_format: string | null;
    scheduled_at: string | null;
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
    const d = new Date(
      baseDate.getTime() + matchCounter * intervalMinutes * 60 * 1000
    );
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
  const lbMatchesPerRound: number[] = [];
  let lbCurrentTeams = size / 2; // Number of WB R1 losers

  for (let lbR = 1; lbR <= lbRounds; lbR++) {
    if (lbR === 1) {
      lbMatchesPerRound.push(lbCurrentTeams / 2);
      lbCurrentTeams = lbCurrentTeams / 2;
    } else if (lbR % 2 === 0) {
      lbMatchesPerRound.push(lbCurrentTeams);
    } else {
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
        round_number: wbRounds + lbR, // offset to avoid collision with WB
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
    tenant_id: tenantId,
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
    logger.error('double elim generate insert error:', insertError);
    return {
      ok: false,
      error: 'Failed to create double elimination matches',
    };
  }

  const rows = (inserted || []) as GeneratedRow[];

  type RowInfo = {
    id: string;
    round_number: number;
    bracket_side: string;
    pos: number;
  };
  const enriched: RowInfo[] = [];
  const posCounters = new Map<string, number>();

  for (const row of rows) {
    const side = row.bracket_side ?? 'wb';
    const key = `${side}:${row.round_number}`;
    const count = (posCounters.get(key) ?? 0) + 1;
    posCounters.set(key, count);
    enriched.push({
      id: row.id,
      round_number: row.round_number,
      bracket_side: side,
      pos: count,
    });
  }

  const matchMap = new Map<string, string>();
  for (const r of enriched) {
    matchMap.set(`${r.bracket_side}:${r.round_number}:${r.pos}`, r.id);
  }

  function getMatchId(
    side: string,
    roundNumber: number,
    pos: number
  ): string | undefined {
    return matchMap.get(`${side}:${roundNumber}:${pos}`);
  }

  const updates: { id: string; data: Record<string, unknown> }[] = [];

  // --- Link WB matches ---
  for (const r of enriched) {
    if (r.bracket_side !== 'wb') continue;

    const wbRound = r.round_number;
    const wbPos = r.pos;

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
        lbTargetPos = Math.ceil(wbPos / 2);
        lbTargetSlot = wbPos % 2 === 1 ? 1 : 2;
      } else {
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
      const nextLbR = lbR + 1;
      const nextLbRoundNumber = wbRounds + nextLbR;
      const nextLbMatchCount = lbMatchesPerRound[nextLbR - 1];

      let nextLbPos: number;
      let nextLbSlot: 1 | 2;

      if (nextLbR % 2 === 0) {
        nextLbPos = lbPos;
        nextLbSlot = 1;
      } else {
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

  // Apply all linkage updates — rollback all matches if any link fails
  const linkErrors: string[] = [];
  for (const u of updates) {
    const { error: linkError } = await supabaseAdmin
      .from('matches')
      .update(u.data)
      .eq('id', u.id)
      .eq('tenant_id', tenantId);

    if (linkError) {
      linkErrors.push(`Match ${u.id}: ${linkError.message}`);
    }
  }

  if (linkErrors.length > 0) {
    logger.error('double elim linkage errors, rolling back:', linkErrors);
    const matchIds = rows.map((r) => r.id);
    await supabaseAdmin
      .from('matches')
      .delete()
      .in('id', matchIds)
      .eq('tenant_id', tenantId);
    return {
      ok: false,
      error:
        'Failed to link double elimination bracket, all matches rolled back',
    };
  }

  return { ok: true, rows, matchIds: rows.map((r) => r.id) };
}

/* -----------------------------------------------------------
 * SEED ROUND ONE (paste order + byes)
 *
 * Fills the round-1 slots of a freshly generated bracket from an ORDERED list
 * of team ids (index 0 = seed 1). Reuses computeProposedSeeding (standard
 * seeding) so top seeds are spread out and phantom high-seed slots become
 * byes. Then any round-1 match with exactly one team is marked BYE (finished)
 * and the survivor is propagated forward via the shared bracket engine.
 * ---------------------------------------------------------*/

export type SeedRoundOneResult = {
  seededMatchIds: string[];
  byeMatchIds: string[];
};

export async function seedRoundOne(params: {
  tenantId: string;
  stageId: string;
  /** Team ids in paste order — index 0 is seed 1. */
  orderedTeamIds: string[];
  /** Score handed to the surviving team on a bye (default 1). */
  scoreForBye?: number;
  /** Propagate bye survivors into the next round (default true). */
  propagate?: boolean;
}): Promise<SeedRoundOneResult> {
  const {
    tenantId,
    stageId,
    orderedTeamIds,
    scoreForBye = 1,
    propagate = true,
  } = params;

  // Round-1 matches in stable creation order (== positional order).
  const { data: bracketMatches } = await supabaseAdmin
    .from('matches')
    .select('id, round_number, team1_id, team2_id')
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .eq('round_number', 1)
    .order('created_at', { ascending: true });

  const round1 = (bracketMatches || []) as {
    id: string;
    team1_id: string | null;
    team2_id: string | null;
  }[];

  if (round1.length === 0) {
    return { seededMatchIds: [], byeMatchIds: [] };
  }

  const standings = orderedTeamIds.map((teamId, idx) => ({
    teamId,
    rank: idx + 1,
  }));

  const proposed = computeProposedSeeding({
    standings,
    bracketMatches: round1.map((m) => ({ matchId: m.id })),
    pattern: 'standard',
  });

  const seededMatchIds = new Set<string>();
  for (const p of proposed) {
    const field = p.slot === 1 ? 'team1_id' : 'team2_id';
    const { error: updErr } = await supabaseAdmin
      .from('matches')
      .update({ [field]: p.teamId })
      .eq('id', p.matchId)
      .eq('tenant_id', tenantId);
    if (updErr) {
      logger.error('[seedRoundOne] slot update error', updErr);
      continue;
    }
    seededMatchIds.add(p.matchId);
    // Reflect the assignment locally so bye detection below is accurate.
    const m = round1.find((x) => x.id === p.matchId);
    if (m) {
      if (p.slot === 1) m.team1_id = p.teamId;
      else m.team2_id = p.teamId;
    }
  }

  // Bye detection : a round-1 match with exactly one team (XOR) auto-advances.
  const byeMatchIds: string[] = [];
  for (const m of round1) {
    const hasT1 = !!m.team1_id;
    const hasT2 = !!m.team2_id;
    if (hasT1 === hasT2) continue; // both filled or both empty → not a bye
    const winnerTeamId = m.team1_id || m.team2_id;
    if (!winnerTeamId) continue;

    const team1_score = m.team1_id === winnerTeamId ? scoreForBye : 0;
    const team2_score = m.team2_id === winnerTeamId ? scoreForBye : 0;

    const { error: byeErr } = await supabaseAdmin
      .from('matches')
      .update({
        is_bye: true,
        status: 'finished',
        winner_team_id: winnerTeamId,
        team1_score,
        team2_score,
        completed_at: new Date().toISOString(),
      })
      .eq('id', m.id)
      .eq('tenant_id', tenantId);

    if (byeErr) {
      logger.error('[seedRoundOne] bye update error', byeErr);
      continue;
    }
    byeMatchIds.push(m.id);

    if (propagate) {
      try {
        await propagateBracketForMatch(tenantId, m.id);
      } catch (e) {
        // Best-effort : the bye is recorded even if propagation hiccups.
        logger.error('[seedRoundOne] propagate bye error', m.id, e);
      }
    }
  }

  return { seededMatchIds: [...seededMatchIds], byeMatchIds };
}
