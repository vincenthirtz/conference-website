// pages/api/admin/stages/[stageId]/advance.ts
// POST : avance des equipes d'un stage source vers un stage cible.
//
// Mode manuel : { targetStageId, teamIds, seedMode: 'rank' | 'manual' | 'none' }
// Mode auto   : { auto: true }
//   → lit advancement_rules depuis settings du stage :
//     { advance_top: N, target_stage_id: "uuid", seed_by: "standings" | "manual" | "none" }
//     OU
//     { advance_per_group: N, target_stage_id: "uuid", seed_by: ... }
//   → mode top_n : prend les N premiers du classement global
//   → mode per_group : prend les N premiers de CHAQUE poule (stage type 'group')

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { logStaffAction } from '@/utils/staffLogs';
import { createBracketSnapshot } from '@/utils/bracket/snapshot';
import {
  computeStageStandings,
  computeGroupedStandings,
} from '@/utils/stages/standings';
import { isValidUUID } from '@/utils/apiHelpers';

import { logger } from '../../../../../utils/logger';
type AdvancedTeam = { teamId: string; seed: number | null };

type ApiResponse =
  | {
      advanced: AdvancedTeam[];
      skipped: string[];
      targetStageId: string;
      sourceStageCompleted?: boolean;
    }
  | { error: string };

