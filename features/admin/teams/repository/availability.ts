// features/admin/teams/repository/availability.ts — contraintes de
// disponibilité d'une équipe (`team_availability_constraints`).
// Modèle : database/migrations/team_availability_constraints.sql.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesInsert, TablesUpdate } from '@/types/database.generated';
import {
  AVAILABILITY_COLUMNS,
  type AvailabilityRow,
} from '@/utils/matches/availabilityRows';

export async function listConstraints(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  tournamentId: string | null
) {
  let q = db
    .from('team_availability_constraints')
    .select(AVAILABILITY_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId);
  // Les globales comptent pour tous les tournois : les exclure du filtre
  // donnerait une liste rassurante et fausse.
  if (tournamentId) {
    q = q.or(`tournament_id.eq.${tournamentId},tournament_id.is.null`);
  }
  const { data, error } = await q.order('created_at', { ascending: true });
  return { rows: (data ?? []) as unknown as AvailabilityRow[], error };
}

export async function getOwnedConstraint(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  id: string
) {
  const { data } = await db
    .from('team_availability_constraints')
    .select(AVAILABILITY_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .maybeSingle();
  return (data as unknown as AvailabilityRow | null) ?? null;
}

export async function insertConstraint(
  db: AdminDb,
  row: TablesInsert<'team_availability_constraints'>
) {
  const { data, error } = await db
    .from('team_availability_constraints')
    .insert(row)
    .select(AVAILABILITY_COLUMNS)
    .single();
  return { row: data as unknown as AvailabilityRow | null, error };
}

export async function updateConstraint(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: TablesUpdate<'team_availability_constraints'>
) {
  const { data, error } = await db
    .from('team_availability_constraints')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(AVAILABILITY_COLUMNS)
    .single();
  return { row: data as unknown as AvailabilityRow | null, error };
}

export async function deleteConstraint(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { error } = await db
    .from('team_availability_constraints')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);
  return { error };
}
