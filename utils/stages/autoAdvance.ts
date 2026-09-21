// utils/stages/autoAdvance.ts
// Helper qui declenche l'avancement automatique d'un stage vers le suivant
// quand tous ses matchs sont termines, si advancement_rules est configure.
//
// Appele depuis applyMatchScore() apres un match passe en finished/walkover.
// Idempotent : on ne re-avance pas un stage deja avance (verifie via is_active).

import { supabaseAdmin } from '../supabase';
import { computeStageStandings } from './standings';
import { logStaffAction } from '../staffLogs';
import { DEFAULT_TENANT_ID } from '../tenant';

import { logger } from '../logger';
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
/**
 * Recopie du `.select()` du stage source.
 *
 * `settings` est une colonne JSONB : ses clés ne sont garanties par rien, d'où
 * l'optionnalité. C'est là que vivent les règles d'avancement, lues juste après.
 */
type SourceStageRow = {
  id: string;
  tournament_id: string;
  stage_type: string | null;
  is_active: boolean | null;
  settings: {
    advancement_rules?: AdvancementRules;
    /** Top N par groupe : quelles équipes dans quel groupe. */
    group_assignments?: Record<string, string[]>;
  } | null;
};

export async function tryAutoAdvanceFromMatch(params: {
  tenantId?: string | null;
  stageId: string | null;
  staffId: string | null;
}): Promise<AutoAdvanceResult> {
  const { tenantId, stageId, staffId } = params;

  if (!stageId) {
    return { triggered: false, reason: 'no_stage' };
  }

  // tenantId optionnel pour preserver la compat des tests / call-sites legacy.
  // Quand fourni, on scope toutes les queries au tenant ; sinon comportement legacy.
  //
  // C'ÉTAIT UN HELPER `scoped = (q: any): any`. Le commentaire d'origine disait
  // vrai sur le symptôme — typer son générique fait exploser l'inférence de
  // supabase-js (TS2589) — mais la conclusion coûtait cher : rendant `any`, il
  // contaminait TOUT ce qui en sortait. `stage`, `target` et `existingTarget`
  // étaient donc `any`, et `stage.settings?.advancement_rules` n'était vérifié
  // nulle part. Appliquer le filtre en place ne demande aucun type
  // intermédiaire : TypeScript infère chaque chaîne telle qu'elle est.

  // 1) Charger le stage source
  let stageQuery = supabaseAdmin
    .from('tournament_stages')
    .select('id, tournament_id, stage_type, is_active, settings')
    .eq('id', stageId);
  if (tenantId) stageQuery = stageQuery.eq('tenant_id', tenantId);
  const { data: stageData, error: stageErr } = await stageQuery.maybeSingle();
  const stage = stageData as SourceStageRow | null;

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
  let matchesQuery = supabaseAdmin
    .from('matches')
    .select('id, status')
    .eq('stage_id', stageId)
    .neq('status', 'cancelled');
  if (tenantId) matchesQuery = matchesQuery.eq('tenant_id', tenantId);
  const { data: matches, error: matchesErr } = await matchesQuery;

  if (matchesErr) {
    return { triggered: false, reason: 'matches_fetch_error' };
  }

  const list = (matches as { id: string; status: string }[]) || [];
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
  let targetQuery = supabaseAdmin
    .from('tournament_stages')
    .select('id, tournament_id')
    .eq('id', rules.target_stage_id);
  if (tenantId) targetQuery = targetQuery.eq('tenant_id', tenantId);
  const { data: targetData, error: tgtErr } = await targetQuery.maybeSingle();
  const target = targetData as { id: string; tournament_id: string } | null;

  if (tgtErr || !target) {
    return { triggered: false, reason: 'target_stage_not_found' };
  }

  if (target.tournament_id !== stage.tournament_id) {
    return { triggered: false, reason: 'target_stage_wrong_tournament' };
  }

  // 4) Calculer les standings et choisir les equipes a avancer
  // Fallback DEFAULT_TENANT_ID si tenantId pas fourni : preserve la compat
  // des tests existants. En prod, applyScore passe maintenant le tenantId.
  const standings = await computeStageStandings(
    tenantId ?? DEFAULT_TENANT_ID,
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
  let existingQuery = supabaseAdmin
    .from('stage_teams')
    .select('team_id')
    .eq('stage_id', rules.target_stage_id);
  if (tenantId) existingQuery = existingQuery.eq('tenant_id', tenantId);
  const { data: existingTarget } = await existingQuery;

  const existingIds = new Set(
    ((existingTarget || []) as { team_id: string }[]).map((r) => r.team_id)
  );
  const newTeams = teamIdsToAdvance.filter((id) => !existingIds.has(id));

  if (newTeams.length === 0) {
    // Toutes les equipes ciblees sont deja avancees : on considere que le travail
    // a deja ete fait, on desactive le stage source pour respecter l'idempotence.
    let deactivate = supabaseAdmin
      .from('tournament_stages')
      .update({ is_active: false })
      .eq('id', stageId);
    if (tenantId) deactivate = deactivate.eq('tenant_id', tenantId);
    await deactivate;
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
    ...(tenantId ? { tenant_id: tenantId } : {}),
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
    logger.error('autoAdvance insert error:', insertErr);
    return { triggered: false, reason: 'insert_failed' };
  }

  // 7) Desactiver le stage source (idempotence)
  let deactivateSource = supabaseAdmin
    .from('tournament_stages')
    .update({ is_active: false })
    .eq('id', stageId);
  if (tenantId) deactivateSource = deactivateSource.eq('tenant_id', tenantId);
  await deactivateSource;

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
      logger.error('autoAdvance logStaffAction error:', e);
    }
  }

  return {
    triggered: true,
    sourceStageId: stageId,
    targetStageId: rules.target_stage_id,
    advancedTeamIds: newTeams,
  };
}
