// features/admin/tournaments/repository/templates.ts — modèles de tournoi
// personnalisés, un blob JSON dans `site_settings`.
//
// Rangés sous l'espace qui les a créés ; ceux du tenant par défaut sont
// partagés en lecture (décision dans service/templates.ts).

import type { AdminDb } from '@/utils/admin/serviceContext';

const SETTINGS_KEY = 'custom_tournament_templates';

export async function readTemplatesBlob(
  db: AdminDb,
  tenantId: string
): Promise<string | null> {
  const { data } = await db
    .from('site_settings')
    .select('value')
    .eq('tenant_id', tenantId)
    .eq('key', SETTINGS_KEY)
    .maybeSingle();
  return (data?.value as string | null | undefined) ?? null;
}

export async function writeTemplatesBlob(
  db: AdminDb,
  tenantId: string,
  value: string
) {
  const { data: existing } = await db
    .from('site_settings')
    .select('key')
    .eq('tenant_id', tenantId)
    .eq('key', SETTINGS_KEY)
    .maybeSingle();

  if (existing) {
    await db
      .from('site_settings')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('key', SETTINGS_KEY);
  } else {
    await db
      .from('site_settings')
      .insert({ tenant_id: tenantId, key: SETTINGS_KEY, value });
  }
}
