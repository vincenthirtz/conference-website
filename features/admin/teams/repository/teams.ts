// features/admin/teams/repository/teams.ts — accès base aux équipes (`teams`)
// et à ce que leur fiche ou leur suppression touche (`team_members`,
// `demandes`, `stage_teams`).
//
// Les requêtes sont celles des routes d'origine, à l'identique (filtres,
// ordre) ; seul `select('*')` devient la liste explicite `TEAM_ROW_COLUMNS`.
// `tenantId` est un paramètre obligatoire.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesUpdate } from '@/types/database.generated';
import {
  applyAdminTeamsFilters,
  type AdminTeamsFilters,
} from '@/utils/teams/adminTeamsFilters';
import { TEAM_ROW_COLUMNS } from '../schemas';

export type TeamListParams = AdminTeamsFilters & {
  limit: number;
  offset: number;
  withCount: boolean;
  /** `null` = pas de filtre ; sinon, restreint à ces équipes. */
  teamIds: string[] | null;
};

export async function listTeams(
  db: AdminDb,
  tenantId: string,
  p: TeamListParams
) {
  let query = applyAdminTeamsFilters(
    db
      .from('teams')
      .select(TEAM_ROW_COLUMNS, {
        count: p.withCount ? 'exact' : undefined,
      })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(p.offset, p.offset + p.limit - 1),
    {
      search: p.search,
      isActive: p.isActive,
      includeDeleted: p.includeDeleted,
    }
  );
  if (p.teamIds) query = query.in('id', p.teamIds);
  const { data, error, count } = await query;
  return { rows: data ?? [], error, count };
}

export async function getTeamRow(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('teams')
    .select(TEAM_ROW_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

/** Équipe réduite à `id, name` (roster-lock, disponibilités). */
export async function getTeamName(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('teams')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  return { row: data, error };
}

/** Même lecture que …/tournaments d'origine (`.single()`). */
export async function getTeamNameSingle(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data, error } = await db
    .from('teams')
    .select('id, name')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
  return { row: data, error };
}

export async function getTeamLogo(db: AdminDb, tenantId: string, id: string) {
  const { data } = await db
    .from('teams')
    .select('logo_url')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

export async function updateTeamRow(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: TablesUpdate<'teams'>
) {
  const { data, error } = await db
    .from('teams')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(TEAM_ROW_COLUMNS)
    .maybeSingle();
  return { row: data, error };
}

export async function deleteTeamRow(db: AdminDb, tenantId: string, id: string) {
  const { error } = await db
    .from('teams')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);
  return { error };
}

/** Dépendances effacées avant une suppression définitive. */
export async function deleteTeamDependents(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  table: 'demandes' | 'stage_teams' | 'team_members'
) {
  const { error } = await db
    .from(table)
    .delete()
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId);
  return { error };
}

/** Roster joint à la fiche (`?withMembers=1`). */
export async function listTeamMembersBrief(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data, error } = await db
    .from('team_members')
    .select('id, user_id, role, battle_tag')
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId);
  return { rows: data ?? [], error };
}

/** Rôles du roster (décompte des joueuses, cf. `countPlayingMembers`). */
export async function listTeamMemberRoles(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data, error } = await db
    .from('team_members')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId);
  return { rows: data ?? [], error };
}

/* ------------------------------ lots ----------------------------------- */

export async function bulkUpdateTeams(
  db: AdminDb,
  tenantId: string,
  ids: string[],
  patch: TablesUpdate<'teams'>
) {
  const { data, error } = await db
    .from('teams')
    .update(patch)
    .in('id', ids)
    .eq('tenant_id', tenantId)
    .select('id');
  return { rows: data ?? [], error };
}

/**
 * `userId` peut-il être capitaine de `teamId` ? Même règle d'intégrité que
 * la RPC `reassign_captain` : membre de l'équipe, dans l'espace, non-coach.
 */
export async function isEligibleCaptain(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  userId: string
) {
  const { data, error } = await db
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .neq('role', 'coach')
    .limit(1);
  return { eligible: (data ?? []).length > 0, error };
}

/** Ids de `ids` qui sont des équipes de `tenantId`. */
export async function teamIdsInTenant(
  db: AdminDb,
  tenantId: string,
  ids: string[]
) {
  const { data, error } = await db
    .from('teams')
    .select('id')
    .in('id', ids)
    .eq('tenant_id', tenantId);
  return { ids: new Set((data ?? []).map((r) => r.id)), error };
}

export async function tournamentExists(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data } = await db
    .from('tournaments')
    .select('id')
    .eq('id', tournamentId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return !!data;
}

export async function upsertRegistrationsIgnoringDuplicates(
  db: AdminDb,
  rows: Array<{
    tenant_id: string;
    tournament_id: string;
    team_id: string;
    status: string;
  }>
) {
  const { data, error } = await db
    .from('tournament_teams')
    .upsert(rows, {
      onConflict: 'tournament_id,team_id',
      ignoreDuplicates: true,
    })
    .select('id');
  return { rows: data ?? [], error };
}

/* ---------------------------- actualités ------------------------------- */

export async function insertNews(
  db: AdminDb,
  row: {
    tenant_id: string;
    title: string;
    slug: string;
    tag: string;
    excerpt: string;
    content: string;
    image_url: string | null;
    team_id: string;
    status: string;
    published_at: string;
  }
) {
  return db.from('news').insert(row);
}
