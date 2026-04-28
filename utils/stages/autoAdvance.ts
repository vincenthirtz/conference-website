// utils/stages/autoAdvance.ts
// Helper qui declenche l'avancement automatique d'un stage vers le suivant
// quand tous ses matchs sont termines, si advancement_rules est configure.
//
// Appele depuis applyMatchScore() apres un match passe en finished/walkover.
// Idempotent : on ne re-avance pas un stage deja avance (verifie via is_active).

import { supabaseAdmin } from '../supabase';
import { computeStageStandings } from './standings';
import { logStaffAction } from '../staffLogs';

export type AdvancementRules = {
  advance_top?: number;
  advance_per_group?: number;
  target_stage_id: string;
  seed_by?: 'standings' | 'manual' | 'none';
};

export type AutoAdvanceResult = {
  triggered: boolean;
  reason?: string;
  sourceStageId?: string;
  targetStageId?: string;
  advancedTeamIds?: string[];
};

/**
 * Tente l'avancement auto pour le stage du match qui vient d'etre termine.
 * Retourne `triggered: false` (avec une raison) si rien n'a ete fait.
 *
 * Garanties d'idempotence :
 *   - on ne touche que les stages encore is_active=true
 *   - on ne propage que si tous les matchs (hors cancelled) sont en 'finished'
 *   - on saute si l'equipe est deja dans le stage cible (gere par advance.ts logic)
 */
