// features/admin/stages/service/advance.ts — avancement d'équipes d'une phase
// source vers une phase cible.
//
// Mode manuel : { targetStageId, teamIds, seedMode: 'rank' | 'manual' | 'none' }
// Mode auto   : { auto: true } → lit `settings.advancement_rules` de la phase
//   (top N global, ou top N par poule pour une phase `group`) et clôt la phase
//   source (is_active=false), avec retour arrière si la clôture échoue.
//
// Classements : utils/stages/standings. Snapshot de la cible avant écriture :
// utils/bracket/snapshot (best-effort).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  computeGroupedStandings,
  computeStageStandings,
} from '@/utils/stages/standings';
import { createBracketSnapshot } from '@/utils/bracket/snapshot';
import { readDisqualificationMap } from '@/utils/stages/disqualification';
import type { Audited } from '../../_shared/audited';
import * as stages from '../repository/stages';
import { fail, settingsOrNull } from './common';
import { staffIdOf } from './seeding';

type AdvancedTeam = { teamId: string; seed: number | null };

type AdvanceResult = {
  advanced: AdvancedTeam[];
  skipped: string[];
  targetStageId: string;
  sourceStageCompleted?: boolean;
};

export async function advanceTeams(
  ctx: ServiceContext,
  sourceStageId: string,
  body: Record<string, unknown>
): Promise<Audited<AdvanceResult>> {
  const { row: sourceStage, error: srcErr } = await stages.getStageCore(
    ctx.db,
    ctx.tenantId,
    sourceStageId
  );
  if (srcErr || !sourceStage) throw fail(404, 'Source stage not found');

  let targetStageId: string;
  let teamIds: string[];
  let finalSeedMode: string;
  let isAutoMode = false;

  if (body.auto === true) {
    isAutoMode = true;
    const rules = settingsOrNull(sourceStage.settings)?.advancement_rules;
    const hasTopN =
      rules && typeof rules.advance_top === 'number' && rules.advance_top > 0;
    const hasPerGroup =
      rules &&
      typeof rules.advance_per_group === 'number' &&
      rules.advance_per_group > 0;

    if (!rules || !rules.target_stage_id || (!hasTopN && !hasPerGroup)) {
      throw fail(
        400,
        'Mode auto : advancement_rules manquant dans les settings du stage. ' +
          'Requis : { target_stage_id, advance_top OU advance_per_group, seed_by? }'
      );
    }

    targetStageId = rules.target_stage_id;
    finalSeedMode = rules.seed_by || 'standings';

    if (hasPerGroup && sourceStage.stage_type === 'group') {
      const grouped = await computeGroupedStandings(
        ctx.tenantId,
        sourceStageId
      );
      const perGroup = Number(rules.advance_per_group);
      teamIds = [];
      for (const ids of Object.values(grouped.groups)) {
        teamIds.push(
          ...ids
            .filter((s) => !s.disqualified)
            .slice(0, perGroup)
            .map((s) => s.teamId)
        );
      }
    } else {
      const standings = await computeStageStandings(
        ctx.tenantId,
        sourceStageId,
        sourceStage.stage_type || 'other'
      );
      teamIds = standings
        .filter((s) => !s.disqualified)
        .slice(0, Number(rules.advance_top))
        .map((s) => s.teamId);
    }

    if (teamIds.length === 0) {
      throw fail(400, 'Aucune equipe a avancer : le classement est vide.');
    }
  } else {
    targetStageId = body.targetStageId as string;
    teamIds = body.teamIds as string[];
    const seedMode = body.seedMode as string;

    if (!targetStageId || typeof targetStageId !== 'string') {
      throw fail(400, 'targetStageId is required');
    }
    if (!Array.isArray(teamIds) || teamIds.length === 0) {
      throw fail(400, 'teamIds must be a non-empty array');
    }
    finalSeedMode = ['rank', 'manual', 'none'].includes(seedMode)
      ? seedMode
      : 'none';
  }

  const { row: targetStage, error: tgtErr } = await stages.getStageCore(
    ctx.db,
    ctx.tenantId,
    targetStageId
  );
  if (tgtErr || !targetStage) throw fail(404, 'Target stage not found');
  if (sourceStage.tournament_id !== targetStage.tournament_id) {
    throw fail(400, 'Les deux stages doivent appartenir au meme tournoi.');
  }

  const src = await stages.stageTeamIds(ctx.db, ctx.tenantId, sourceStageId);
  if (src.error) throw fail(500, 'Failed to fetch source stage teams');

  // Une équipe disqualifiée de la phase source n'avance jamais, même choisie
  // à la main (la réintégrer d'abord).
  const disqualified = await readDisqualificationMap(
    ctx.tenantId,
    sourceStageId
  );
  const blocked = teamIds.filter((id) => disqualified.has(id));
  if (blocked.length > 0) {
    throw fail(
      409,
      `Equipes disqualifiees du stage source : ${blocked.join(', ')}`,
      'TEAM_DISQUALIFIED',
      { teamIds: blocked }
    );
  }
  const sourceTeamIds = new Set(src.ids);
  const invalidTeams = teamIds.filter((id) => !sourceTeamIds.has(id));
  if (invalidTeams.length > 0) {
    throw fail(
      400,
      `Equipes non presentes dans le stage source : ${invalidTeams.join(', ')}`
    );
  }

  const { ids: targetIds } = await stages.stageTeamIds(
    ctx.db,
    ctx.tenantId,
    targetStageId
  );
  const existingTargetIds = new Set(targetIds);
  const toAdvance = teamIds.filter((id) => !existingTargetIds.has(id));
  const skipped = teamIds.filter((id) => existingTargetIds.has(id));

  if (toAdvance.length === 0) {
    // Rien d'écrit : pas d'entrée de journal (comme à l'origine).
    return {
      result: { advanced: [], skipped, targetStageId },
      audit: { skip: true },
    };
  }

  const seedModeForRank =
    finalSeedMode === 'standings' ? 'rank' : finalSeedMode;
  const seedMap = new Map<string, number | null>();
  if (seedModeForRank === 'rank') {
    const standings = await computeStageStandings(
      ctx.tenantId,
      sourceStageId,
      sourceStage.stage_type || 'other'
    );
    const rankByTeam = new Map(standings.map((s) => [s.teamId, s.rank]));
    for (const id of toAdvance) seedMap.set(id, rankByTeam.get(id) ?? null);
  } else if (seedModeForRank === 'manual') {
    toAdvance.forEach((id, idx) => seedMap.set(id, idx + 1));
  } else {
    for (const id of toAdvance) seedMap.set(id, null);
  }

  void createBracketSnapshot({
    stageId: targetStageId,
    reason: 'advance_teams',
    staffId: staffIdOf(ctx),
    tenantId: ctx.tenantId,
  }).catch((e) => ctx.logger.error('advance: createBracketSnapshot failed', e));

  const { error: insertErr } = await stages.insertStageTeams(
    ctx.db,
    toAdvance.map((teamId) => ({
      tenant_id: ctx.tenantId,
      stage_id: targetStageId,
      team_id: teamId,
      seed: seedMap.get(teamId) ?? null,
      is_substitute: false,
      notes: null,
    }))
  );
  if (insertErr) {
    ctx.logger.error('advance teams insert error:', insertErr);
    throw fail(500, 'Failed to advance teams');
  }

  const advanced = toAdvance.map((teamId) => ({
    teamId,
    seed: seedMap.get(teamId) ?? null,
  }));

  let sourceStageCompleted = false;
  if (isAutoMode && sourceStage.is_active) {
    const { error: deactivateErr } = await stages.patchStage(
      ctx.db,
      ctx.tenantId,
      sourceStageId,
      { is_active: false }
    );
    if (deactivateErr) {
      ctx.logger.error('advance deactivate source stage error:', deactivateErr);
      await stages.deleteStageTeams(
        ctx.db,
        ctx.tenantId,
        targetStageId,
        toAdvance
      );
      throw fail(
        500,
        'Failed to deactivate source stage. Advancement rolled back.'
      );
    }
    sourceStageCompleted = true;
  }

  return {
    result: {
      advanced,
      skipped,
      targetStageId,
      ...(sourceStageCompleted ? { sourceStageCompleted } : {}),
    },
    audit: {
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
    },
  };
}
