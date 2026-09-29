// features/admin/circuit-partners/repository.ts — candidatures à l'offre
// partenaire. `circuit_partner_applications` est une table de PLATEFORME (pas
// de `tenant_id`) : ces lectures ne sont pas scopées par espace, et la garde
// de la route est de portée plateforme (`manage_tenant`, scope 'platform').

import type { AdminDb } from '@/utils/admin/serviceContext';
import { CIRCUIT_APPLICATION_COLUMNS } from './schemas';

export async function listApplications(db: AdminDb, status: string | null) {
  let query = db
    .from('circuit_partner_applications')
    .select(CIRCUIT_APPLICATION_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  return { rows: data ?? [], error };
}

export async function listApplicationStatuses(db: AdminDb) {
  const { data, error } = await db
    .from('circuit_partner_applications')
    .select('status');
  return { rows: data ?? [], error };
}

/** Slugs des espaces qui ont reçu l'offre (ids venant des candidatures). */
export async function listTenantSlugs(db: AdminDb, ids: string[]) {
  const { data, error } = await db
    .from('tenants')
    .select('id, slug')
    .in('id', ids);
  return { rows: data ?? [], error };
}

/**
 * Passe une candidature en examen / refus. Une candidature accordée ne se
 * rouvre pas ici : le plan est posé (`neq('status', 'approved')`).
 */
export async function setApplicationStatus(
  db: AdminDb,
  id: string,
  patch: {
    status: 'reviewing' | 'rejected';
    admin_notes?: string;
    decided_by?: string;
    decided_at?: string;
  }
) {
  const { data, error } = await db
    .from('circuit_partner_applications')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .neq('status', 'approved')
    .select('id');
  return { rows: data ?? null, error };
}