export async function tryAutoAdvanceFromMatch(params: {
  stageId: string | null;
  staffId: string | null;
}): Promise<AutoAdvanceResult> {
  const { stageId, staffId } = params;

  if (!stageId) {
    return { triggered: false, reason: 'no_stage' };
  }

  // 1) Charger le stage source
  const { data: stage, error: stageErr } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, tournament_id, stage_type, is_active, settings')
    .eq('id', stageId)
    .maybeSingle();

  if (stageErr || !stage) {
    return { triggered: false, reason: 'stage_not_found' };
  }

  if (!stage.is_active) {
    return { triggered: false, reason: 'stage_inactive' };
  }

  const rules = stage.settings?.advancement_rules as
    | AdvancementRules
    | undefined;
  if (!rules || !rules.target_stage_id) {
    return { triggered: false, reason: 'no_advancement_rules' };
  }

  if (!rules.advance_top && !rules.advance_per_group) {
    return { triggered: false, reason: 'invalid_advancement_rules' };
  }

  // 2) Verifier que tous les matchs du stage sont termines
  const { data: matches, error: matchesErr } = await supabaseAdmin
    .from('matches')
    .select('id, status')
    .eq('stage_id', stageId)
    .neq('status', 'cancelled');

  if (matchesErr) {
    return { triggered: false, reason: 'matches_fetch_error' };
  }

  const list = matches || [];
  if (list.length === 0) {
    return { triggered: false, reason: 'no_matches' };
  }

  const unfinished = list.filter(
    (m) => m.status !== 'finished' && m.status !== 'walkover'
  );
  if (unfinished.length > 0) {
    return { triggered: false, reason: 'matches_pending' };
  }

  // 3) Verifier que la phase cible existe et appartient au meme tournoi
  const { data: target, error: tgtErr } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, tournament_id')
    .eq('id', rules.target_stage_id)
    .maybeSingle();

  if (tgtErr || !target) {
    return { triggered: false, reason: 'target_stage_not_found' };
  }

  if (target.tournament_id !== stage.tournament_id) {
    return { triggered: false, reason: 'target_stage_wrong_tournament' };
  }

  // 4) Calculer les standings et choisir les equipes a avancer
  const standings = await computeStageStandings(
    stageId,
    stage.stage_type || 'other'
  );

  if (standings.length === 0) {
    return { triggered: false, reason: 'standings_empty' };
  }

  let teamIdsToAdvance: string[] = [];

  if (rules.advance_per_group && stage.stage_type === 'group') {
    // Top N par groupe. On lit group_assignments dans les settings du stage.
    const groupAssignments: Record<string, string[]> =
      stage.settings?.group_assignments || {};
    const teamGroup = new Map<string, string>();
    for (const [gk, tids] of Object.entries(groupAssignments)) {
      for (const tid of tids) teamGroup.set(tid, gk);
    }

    // Bucket par groupe (en preservant l'ordre des standings = ordre de classement)
    const buckets = new Map<string, string[]>();
    for (const s of standings) {
      const gk = teamGroup.get(s.teamId);
      if (!gk) continue;
      if (!buckets.has(gk)) buckets.set(gk, []);
      buckets.get(gk)!.push(s.teamId);
    }

    for (const [, ids] of buckets) {
      teamIdsToAdvance.push(...ids.slice(0, rules.advance_per_group));
    }
  } else if (rules.advance_top) {
    teamIdsToAdvance = standings
      .slice(0, rules.advance_top)
      .map((s) => s.teamId);
  }

  if (teamIdsToAdvance.length === 0) {
    return { triggered: false, reason: 'no_teams_selected' };
  }

  // 5) Filtrer celles deja presentes dans le stage cible
  const { data: existingTarget } = await supabaseAdmin
    .from('stage_teams')
    .select('team_id')
    .eq('stage_id', rules.target_stage_id);

  const existingIds = new Set(
    (existingTarget || []).map((r: any) => r.team_id)
  );
  const newTeams = teamIdsToAdvance.filter((id) => !existingIds.has(id));

  if (newTeams.length === 0) {
    // Toutes les equipes ciblees sont deja avancees : on considere que le travail
    // a deja ete fait, on desactive le stage source pour respecter l'idempotence.
    await supabaseAdmin
      .from('tournament_stages')
      .update({ is_active: false })
      .eq('id', stageId);
    return {
      triggered: false,
      reason: 'already_advanced',
      sourceStageId: stageId,
      targetStageId: rules.target_stage_id,
    };
  }

  // 6) Calculer les seeds
  const seedBy = rules.seed_by ?? 'standings';
  const seedMap = new Map<string, number | null>();
  if (seedBy === 'standings') {
    const rankByTeam = new Map<string, number>();
    for (const s of standings) rankByTeam.set(s.teamId, s.rank);
    for (const id of newTeams) seedMap.set(id, rankByTeam.get(id) ?? null);
  } else if (seedBy === 'manual') {
    newTeams.forEach((id, idx) => seedMap.set(id, idx + 1));
  } else {
    for (const id of newTeams) seedMap.set(id, null);
  }

  const inserts = newTeams.map((teamId) => ({
    stage_id: rules.target_stage_id,
    team_id: teamId,
    seed: seedMap.get(teamId) ?? null,
    is_substitute: false,
    notes: null,
  }));

  const { error: insertErr } = await supabaseAdmin
    .from('stage_teams')
    .insert(inserts);

  if (insertErr) {
    console.error('autoAdvance insert error:', insertErr);
    return { triggered: false, reason: 'insert_failed' };
  }

  // 7) Desactiver le stage source (idempotence)
  await supabaseAdmin
    .from('tournament_stages')
    .update({ is_active: false })
    .eq('id', stageId);

  // 8) Log staff
  if (staffId) {
    try {
      await logStaffAction({
        staff_id: staffId,
        action: 'auto_advance_stage',
        entity_type: 'stage',
        entity_id: stageId,
        tournament_id: stage.tournament_id,
        payload: {
          source_stage_id: stageId,
          target_stage_id: rules.target_stage_id,
          advanced_team_ids: newTeams,
          seed_by: seedBy,
          mode: rules.advance_per_group ? 'per_group' : 'top_n',
        },
      });
    } catch (e) {
      console.error('autoAdvance logStaffAction error:', e);
    }
  }

  return {
    triggered: true,
    sourceStageId: stageId,
    targetStageId: rules.target_stage_id,
    advancedTeamIds: newTeams,
  };
}
