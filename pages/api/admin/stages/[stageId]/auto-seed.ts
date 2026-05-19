// pages/api/admin/stages/[stageId]/auto-seed.ts
// POST : depuis les classements d'un stage source (group/swiss),
// peuple automatiquement les slots du bracket cible (round 1).
//
// Body : { sourceStageId, seedingPattern?: 'standard' | 'sequential' }
//
// Standard seeding pattern for N teams: 1vN, 2v(N-1), etc.
// placed into bracket slots to avoid top seeds meeting early.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { computeStageStandings } from '@/utils/stages/standings';
import { isValidUUID } from '@/utils/apiHelpers';

import { logger } from '../../../../../utils/logger';
type SeededSlot = {
  matchId: string;
  slot: 1 | 2;
  teamId: string;
  seed: number;
};

type ApiResponse =
  | { seeded: SeededSlot[]; totalMatches: number }
  | { error: string };

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'stage-auto-seed' }),
  'manager'
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
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

  const targetStageId = String(stageId);
  const { sourceStageId, seedingPattern = 'standard' } = req.body || {};

  if (!sourceStageId || typeof sourceStageId !== 'string') {
    return res.status(400).json({ error: 'sourceStageId is required' });
  }

  try {
    // Verify target stage is a bracket
    const { data: targetStage, error: tgtErr } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, tournament_id, stage_type, settings')
      .eq('id', targetStageId)
      .maybeSingle();

    if (tgtErr || !targetStage) {
      return res.status(404).json({ error: 'Target stage not found' });
    }

    if (targetStage.stage_type !== 'bracket') {
      return res
        .status(400)
        .json({ error: 'Target stage must be a bracket stage' });
    }

    // Verify source stage exists in same tournament
    const { data: sourceStage, error: srcErr } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, tournament_id, stage_type')
      .eq('id', sourceStageId)
      .maybeSingle();

    if (srcErr || !sourceStage) {
      return res.status(404).json({ error: 'Source stage not found' });
    }

    if (sourceStage.tournament_id !== targetStage.tournament_id) {
      return res.status(400).json({
        error: 'Les deux stages doivent appartenir au meme tournoi.',
      });
    }

    // Get standings from source stage
    const standings = await computeStageStandings(
      sourceStageId,
      sourceStage.stage_type || 'other'
    );

    if (standings.length === 0) {
      return res
        .status(400)
        .json({ error: 'Aucun classement disponible pour le stage source.' });
    }

    // Get round 1 matches of the target bracket (ordered by creation for positional consistency)
    const { data: bracketMatches, error: matchErr } = await supabaseAdmin
      .from('matches')
      .select('id, round_number, team1_id, team2_id')
      .eq('stage_id', targetStageId)
      .eq('round_number', 1)
      .order('created_at', { ascending: true });

    if (matchErr) {
      return res.status(500).json({ error: 'Failed to fetch bracket matches' });
    }

    if (!bracketMatches || bracketMatches.length === 0) {
      return res.status(400).json({
        error:
          "Aucun match de round 1 dans le bracket cible. Generez le bracket d'abord.",
      });
    }

    const totalSlots = bracketMatches.length * 2;
    const teamsToSeed = standings.slice(0, totalSlots);

    // Build seeding order based on pattern
    const seedOrder = buildSeedOrder(
      bracketMatches.length,
      seedingPattern as 'standard' | 'sequential'
    );

    // Assign teams to match slots
    const updates: SeededSlot[] = [];

    for (let i = 0; i < seedOrder.length && i < teamsToSeed.length; i++) {
      const { matchIndex, slot } = seedOrder[i];
      if (matchIndex >= bracketMatches.length) continue;

      const match = bracketMatches[matchIndex];
      const team = teamsToSeed[i];

      updates.push({
        matchId: match.id,
        slot,
        teamId: team.teamId,
        seed: team.rank,
      });
    }

    // Apply updates
    for (const u of updates) {
      const field = u.slot === 1 ? 'team1_id' : 'team2_id';
      const { error: updErr } = await supabaseAdmin
        .from('matches')
        .update({ [field]: u.teamId })
        .eq('id', u.matchId);

      if (updErr) {
        logger.error('auto-seed update error:', updErr);
      }
    }

    // Also ensure teams are in stage_teams
    const existingTeams = await supabaseAdmin
      .from('stage_teams')
      .select('team_id')
      .eq('stage_id', targetStageId);

    const existingIds = new Set(
      (existingTeams.data || []).map((t: any) => t.team_id)
    );

    const newTeamInserts = teamsToSeed
      .filter((t) => !existingIds.has(t.teamId))
      .map((t) => ({
        stage_id: targetStageId,
        team_id: t.teamId,
        seed: t.rank,
        is_substitute: false,
        notes: null,
      }));

    if (newTeamInserts.length > 0) {
      await supabaseAdmin.from('stage_teams').insert(newTeamInserts);
    }

    // Log
    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'auto_seed_bracket',
          entity_type: 'stage',
          entity_id: targetStageId,
          tournament_id: targetStage.tournament_id,
          payload: {
            source_stage_id: sourceStageId,
            target_stage_id: targetStageId,
            seeding_pattern: seedingPattern,
            seeded_count: updates.length,
          },
        });
      } catch (e) {
        logger.error('auto-seed logStaffAction error:', e);
      }
    }

    return res.status(200).json({
      seeded: updates,
      totalMatches: bracketMatches.length,
    });
  } catch (err: unknown) {
    logger.error('[/api/admin/stages/[stageId]/auto-seed] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Build seeding order for bracket matches.
 *
 * Standard seeding: places seeds so that 1 meets the lowest seed in the final,
 * 2 meets the second-lowest, etc. This avoids top seeds meeting early.
 *
 * For a bracket of size N (N matches in round 1, 2N teams):
 * Match 1: seed 1 vs seed 2N
 * Match 2: seed N+1 vs seed N
 * etc. (classic tournament seeding)
 */
function buildSeedOrder(
  numMatches: number,
  pattern: 'standard' | 'sequential'
): { matchIndex: number; slot: 1 | 2 }[] {
  const totalTeams = numMatches * 2;
  const order: { matchIndex: number; slot: 1 | 2 }[] = [];

  if (pattern === 'sequential') {
    // Simple: seed 1 in match 0 slot 1, seed 2 in match 0 slot 2, etc.
    for (let i = 0; i < numMatches; i++) {
      order.push({ matchIndex: i, slot: 1 });
      order.push({ matchIndex: i, slot: 2 });
    }
    return order;
  }

  // Standard seeding: build proper bracket placement
  // Generate the standard bracket positions for seeds 1..2N
  const positions = generateBracketPositions(totalTeams);

  for (const seed of positions) {
    // seed is 1-based, convert to match and slot
    const idx = seed - 1;
    const matchIndex = Math.floor(idx / 2);
    const slot: 1 | 2 = idx % 2 === 0 ? 1 : 2;
    order.push({ matchIndex, slot });
  }

  return order;
}

/**
 * Generate standard bracket seeding positions.
 * Returns an array where index i contains the seed number placed at position i.
 * Uses recursive splitting: [1, 2N, N+1, N, ...] pattern.
 */
function generateBracketPositions(size: number): number[] {
  if (size === 2) return [1, 2];

  const half = size / 2;
  const topHalf = generateBracketPositions(half);

  // For each position in the top half, create a pair:
  // seed X goes to one side, seed (size + 1 - X) goes to the other
  const result: number[] = [];
  for (const seed of topHalf) {
    result.push(seed);
    result.push(size + 1 - seed);
  }

  return result;
}
