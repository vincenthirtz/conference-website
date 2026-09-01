// utils/siteSettings.ts
//
// LECTURE ET ÉCRITURE DES RÉGLAGES, scopées au tenant — lot A8 de
// docs/PLAN-espace-admin.md.
//
// `site_settings` avait `key` pour clé primaire : un seul jeu de réglages pour
// toute l'installation, alors que le produit est multi-tenant partout ailleurs.
// Depuis la migration `scope_site_settings_by_tenant.sql`, la clé est
// `(tenant_id, key)` — et une lecture qui oublie le tenant ne rend plus une
// ligne mais N, ce que `.maybeSingle()` traduit par une 500 (PGRST116).
//
// D'où ce module : il est le SEUL endroit autorisé à toucher la table
// (`tests/unit/siteSettingsGuard.test.ts` le vérifie). Toute lecture passe donc
// forcément par un tenant explicite, et l'oubli devient impossible plutôt
// qu'improbable.

import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { logger } from '@/utils/logger';

export type SiteSettingRow = {
  key: string;
  value: string;
  description?: string | null;
  updated_at?: string | null;
};

/**
 * Valeur d'un réglage, ou `null` s'il n'existe pas pour ce tenant.
 *
 * Ne throw jamais : un réglage absent est un cas NORMAL (la valeur par défaut
 * du code s'applique), et une erreur de lecture ne doit pas faire tomber la
 * page qui l'interroge.
 */
export async function getSetting(
  key: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('site_settings')
    .select('value')
    .eq('tenant_id', tenantId)
    .eq('key', key)
    .maybeSingle();
  if (error) {
    logger.error('[siteSettings] read error (%s): %s', key, error.message);
    return null;
  }
  return (data as { value?: string | null } | null)?.value ?? null;
}

/** Plusieurs réglages d'un coup — une seule requête. */
export async function getSettings(
  keys: string[],
  tenantId: string = DEFAULT_TENANT_ID
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!supabaseAdmin || keys.length === 0) return out;
  const { data, error } = await supabaseAdmin
    .from('site_settings')
    .select('key, value')
    .eq('tenant_id', tenantId)
    .in('key', keys);
  if (error) {
    logger.error('[siteSettings] bulk read error: %s', error.message);
    return out;
  }
  for (const row of (data ?? []) as SiteSettingRow[]) {
    if (row?.key) out[row.key] = row.value ?? '';
  }
  return out;
}

/** Tous les réglages du tenant, pour les écrans d'administration. */
export async function listSettings(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<SiteSettingRow[]> {
  if (!supabaseAdmin) return [];
  const { data, error } = await supabaseAdmin
    .from('site_settings')
    .select('key, value, description, updated_at')
    .eq('tenant_id', tenantId)
    .order('key', { ascending: true });
  if (error) {
    logger.error('[siteSettings] list error: %s', error.message);
    return [];
  }
  return (data ?? []) as SiteSettingRow[];
}

/**
 * Écrit un réglage POUR CE TENANT. `onConflict` porte les deux colonnes de la
 * clé primaire : sans `tenant_id`, l'upsert écraserait la ligne d'un autre.
 */
export async function setSetting(
  key: string,
  value: string,
  options: {
    tenantId?: string;
    description?: string | null;
    updatedBy?: string | null;
  } = {}
): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  const row: Record<string, unknown> = { tenant_id: tenantId, key, value };
  if (options.description !== undefined) row.description = options.description;
  if (options.updatedBy !== undefined) row.updated_by = options.updatedBy;

  const { error } = await supabaseAdmin
    .from('site_settings')
    .upsert(row, { onConflict: 'tenant_id,key' });
  if (error) {
    logger.error('[siteSettings] write error (%s): %s', key, error.message);
    return false;
  }
  return true;
}

/** Supprime un réglage de ce tenant. */
export async function deleteSetting(
  key: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const { error } = await supabaseAdmin
    .from('site_settings')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('key', key);
  if (error) {
    logger.error('[siteSettings] delete error (%s): %s', key, error.message);
    return false;
  }
  return true;
}
