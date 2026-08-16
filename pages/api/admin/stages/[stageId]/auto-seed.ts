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
import { computeProposedSeeding } from '@/utils/stages/autoSeed';
import { createBracketSnapshot } from '@/utils/bracket/snapshot';
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
  'admin'
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
      .eq('tenant_id', ctx.tenantId)
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
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (srcErr || !sourceStage) {
      return res.status(404).json({ error: 'Source stage not found' });
    }

    if (sourceStage.tournament_id !== targetStage.tournament_id) {
      return res.status(400).json({
        error: 'Les deux stages doivent appartenir au meme tournoi.',
      });
    }

    // Get round 1 matches of the target bracket (ordered by creation for positional consistency)
    const { data: bracketMatches, error: matchErr } = await supabaseAdmin
      .from('matches')
      .select('id, round_number, team1_id, team2_id, status')
      .eq('tenant_id', ctx.tenantId)
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

    // Lock guard : refuse re-seed once a round-1 match is live or done.
    // Run this BEFORE the standings fetch so we fail fast and don't waste
    // a costly aggregate when the stage is already locked.
    const locked = bracketMatches.filter(
      (m) =>
        m.status === 'ongoing' ||
        m.status === 'finished' ||
        m.status === 'walkover'
    );
    if (locked.length > 0) {
      return res.status(409).json({
        error: `Impossible de re-seed : ${locked.length} match(es) du round 1 sont déjà joué(s) ou en cours.`,
      });
    }

    // Get standings from source stage
    const standings = await computeStageStandings(
      ctx.tenantId,
      sourceStageId,
      sourceStage.stage_type || 'other'
    );

    if (standings.length === 0) {
      return res
        .status(400)
        .json({ error: 'Aucun classement disponible pour le stage source.' });
    }

    // Snapshot bracket avant mutation (rollback admin via
    // /admin/stages/[id]/snapshots). Best-effort.
    void createBracketSnapshot({
      stageId: targetStageId,
      reason: 'auto_seed',
      staffId: ctx.staff?.id ?? null,
      tenantId: ctx.tenantId,
    }).catch((e) => logger.error('auto-seed: createBracketSnapshot failed', e));

    // Compute proposed slot assignments via the shared util.
    const updates: SeededSlot[] = computeProposedSeeding({
      standings,
      bracketMatches: bracketMatches.map((m) => ({ matchId: m.id })),
      pattern: seedingPattern as 'standard' | 'sequential',
    });
    const teamsToSeed = standings.slice(0, bracketMatches.length * 2);

    // Apply updates
    for (const u of updates) {
      const field = u.slot === 1 ? 'team1_id' : 'team2_id';
      const { error: updErr } = await supabaseAdmin
        .from('matches')
        .update({ [field]: u.teamId })
        .eq('id', u.matchId)
        .eq('tenant_id', ctx.tenantId);

      if (updErr) {
        logger.error('auto-seed update error:', updErr);
      }
    }

    // Also ensure teams are in stage_teams
    const existingTeams = await supabaseAdmin
      .from('stage_teams')
      .select('team_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('stage_id', targetStageId);

    const existingIds = new Set(
      (existingTeams.data || []).map((t: any) => t.team_id)
    );

    const newTeamInserts = teamsToSeed
      .filter((t) => !existingIds.has(t.teamId))
      .map((t) => ({
        tenant_id: ctx.tenantId,
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
