// features/admin/stages/repository/matches.ts — accès aux matchs d'une phase
// (lecture, génération, seeding, opérations en masse).
//
// Mêmes requêtes que les routes d'origine, toutes filtrées par espace.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesInsert, TablesUpdate } from '@/types/database.generated';
import { CLONE_SOURCE_MATCH_COLUMNS } from '../schemas';

/** Colonnes lues pour suivre une phase (statut, rondes, vainqueurs). */
const STAGE_MATCH_COLUMNS =
  'id, tournament_id, stage_id, status, is_bye, round_number, team1_id, team2_id, winner_team_id, team1_score, team2_score' as const;

/** Matchs non annulés et non supprimés d'une phase. */
export async function activeStageMatches(
  db: AdminDb,
  tenantId: string,
  stageId: string
) {
  const { data, error } = await db
    .from('matches')
    .select(STAGE_MATCH_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .neq('status', 'cancelled')
    .is('deleted_at', null);
  return { rows: data, error };
}

/**
 * Matchs d'une équipe dans la phase (disqualification) : non supprimés,
 * statut parmi `statuses`. `teamId` est un UUID validé en amont (zod).
 */
export async function teamStageMatches(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  teamId: string,
  statuses: readonly string[]
) {
  const { data, error } = await db
    .from('matches')
    .select(
      'id, status, round_number, team1_id, team2_id, forfeit_team_id, notes, scheduled_at'
    )
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .is('deleted_at', null)
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
    .in('status', statuses as string[])
    .order('round_number', { ascending: true, nullsFirst: false })
    .order('scheduled_at', { ascending: true, nullsFirst: false });
  return { rows: data, error };
}

/**
 * Annule un match encore ouvert : statut `cancelled`, scores et vainqueur
 * vidés, note complétée. Conditionnel au statut (un match passé en
 * `finished` entre la lecture et l'écriture n'est pas touché → 0 ligne).
 */
export async function cancelOpenMatch(
  db: AdminDb,
  tenantId: string,
  matchId: string,
  notes: string,
  openStatuses: readonly string[]
) {
  const { data, error } = await db
    .from('matches')
    .update({
      status: 'cancelled',
      team1_score: null,
      team2_score: null,
      winner_team_id: null,
      notes,
    })
    .eq('tenant_id', tenantId)
    .eq('id', matchId)
    .in('status', openStatuses as string[])
    .select('id');
  return { count: (data ?? []).length, error };
}

/** Idem, éventuellement limité à un round (auto-byes). */
export async function activeStageMatchesInRound(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  round: number | undefined
) {
  let query = db
    .from('matches')
    .select(STAGE_MATCH_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .neq('status', 'cancelled');
  if (round !== undefined) query = query.eq('round_number', round);
  const { data, error } = await query;
  return { rows: data, error };
}

/** Matchs du round 1 d'un bracket, ordre stable (création). */
export async function roundOneMatches(
  db: AdminDb,
  tenantId: string,
  stageId: string
) {
  const { data, error } = await db
    .from('matches')
    .select('id, round_number, team1_id, team2_id, status, created_at')
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .eq('round_number', 1)
    .order('created_at', { ascending: true });
  return { rows: data, error };
}

export async function matchesByIds(
  db: AdminDb,
  tenantId: string,
  ids: string[]
) {
  const { data, error } = await db
    .from('matches')
    .select('id, stage_id, round_number, team1_id, team2_id, status')
    .eq('tenant_id', tenantId)
    .in('id', ids);
  return { rows: data, error };
}

/** Phase de chaque match de l'espace (batch-scores). */
export async function matchStages(
  db: AdminDb,
  tenantId: string,
  ids: string[]
) {
  const { data, error } = await db
    .from('matches')
    .select('id, stage_id')
    .eq('tenant_id', tenantId)
    .in('id', ids);
  return { rows: data, error };
}

/** Place une équipe dans un slot (1 → team1, 2 → team2). */
export async function setMatchSlot(
  db: AdminDb,
  tenantId: string,
  matchId: string,
  slot: 1 | 2,
  teamId: string,
  touchUpdatedAt = false
) {
  const patch: TablesUpdate<'matches'> =
    slot === 1 ? { team1_id: teamId } : { team2_id: teamId };
  if (touchUpdatedAt) patch.updated_at = new Date().toISOString();
  const { error } = await db
    .from('matches')
    .update(patch)
    .eq('id', matchId)
    .eq('tenant_id', tenantId);
  return { error };
}

/** Matchs terminés (ou forfaits) de l'espace — force du calendrier. */
export async function finishedMatchesForSos(db: AdminDb, tenantId: string) {
  const { data } = await db
    .from('matches')
    .select('team1_id, team2_id, status, is_bye')
    .eq('tenant_id', tenantId)
    .in('status', ['finished', 'walkover']);
  return data ?? [];
}

export async function insertMatchesReturningIds(
  db: AdminDb,
  rows: TablesInsert<'matches'>[]
) {
  const { data, error } = await db.from('matches').insert(rows).select('id');
  return { rows: data, error };
}

export async function insertSwissMatches(
  db: AdminDb,
  rows: TablesInsert<'matches'>[]
) {
  const { data, error } = await db
    .from('matches')
    .insert(rows)
    .select('id, team1_id, team2_id, is_bye, round_number, status');
  return { rows: data, error };
}

export async function cloneSourceMatches(
  db: AdminDb,
  tenantId: string,
  stageId: string
) {
  const { data, error } = await db
    .from('matches')
    .select(CLONE_SOURCE_MATCH_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId);
  return { rows: data, error };
}

export async function updateMatchLinks(
  db: AdminDb,
  tenantId: string,
  matchId: string,
  links: { next_match_win_id: string | null; next_match_lose_id: string | null }
) {
  await db
    .from('matches')
    .update(links)
    .eq('id', matchId)
    .eq('tenant_id', tenantId);
}

/** Matchs d'une poule (pour déduire les groupes quand rien n'est réglé). */
export async function groupedStageMatches(
  db: AdminDb,
  tenantId: string,
  stageId: string
) {
  const { data } = await db
    .from('matches')
    .select('team1_id, team2_id, group_key')
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .neq('status', 'cancelled')
    .not('group_key', 'is', null);
  return data;
}

/** Pose `group_key` sur les matchs de la phase où l'équipe est `slot`. */
export async function setGroupKeyForTeam(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  slot: 'team1_id' | 'team2_id',
  teamId: string,
  groupKey: string | null
) {
  await db
    .from('matches')
    .update({ group_key: groupKey })
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .eq(slot, teamId);
}

/** Vide les slots d'équipes retirées de la phase (garde la structure). */
export async function clearTeamSlots(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  teamIds: string[]
) {
  return Promise.all([
    db
      .from('matches')
      .update({ team1_id: null, team1_score: null, winner_team_id: null })
      .eq('tenant_id', tenantId)
      .eq('stage_id', stageId)
      .in('team1_id', teamIds),
    db
      .from('matches')
      .update({ team2_id: null, team2_score: null, winner_team_id: null })
      .eq('tenant_id', tenantId)
      .eq('stage_id', stageId)
      .in('team2_id', teamIds),
  ]);
}

/** BYE figé (auto-byes). */
export async function finishAsBye(
  db: AdminDb,
  tenantId: string,
  matchId: string,
  patch: TablesUpdate<'matches'>
) {
  const { error } = await db
    .from('matches')
    .update(patch)
    .eq('id', matchId)
    .eq('tenant_id', tenantId);
  return { error };
}

/* ------------------------- opérations en masse ------------------------- */

export async function scheduleSnapshots(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  ids: string[]
) {
  const { data } = await db
    .from('matches')
    .select('id, scheduled_at')
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .in('id', ids);
  return data ?? [];
}

/** Matchs de la phase parmi `ids` (undo : recoupement avant écriture). */
export async function stageMatchesByIds(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  ids: string[]
) {
  const { data, error } = await db
    .from('matches')
    .select('id, team1_id, team2_id')
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .in('id', ids);
  return { rows: data, error };
}

/** Écrit un patch sur UN match de la phase. */
export async function updateStageMatch(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  matchId: string,
  patch: TablesUpdate<'matches'>
) {
  const { error } = await db
    .from('matches')
    .update(patch)
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId);
  return { error };
}

/** Écrit un patch sur plusieurs matchs de la phase (renvoie `count`). */
export async function updateStageMatches(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  ids: string[],
  patch: TablesUpdate<'matches'>
) {
  const { error, count } = await db
    .from('matches')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .in('id', ids);
  return { error, count };
}

export async function deleteStageMatches(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  ids: string[]
) {
  const { error } = await db
    .from('matches')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .in('id', ids);
  return { error };
}

/**
 * Instantané des champs édités, AVANT écriture, pour l'annulation. La liste
 * de colonnes vient d'une liste blanche (`BULK_EDITABLE_FIELDS`), construite
 * à l'exécution : le type généré ne peut pas la suivre.
 */
export async function fieldSnapshots(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  ids: string[],
  columns: string
) {
  const { data } = await db
    .from('matches')
    .select(columns)
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .in('id', ids);
  return (data ?? []) as unknown as Array<
    { id: string } & Record<string, unknown>
  >;
}

export async function cancelSnapshots(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  ids: string[]
) {
  const { data } = await db
    .from('matches')
    .select('id, status, team1_score, team2_score, winner_team_id')
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .in('id', ids);
  return data ?? [];
}
