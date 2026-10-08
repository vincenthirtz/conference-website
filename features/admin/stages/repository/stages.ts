// features/admin/stages/repository/stages.ts — accès base aux phases
// (`tournament_stages`) et à leurs inscriptions (`stage_teams`).
//
// Les requêtes sont celles des routes d'origine, à l'identique (colonnes,
// filtres, ordre) : la migration déplace, elle ne réécrit pas. `tenantId` est
// un paramètre obligatoire de toutes les fonctions.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesInsert, TablesUpdate } from '@/types/database.generated';
import { STAGE_COLUMNS, STAGE_TEAM_COLUMNS } from '../schemas';

/* ------------------------------ phases --------------------------------- */

export async function getStage(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('tournament_stages')
    .select(STAGE_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

/** Phase réduite à ce que lit la route appelante (sous-ensemble fixe). */
export async function getStageCore(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('tournament_stages')
    .select(
      'id, tournament_id, name, stage_type, order_index, settings, is_active'
    )
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

/** Phase → tournoi, dans l'espace (auto-byes, batch-scores). */
export async function getStageTournament(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data, error } = await db
    .from('tournament_stages')
    .select('id, tournament_id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function updateStage(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: TablesUpdate<'tournament_stages'>
) {
  const { data, error } = await db
    .from('tournament_stages')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(STAGE_COLUMNS)
    .maybeSingle();
  return { row: data, error };
}

/** Mise à jour sans relecture (réglages, désactivation). */
export async function patchStage(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: TablesUpdate<'tournament_stages'>
) {
  const { error } = await db
    .from('tournament_stages')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId);
  return { error };
}

export async function deleteStage(db: AdminDb, tenantId: string, id: string) {
  const { error } = await db
    .from('tournament_stages')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);
  return { error };
}

export async function insertStage(
  db: AdminDb,
  row: TablesInsert<'tournament_stages'>
) {
  const { data, error } = await db
    .from('tournament_stages')
    .insert(row)
    .select(STAGE_COLUMNS)
    .single();
  return { row: data, error };
}

/** Plus grand `order_index` des phases d'un tournoi (clonage). */
export async function maxStageOrder(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data } = await db
    .from('tournament_stages')
    .select('order_index')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .order('order_index', { ascending: false })
    .limit(1);
  return data;
}

/** Phase suivante (par `order_index`) du même tournoi. */
export async function nextStage(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  orderIndex: number
) {
  const { data } = await db
    .from('tournament_stages')
    .select('id, name, stage_type, order_index')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .gt('order_index', orderIndex)
    .order('order_index', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data;
}

/** Autres phases du tournoi (sources possibles d'un seeding). */
export async function siblingStages(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  excludeId: string
) {
  const { data } = await db
    .from('tournament_stages')
    .select('id, name, stage_type, order_index')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .neq('id', excludeId)
    .order('order_index', { ascending: true });
  return data ?? [];
}

export async function stageIdsOfTournament(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data } = await db
    .from('tournament_stages')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId);
  return (data ?? []).map((s) => s.id);
}

/* ---------------------------- stage_teams ------------------------------ */

export async function stageTeamIds(
  db: AdminDb,
  tenantId: string,
  stageId: string
) {
  const { data, error } = await db
    .from('stage_teams')
    .select('team_id')
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId);
  return { ids: (data ?? []).map((r) => r.team_id), error };
}

export async function stageTeamsWithSeed(
  db: AdminDb,
  tenantId: string,
  stageId: string
) {
  const { data, error } = await db
    .from('stage_teams')
    .select('stage_id, team_id, seed')
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId);
  return { rows: data, error };
}

/** Inscriptions + équipe jointe, par seed croissant (poules). */
export async function stageTeamsWithTeam(
  db: AdminDb,
  tenantId: string,
  stageId: string
) {
  const { data, error } = await db
    .from('stage_teams')
    .select('team_id, seed, team:team_id(id, name, short_name, logo_url)')
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .order('seed', { ascending: true, nullsFirst: false });
  return { rows: data, error };
}

