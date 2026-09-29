// features/admin/matches/repository/veto.ts — accès base du veto de cartes
// d'un match (`match_map_vetos`, verrou `matches.veto_locked_at`).
// `tenantId` est un paramètre OBLIGATOIRE de chaque fonction.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesInsert } from '@/types/database.generated';
import { VETO_ROW_COLUMNS } from '../schemas';

export async function getMatchForVeto(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { data, error } = await db
    .from('matches')
    .select(
      'id, tournament_id, match_format, team1_id, team2_id, veto_locked_at'
    )
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function listVetoSteps(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { data, error } = await db
    .from('match_map_vetos')
    .select(VETO_ROW_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId)
    .order('step_number', { ascending: true });
  return { rows: data, error };
}

export async function countVetoSteps(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { count, error } = await db
    .from('match_map_vetos')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId);
  return { count, error };
}

export async function listVetoMaps(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { data } = await db
    .from('match_map_vetos')
    .select('map_name, action')
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId);
  return data ?? [];
}

export async function insertVetoStep(
  db: AdminDb,
  row: TablesInsert<'match_map_vetos'>
) {
  const { data, error } = await db
    .from('match_map_vetos')
    .insert(row)
    .select(VETO_ROW_COLUMNS)
    .maybeSingle();
  return { row: data, error };
}

export async function deleteVetoSteps(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { error } = await db
    .from('match_map_vetos')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId);
  return { error };
}

export async function unlockVeto(
  db: AdminDb,
  tenantId: string,
  matchId: string
) {
  const { error } = await db
    .from('matches')
    .update({ veto_locked_at: null, updated_at: new Date().toISOString() })
    .eq('id', matchId)
    .eq('tenant_id', tenantId);
  return { error };
}

export async function listTeamNames(
  db: AdminDb,
  tenantId: string,
  teamIds: string[]
) {
  const { data } = await db
    .from('teams')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .in('id', teamIds);
  return data ?? [];
}
