// features/admin/site-settings/repository.ts — accès base des réglages du
// site et des webhooks Discord globaux, scopé par tenant.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Database } from '@/types/database.generated';
import { DISCORD_WEBHOOK_COLUMNS, SITE_SETTING_COLUMNS } from './schemas';

type SiteSettingInsert =
  Database['public']['Tables']['site_settings']['Insert'];
type SiteSettingUpdate =
  Database['public']['Tables']['site_settings']['Update'];

export async function listSettings(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('site_settings')
    .select(SITE_SETTING_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('key');
  return { rows: data ?? [], error };
}

export async function getSetting(db: AdminDb, tenantId: string, key: string) {
  const { data, error } = await db
    .from('site_settings')
    .select(SITE_SETTING_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('key', key)
    .single();
  return { row: data ?? null, error };
}

/**
 * `tenant_id` explicite ET dans `onConflict` : sans lui, l'upsert écraserait
 * le réglage d'un autre tenant (lot A8).
 */
export async function upsertSetting(
  db: AdminDb,
  tenantId: string,
  row: Omit<SiteSettingInsert, 'tenant_id'>
) {
  const { data, error } = await db
    .from('site_settings')
    .upsert({ ...row, tenant_id: tenantId }, { onConflict: 'tenant_id,key' })
    .select(SITE_SETTING_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

/** Même upsert, sans relire la ligne (rôles d'équipe). */
export async function writeSetting(
  db: AdminDb,
  tenantId: string,
  row: Omit<SiteSettingInsert, 'tenant_id'>
) {
  const { error } = await db
    .from('site_settings')
    .upsert({ ...row, tenant_id: tenantId }, { onConflict: 'tenant_id,key' });
  return { error };
}

export async function updateSetting(
  db: AdminDb,
  tenantId: string,
  key: string,
  payload: SiteSettingUpdate
) {
  const { data, error } = await db
    .from('site_settings')
    .update(payload)
    .eq('tenant_id', tenantId)
    .eq('key', key)
    .select(SITE_SETTING_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

export async function deleteSetting(
  db: AdminDb,
  tenantId: string,
  key: string
) {
  const { error } = await db
    .from('site_settings')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('key', key);
  return { error };
}

/* ---- Webhooks Discord globaux (tournament_id IS NULL) ---- */

export async function listGlobalWebhooks(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('discord_webhooks')
    .select(DISCORD_WEBHOOK_COLUMNS)
    .eq('tenant_id', tenantId)
    .is('tournament_id', null)
    .order('channel_type', { ascending: true });
  return { rows: data ?? [], error };
}

export async function findGlobalWebhookId(
  db: AdminDb,
  tenantId: string,
  channelType: string
) {
  const { data } = await db
    .from('discord_webhooks')
    .select('id')
    .eq('tenant_id', tenantId)
    .is('tournament_id', null)
    .eq('channel_type', channelType)
    .maybeSingle();
  return data?.id ?? null;
}

/** URL du webhook global ACTIF d'un type de salon, ou `null`. */
export async function findActiveGlobalWebhookUrl(
  db: AdminDb,
  tenantId: string,
  channelType: string
) {
  const { data } = await db
    .from('discord_webhooks')
    .select('webhook_url')
    .eq('tenant_id', tenantId)
    .is('tournament_id', null)
    .eq('channel_type', channelType)
    .eq('is_active', true)
    .maybeSingle();
  return data?.webhook_url ?? null;
}

export async function updateGlobalWebhook(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: {
    webhook_url: string;
    role_mention: string | null;
    is_active: boolean;
  }
) {
  const { data, error } = await db
    .from('discord_webhooks')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(DISCORD_WEBHOOK_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function insertGlobalWebhook(
  db: AdminDb,
  tenantId: string,
  row: {
    channel_type: string;
    webhook_url: string;
    role_mention: string | null;
    is_active: boolean;
  }
) {
  const { data, error } = await db
    .from('discord_webhooks')
    .insert({
      // `tenant_id` est NOT NULL sans default : sans lui l'insert part en
      // 23502 et la création d'un webhook global échoue en 500.
      tenant_id: tenantId,
      tournament_id: null,
      ...row,
    })
    .select(DISCORD_WEBHOOK_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function deleteGlobalWebhook(
  db: AdminDb,
  tenantId: string,
  channelType: string
) {
  const { error } = await db
    .from('discord_webhooks')
    .delete()
    .eq('tenant_id', tenantId)
    .is('tournament_id', null)
    .eq('channel_type', channelType);
  return { error };
}
