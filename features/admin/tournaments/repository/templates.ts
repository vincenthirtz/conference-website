// features/admin/tournaments/repository/templates.ts — modèles de tournoi
// personnalisés, un blob JSON dans `site_settings`.
//
// Rangés sous le tenant PAR DÉFAUT quel que soit l'espace du staff :
// comportement historique conservé (cf. rapport de la vague serveur 4).

import type { AdminDb } from '@/utils/admin/serviceContext';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';

const SETTINGS_KEY = 'custom_tournament_templates';

export async function readTemplatesBlob(db: AdminDb): Promise<string | null> {
  const { data } = await db
    .from('site_settings')
    .select('value')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('key', SETTINGS_KEY)
    .maybeSingle();
  return (data?.value as string | null | undefined) ?? null;
}

export async function writeTemplatesBlob(db: AdminDb, value: string) {
  const { data: existing } = await db
    .from('site_settings')
    .select('key')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('key', SETTINGS_KEY)
    .maybeSingle();

  if (existing) {
    await db
      .from('site_settings')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('key', SETTINGS_KEY);
  } else {
    await db
      .from('site_settings')
      .insert({ tenant_id: DEFAULT_TENANT_ID, key: SETTINGS_KEY, value });
  }
}
