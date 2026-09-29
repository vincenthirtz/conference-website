// features/admin/tenants/repository/helloasso.ts — slug de l'espace et
// estampille « association vérifiée » (colonnes `nonprofit_*` de `tenants`).

import type { AdminDb } from '@/utils/admin/serviceContext';

export async function readTenantSlug(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('tenants')
    .select('slug')
    .eq('id', tenantId)
    .maybeSingle();
  return { slug: (data as { slug?: string } | null)?.slug ?? null, error };
}

export async function readNonprofitProvenance(db: AdminDb, tenantId: string) {
  const { data } = await db
    .from('tenants')
    .select('nonprofit_verified_via')
    .eq('id', tenantId)
    .maybeSingle();
  return data?.nonprofit_verified_via ?? null;
}

export async function writeNonprofitStamp(
  db: AdminDb,
  tenantId: string,
  stamp: {
    nonprofit_verified_at: string | null;
    nonprofit_org_name: string | null;
    nonprofit_verified_via: string | null;
  }
) {
  const { error } = await db.from('tenants').update(stamp).eq('id', tenantId);
  return { error };
}