// Idempotency : le client (modale d'avancement de bracket) envoie un
// `Idempotency-Key` sur ce POST. Un rejeu avec la même clé rejoue la réponse
// cache (5 min) au lieu de ré-avancer les équipes / re-déclencher le snapshot.
// Header absent → comportement normal (rétro-compatible). Composition calquée
// sur pages/api/admin/matches/[matchId].ts : staff auth en wrapper externe,
// idempotency interne (donc jamais de cache pour un non-staff).
export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-stage-advance' }),
  { permission: 'manage_tournaments' }
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

  const sourceStageId = String(stageId);

  try {
    // Fetch source stage (needed for both modes)
    const { data: sourceStage, error: srcErr } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, tournament_id, stage_type, settings, is_active')
      .eq('id', sourceStageId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (srcErr || !sourceStage) {
      return res.status(404).json({ error: 'Source stage not found' });
    }

    // Resolve parameters: auto mode reads from settings, manual mode from body
    let targetStageId: string;
    let teamIds: string[];
    let finalSeedMode: string;
    let isAutoMode = false;

    if (req.body?.auto === true) {
      isAutoMode = true;
      const rules = sourceStage.settings?.advancement_rules;

      const hasTopN =
        rules && typeof rules.advance_top === 'number' && rules.advance_top > 0;
      const hasPerGroup =
        rules &&
        typeof rules.advance_per_group === 'number' &&
        rules.advance_per_group > 0;

      if (!rules || !rules.target_stage_id || (!hasTopN && !hasPerGroup)) {
        return res.status(400).json({
          error:
            'Mode auto : advancement_rules manquant dans les settings du stage. ' +
            'Requis : { target_stage_id, advance_top OU advance_per_group, seed_by? }',
        });
      }

      targetStageId = rules.target_stage_id;
      finalSeedMode = rules.seed_by || 'standings';

      if (hasPerGroup && sourceStage.stage_type === 'group') {
        // Top N par poule
        const grouped = await computeGroupedStandings(
          ctx.tenantId,
          sourceStageId
        );
        const perGroup = Number(rules.advance_per_group);
        teamIds = [];
        for (const ids of Object.values(grouped.groups)) {
          teamIds.push(...ids.slice(0, perGroup).map((s) => s.teamId));
        }
      } else {
        // Top N global
        const standings = await computeStageStandings(
          ctx.tenantId,
          sourceStageId,
          sourceStage.stage_type || 'other'
        );
        const advanceTop = Number(rules.advance_top);
        teamIds = standings.slice(0, advanceTop).map((s) => s.teamId);
      }

      if (teamIds.length === 0) {
        return res.status(400).json({
          error: 'Aucune equipe a avancer : le classement est vide.',
        });
      }
    } else {
      // Manual mode — original behavior
      const body = req.body || {};
      targetStageId = body.targetStageId;
      teamIds = body.teamIds;
      const seedMode = body.seedMode;

      if (!targetStageId || typeof targetStageId !== 'string') {
        return res.status(400).json({ error: 'targetStageId is required' });
      }

      if (!Array.isArray(teamIds) || teamIds.length === 0) {
        return res
          .status(400)
          .json({ error: 'teamIds must be a non-empty array' });
      }

      const validSeedModes = ['rank', 'manual', 'none'];
      finalSeedMode = validSeedModes.includes(seedMode) ? seedMode : 'none';
    }

    // Verify target stage exists and belongs to the same tournament
    const { data: targetStage, error: tgtErr } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, tournament_id')
      .eq('id', targetStageId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (tgtErr || !targetStage) {
      return res.status(404).json({ error: 'Target stage not found' });
    }

    if (sourceStage.tournament_id !== targetStage.tournament_id) {
      return res.status(400).json({
        error: 'Les deux stages doivent appartenir au meme tournoi.',
      });
    }

    // Verify teamIds are in the source stage
    const { data: sourceTeams, error: srcTeamsErr } = await supabaseAdmin
      .from('stage_teams')
      .select('team_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('stage_id', sourceStageId);

    if (srcTeamsErr) {
      return res
        .status(500)
        .json({ error: 'Failed to fetch source stage teams' });
    }

    const sourceTeamIds = new Set(
      (sourceTeams || []).map((t: any) => t.team_id)
    );
    const invalidTeams = teamIds.filter((id: string) => !sourceTeamIds.has(id));

    if (invalidTeams.length > 0) {
      return res.status(400).json({
        error: `Equipes non presentes dans le stage source : ${invalidTeams.join(', ')}`,
      });
    }

    // Check which teams are already in the target stage
    const { data: existingTargetTeams } = await supabaseAdmin
      .from('stage_teams')
      .select('team_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('stage_id', targetStageId);

    const existingTargetIds = new Set(
      (existingTargetTeams || []).map((t: any) => t.team_id)
    );

    const toAdvance = teamIds.filter(
      (id: string) => !existingTargetIds.has(id)
    );
    const skipped = teamIds.filter((id: string) => existingTargetIds.has(id));

    if (toAdvance.length === 0) {
      return res.status(200).json({
        advanced: [],
        skipped,
        targetStageId,
      });
    }

    // Compute seeds based on seedMode
    const seedModeForRank =
      finalSeedMode === 'standings' ? 'rank' : finalSeedMode;
    let seedMap = new Map<string, number | null>();

    if (seedModeForRank === 'rank') {
      const standings = await computeStageStandings(
        ctx.tenantId,
        sourceStageId,
        sourceStage.stage_type || 'other'
      );
      const rankByTeam = new Map<string, number>();
      for (const s of standings) {
        rankByTeam.set(s.teamId, s.rank);
      }
      for (const id of toAdvance) {
        seedMap.set(id, rankByTeam.get(id) ?? null);
      }
    } else if (seedModeForRank === 'manual') {
      toAdvance.forEach((id: string, idx: number) => {
        seedMap.set(id, idx + 1);
      });
    } else {
      for (const id of toAdvance) {
        seedMap.set(id, null);
      }
    }

    // Snapshot du stage cible avant insertion (rollback admin possible).
    // Best-effort : si l'insert échoue côté snapshot, on continue.
    void createBracketSnapshot({
      stageId: targetStageId,
      reason: 'advance_teams',
      staffId: ctx.staff?.id ?? null,
      tenantId: ctx.tenantId,
    }).catch((e) => logger.error('advance: createBracketSnapshot failed', e));

    // Insert into stage_teams
    const inserts = toAdvance.map((teamId: string) => ({
      tenant_id: ctx.tenantId,
      stage_id: targetStageId,
      team_id: teamId,
      seed: seedMap.get(teamId) ?? null,
      is_substitute: false,
      notes: null,
    }));

    const { error: insertErr } = await supabaseAdmin
      .from('stage_teams')
      .insert(inserts);

    if (insertErr) {
      logger.error('advance teams insert error:', insertErr);
      return res.status(500).json({ error: 'Failed to advance teams' });
    }

    const advanced: AdvancedTeam[] = toAdvance.map((teamId: string) => ({
      teamId,
      seed: seedMap.get(teamId) ?? null,
    }));

    // In auto mode, mark source stage as completed
    let sourceStageCompleted = false;
    if (isAutoMode && sourceStage.is_active) {
      const { error: deactivateErr } = await supabaseAdmin
        .from('tournament_stages')
        .update({ is_active: false })
        .eq('id', sourceStageId)
        .eq('tenant_id', ctx.tenantId);

      if (deactivateErr) {
        // Rollback: remove the teams we just inserted into the target stage
        logger.error('advance deactivate source stage error:', deactivateErr);
        await supabaseAdmin
          .from('stage_teams')
          .delete()
          .eq('tenant_id', ctx.tenantId)
          .eq('stage_id', targetStageId)
          .in('team_id', toAdvance);
        return res.status(500).json({
          error: 'Failed to deactivate source stage. Advancement rolled back.',
        });
      }
      sourceStageCompleted = true;
    }

    // Log staff action
    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'advance_teams',
          entity_type: 'stage',
          entity_id: sourceStageId,
          tournament_id: sourceStage.tournament_id,
          payload: {
            auto: isAutoMode,
            source_stage_id: sourceStageId,
            target_stage_id: targetStageId,
            advanced_team_ids: toAdvance,
            skipped_team_ids: skipped,
            seed_mode: finalSeedMode,
            source_stage_completed: sourceStageCompleted,
          },
        });
      } catch (e) {
        logger.error('advance teams logStaffAction error:', e);
      }
    }

    return res.status(200).json({
      advanced,
      skipped,
      targetStageId,
      ...(sourceStageCompleted ? { sourceStageCompleted } : {}),
    });
  } catch (err: unknown) {
    logger.error('[/api/admin/stages/[stageId]/advance] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