/** Liste complète de l'écran « équipes de la phase ». */
export async function stageTeamsDetailed(
  db: AdminDb,
  tenantId: string,
  stageId: string
) {
  const { data, error } = await db
    .from('stage_teams')
    .select(
      'stage_id, team_id, seed, is_substitute, notes, team:team_id(id, name, short_name, logo_url)'
    )
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .order('seed', { ascending: true, nullsFirst: false });
  return { rows: data, error };
}

/** Inscription d'une équipe + état de disqualification (disqualify.ts). */
export async function stageTeamDisqualification(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  teamId: string
) {
  const { data, error } = await db
    .from('stage_teams')
    .select(
      'team_id, disqualified_at, disqualification_mode, disqualification_reason, disqualified_by, team:team_id(id, name)'
    )
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .eq('team_id', teamId)
    .maybeSingle();
  return { row: data, error };
}

/**
 * Pose (ou retire, valeurs `null`) la disqualification d'une inscription.
 * `onlyIfNotDisqualified` : écriture conditionnelle (deux staff qui
 * disqualifient en même temps → une seule écriture, l'autre lit 0 ligne).
 */
export async function setStageTeamDisqualification(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  teamId: string,
  patch: {
    disqualified_at: string | null;
    disqualification_mode: string | null;
    disqualification_reason: string | null;
    disqualified_by: string | null;
  },
  onlyIfNotDisqualified = false
) {
  let q = db
    .from('stage_teams')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .eq('team_id', teamId);
  if (onlyIfNotDisqualified) q = q.is('disqualified_at', null);
  const { data, error } = await q.select('team_id');
  return { count: (data ?? []).length, error };
}

/** Sous-ensemble de `teamIds` inscrit à la phase. */
export async function stageTeamIdsAmong(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  teamIds: string[]
) {
  const { data } = await db
    .from('stage_teams')
    .select('team_id')
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .in('team_id', teamIds);
  return (data ?? []).map((r) => r.team_id);
}

/** Équipes inscrites à l'une des phases, hors `excludeTeamId`. */
export async function teamIdsInStages(
  db: AdminDb,
  tenantId: string,
  stageIds: string[],
  excludeTeamId: string
) {
  const { data } = await db
    .from('stage_teams')
    .select('team_id')
    .eq('tenant_id', tenantId)
    .in('stage_id', stageIds)
    .neq('team_id', excludeTeamId);
  return (data ?? []).map((r) => r.team_id);
}

/** Clonage : inscriptions de la phase source. */
export async function stageTeamsForClone(
  db: AdminDb,
  tenantId: string,
  stageId: string
) {
  const { data } = await db
    .from('stage_teams')
    .select('team_id, seed')
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId);
  return data;
}

export async function insertStageTeams(
  db: AdminDb,
  rows: TablesInsert<'stage_teams'>[]
) {
  const { error } = await db.from('stage_teams').insert(rows);
  return { error };
}

export async function insertStageTeam(
  db: AdminDb,
  row: TablesInsert<'stage_teams'>
) {
  const { data, error } = await db
    .from('stage_teams')
    .insert(row)
    .select(STAGE_TEAM_COLUMNS)
    .maybeSingle();
  return { row: data, error };
}

export async function updateStageTeamSeed(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  teamId: string,
  seed: number | null
) {
  const { error } = await db
    .from('stage_teams')
    .update({ seed })
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .eq('team_id', teamId);
  return { error };
}

export async function updateStageTeamSeedReturning(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  teamId: string,
  seed: number | null
) {
  const { data, error } = await db
    .from('stage_teams')
    .update({ seed })
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .eq('team_id', teamId)
    .select(STAGE_TEAM_COLUMNS)
    .maybeSingle();
  return { row: data, error };
}

export async function deleteStageTeams(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  teamIds: string[]
) {
  const { error } = await db
    .from('stage_teams')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .in('team_id', teamIds);
  return { error };
}
