// features/admin/teams/repository/imports.ts — réglages lus par l'import
// d'équipes depuis une plateforme tierce (`site_settings`).

import type { AdminDb } from '@/utils/admin/serviceContext';

/** Valeur d'un réglage de l'espace donné (`null` si absent). */
export async function getSiteSetting(
  db: AdminDb,
  tenantId: string,
  key: string
) {
  const { data } = await db
    .from('site_settings')
    .select('value')
    .eq('tenant_id', tenantId)
    .eq('key', key)
    .maybeSingle();
  return data;
}
