// features/admin/tournaments/repository/teams.ts — accès base des équipes
// d'un tournoi : inscriptions, liste d'attente regroupée (pool), relance des
// responsables. `tenantId` obligatoire partout.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesInsert, TablesUpdate } from '@/types/database.generated';
import { TOURNAMENT_TEAM_ENTRY_COLUMNS } from '../schemas';

/* ---- Inscriptions ---- */

export async function listEntries(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('tournament_teams')
    .select(
      `
      id,
      tournament_id,
      team_id,
      seed,
      status,
      created_at,
      field_values,
      team:teams (
        id,
        name,
        logo_url
      )
    `
    )
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .order('seed', { ascending: true, nullsFirst: false });
}

export async function getEntry(db: AdminDb, tenantId: string, entryId: string) {
  return db
    .from('tournament_teams')
    .select(TOURNAMENT_TEAM_ENTRY_COLUMNS)
    .eq('id', entryId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
}

/** État lu avant modification / retrait (pour le journal). */
export async function getEntryBefore(
  db: AdminDb,
  tenantId: string,
  entryId: string
) {
  return db
    .from('tournament_teams')
    .select('id, team_id, seed, status, team:teams(name)')
    .eq('id', entryId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
}

export async function updateEntry(
  db: AdminDb,
  tenantId: string,
  entryId: string,
  patch: TablesUpdate<'tournament_teams'>
) {
  return db
    .from('tournament_teams')
    .update(patch)
    .eq('id', entryId)
    .eq('tenant_id', tenantId)
    .select(TOURNAMENT_TEAM_ENTRY_COLUMNS)
    .single();
}

export async function deleteEntry(
  db: AdminDb,
  tenantId: string,
  entryId: string
) {
  return db
    .from('tournament_teams')
    .delete()
    .eq('id', entryId)
    .eq('tenant_id', tenantId);
}

export async function findTeam(db: AdminDb, tenantId: string, teamId: string) {
  return db
    .from('teams')
    .select('id, name')
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
}

export async function countTeamMembers(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  return db
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId);
}

export async function findEntryByTeam(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  teamId: string
) {
  const { data } = await db
    .from('tournament_teams')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .eq('team_id', teamId)
    .maybeSingle();
  return data;
}

export async function countEntries(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { count } = await db
    .from('tournament_teams')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId);
  return count;
}

export async function insertEntry(
  db: AdminDb,
  row: TablesInsert<'tournament_teams'>
) {
  return db
    .from('tournament_teams')
    .insert(row)
    .select(
      `
      id,
      tournament_id,
      team_id,
      seed,
      status,
      created_at,
      field_values,
      team:teams (
        id,
        name,
        logo_url,
        is_active
      )
    `
    )
    .single();
}

/** Candidatures `pending` de l'équipe à ce tournoi, désormais sans objet. */
export async function approvePendingRegistrations(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  teamId: string,
  staffId: string | null
) {
  return db
    .from('demandes')
    .update({
      status: 'approved',
      processed_at: new Date().toISOString(),
      processed_by_staff_id: staffId,
    })
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .eq('team_id', teamId)
    .eq('type', 'team_registration')
    .eq('status', 'pending');
}

export async function insertNews(db: AdminDb, row: TablesInsert<'news'>) {
  return db.from('news').insert(row);
}

/* ---- Liste d'attente regroupée (pool) ---- */

export async function poolEntries(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('tournament_pool_entries')
    .select(
      'id, display_name, battle_tag, origin_team_id, placed_team_id, status, created_at'
    )
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .neq('status', 'withdrawn')
    .order('created_at', { ascending: true });
}

export async function registeredTeamIds(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('tournament_teams')
    .select('team_id, created_at')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true });
}

export async function teamsByIds(db: AdminDb, tenantId: string, ids: string[]) {
  return db
    .from('teams')
    .select('id, name, is_active')
    .eq('tenant_id', tenantId)
    .in('id', ids);
}

export async function poolOrigins(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  entryIds: string[]
) {
  return db
    .from('tournament_pool_entries')
    .select('origin_team_id')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .in('id', entryIds);
}

export async function poolPlace(
  db: AdminDb,
  args: {
    p_tenant_id: string;
    p_tournament_id: string;
    p_entry_ids: string[];
    p_team_id: string;
    p_team_size: number;
  }
) {
  return db.rpc('pool_place', args);
}

export async function poolUnplace(
  db: AdminDb,
  args: { p_tenant_id: string; p_tournament_id: string; p_entry_id: string }
) {
  return db.rpc('pool_unplace', args);
}

export async function insertTeamReturningId(
  db: AdminDb,
  row: TablesInsert<'teams'>
) {
  return db.from('teams').insert(row).select('id').maybeSingle();
}

export async function deleteTeam(db: AdminDb, tenantId: string, id: string) {
  return db.from('teams').delete().eq('id', id).eq('tenant_id', tenantId);
}

/* ---- Relance des responsables d'équipe ---- */

export async function activeTeams(db: AdminDb, tenantId: string) {
  return db
    .from('teams')
    .select('id, name, captain_id')
    .eq('is_active', true)
    .eq('tenant_id', tenantId);
}

export async function teamManagers(
  db: AdminDb,
  tenantId: string,
  teamIds: string[]
) {
  return db
    .from('team_members')
    .select('team_id, user_id')
    .eq('role', 'manager')
    .eq('tenant_id', tenantId)
    .in('team_id', teamIds);
}

export async function insertDemande(
  db: AdminDb,
  row: TablesInsert<'demandes'>
) {
  return db.from('demandes').insert(row);
}

export async function authUserEmail(db: AdminDb, userId: string) {
  const { data } = await db.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}
