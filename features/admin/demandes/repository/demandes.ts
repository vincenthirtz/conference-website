// features/admin/demandes/repository/demandes.ts — lecture d'une demande
// (`demandes`) et du staff qui l'a traitée.

import type { AdminDb } from '@/utils/admin/serviceContext';
import { DEMANDE_DETAIL_COLUMNS } from '../schemas';

export async function getDemandeDetail(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data, error } = await db
    .from('demandes')
    .select(DEMANDE_DETAIL_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

/** Ce que la relance des capitaines lit d'une demande. */
export async function getDemandeForNotify(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data } = await db
    .from('demandes')
    .select('id, team_id, status, type, payload')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

/**
 * Staff qui a traité la demande. Sans filtre d'espace (lecture d'origine) :
 * l'id vient de la demande, déjà bornée à l'espace.
 */
export async function getStaffBrief(db: AdminDb, staffId: string) {
  const { data } = await db
    .from('staff')
    .select('id, display_name, role')
    .eq('id', staffId)
    .maybeSingle();
  return data;
}

/** Profil Auth du demandeur (email + métadonnées). */
export async function getAuthUser(db: AdminDb, userId: string) {
  const { data } = await db.auth.admin.getUserById(userId);
  return data?.user ?? null;
}
