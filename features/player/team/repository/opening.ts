// features/player/team/repository/opening.ts — accès `team_openings` pour
// l'annonce rattachée à l'équipe gérée (lot P8). Toujours scopé tenant.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesInsert, TablesUpdate } from '@/types/database.generated';
import { TEAM_OPENING_SELECT, type TeamOpeningRow } from '@/utils/teamOpenings';

/** Annonce la plus récente rattachée à l'équipe (une seule attendue). */
export async function readTeamOpening(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data, error } = await db
    .from('team_openings')
    .select(TEAM_OPENING_SELECT)
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .order('marked_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { row: (data as TeamOpeningRow | null) ?? null, error };
}

export async function readTeamName(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data, error } = await db
    .from('teams')
    .select('name')
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return {
    name: ((data as { name?: string | null } | null)?.name ?? '').trim(),
    error,
  };
}

export async function insertTeamOpening(
  db: AdminDb,
  row: TablesInsert<'team_openings'>
) {
  const { data, error } = await db
    .from('team_openings')
    .insert(row)
    .select(TEAM_OPENING_SELECT)
    .maybeSingle();
  return { row: (data as TeamOpeningRow | null) ?? null, error };
}

export async function updateTeamOpeningById(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: TablesUpdate<'team_openings'>
) {
  const { data, error } = await db
    .from('team_openings')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(TEAM_OPENING_SELECT)
    .maybeSingle();
  return { row: (data as TeamOpeningRow | null) ?? null, error };
}

/**
 * Adoption de l'annonce publique SANS COMPTE déposée avec le même email que le
 * compte authentifié (index unique `tenant + lower(contact_email)` côté web).
 * Sûr parce que l'email est celui de la session : c'est la même personne.
 */
export async function updateWebOpeningByEmail(
  db: AdminDb,
  tenantId: string,
  email: string,
  patch: TablesUpdate<'team_openings'>
) {
  const { data, error } = await db
    .from('team_openings')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('source', 'web')
    .eq('contact_email', email)
    .select(TEAM_OPENING_SELECT)
    .maybeSingle();
  return { row: (data as TeamOpeningRow | null) ?? null, error };
}

export async function deleteTeamOpenings(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { error } = await db
    .from('team_openings')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId);
  return { error };
}
