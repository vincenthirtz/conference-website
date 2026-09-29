// features/admin/tenants/repository/tenants.ts — l'espace lui-même, son staff,
// ses serveurs Discord, sa facturation.
//
// Exception documentée à « tenantId obligatoire » : ces routes agissent sur
// l'espace NOMMÉ dans l'URL (`tenantId` explicite en paramètre), ou listent
// tous les espaces (supervision de plateforme, garde `scope: 'platform'`).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Database } from '@/types/database.generated';
import {
  DISCORD_CONFIG_COLUMNS,
  TENANT_ACTIVE_COLUMNS,
  TENANT_CREATED_COLUMNS,
  TENANT_DETAIL_COLUMNS,
  TENANT_LIST_COLUMNS,
} from '../schemas';

type TenantUpdate = Database['public']['Tables']['tenants']['Update'];
type TenantInsert = Database['public']['Tables']['tenants']['Insert'];
type DiscordConfigUpsert =
  Database['public']['Tables']['tenant_discord_config']['Insert'];

/**
 * Client non typé, pour les seules lectures dont la table ou les colonnes
 * viennent d'un manifeste (`EXPORTABLE_TABLES`, `TENANT_DOMAINS`,
 * `CONFIG_KEYS`) : le type généré ne peut pas les suivre.
 */
export function untyped(db: AdminDb): SupabaseClient {
  return db as unknown as SupabaseClient;
}

/* ------------------------------ tenants -------------------------------- */

export async function getActiveTenant(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('tenants')
    .select(TENANT_ACTIVE_COLUMNS)
    .eq('id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function getTenantIdentity(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('tenants')
    .select('id, slug, name')
    .eq('id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function listTenants(db: AdminDb) {
  const { data, error } = await db
    .from('tenants')
    .select(TENANT_LIST_COLUMNS)
    .order('slug', { ascending: true });
  return { rows: data ?? [], error };
}

export async function insertTenant(db: AdminDb, payload: TenantInsert) {
  const { data, error } = await db
    .from('tenants')
    .insert(payload)
    .select(TENANT_CREATED_COLUMNS)
    .single();
  return { row: data, error };
}

export async function getTenantDetail(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('tenants')
    .select(TENANT_DETAIL_COLUMNS)
    .eq('id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function getTenantPlanAndDomain(db: AdminDb, tenantId: string) {
  const { data } = await db
    .from('tenants')
    .select('plan, plan_status, plan_expires_at, custom_domain')
    .eq('id', tenantId)
    .maybeSingle();
  return data;
}

export async function updateTenantDetail(
  db: AdminDb,
  tenantId: string,
  update: TenantUpdate
) {
  const { data, error } = await db
    .from('tenants')
    .update(update)
    .eq('id', tenantId)
    .select(TENANT_DETAIL_COLUMNS)
    .single();
  return { row: data, error };
}

export async function getTenantLifecycleRow(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('tenants')
    .select('id, slug, name, lifecycle_state')
    .eq('id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function updateTenantLifecycle(
  db: AdminDb,
  tenantId: string,
  update: TenantUpdate
) {
  const { data, error } = await db
    .from('tenants')
    .update(update)
    .eq('id', tenantId)
    .select(
      'id, slug, lifecycle_state, lifecycle_reason, purge_after, is_active'
    )
    .maybeSingle();
  return { row: data, error };
}

export async function getTenantForExport(db: AdminDb, tenantId: string) {
  const { data } = await db
    .from('tenants')
    .select('id, slug, name, created_at, plan, lifecycle_state')
    .eq('id', tenantId)
    .maybeSingle();
  return data;
}

/**
 * Lignes d'une table du manifeste d'export. `select('*')` VOULU : l'export
 * rend tout le contenu, et la liste des tables exclut les secrets par
 * construction (utils/tenants/tenantTables.ts).
 */
export async function exportTableRows(
  db: AdminDb,
  table: string,
  tenantId: string,
  limit: number
) {
  const { data, error } = await untyped(db)
    .from(table)
    .select('*')
    .eq('tenant_id', tenantId)
    .limit(limit);
  return { rows: (data ?? []) as unknown[], error };
}

export async function listTenantsForUsage(db: AdminDb) {
  const { data, error } = await db
    .from('tenants')
    .select('id, slug, name, plan, plan_status, plan_expires_at')
    .order('slug');
  return { rows: data ?? [], error };
}

export async function listUsageCounters(
  db: AdminDb,
  windowKey: string,
  tenantIds: string[]
) {
  const { data, error } = await db
    .from('api_usage_counters')
    .select('tenant_id, count, updated_at')
    .eq('window_kind', 'month')
    .eq('window_key', windowKey)
    .in('tenant_id', tenantIds);
  return { rows: data ?? [], error };
}

export async function listTenantsForReadiness(db: AdminDb) {
  const { data, error } = await db
    .from('tenants')
    .select(
      'id, slug, name, is_active, created_at, kind, plan, plan_status, plan_expires_at, plan_is_trial'
    )
    .order('created_at', { ascending: false });
  return { rows: data ?? [], error };
}

export async function getTenantForOverview(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('tenants')
    .select(
      'id, created_at, is_active, plan, plan_status, plan_expires_at, plan_is_trial, cgv_version, cgv_accepted_at'
    )
    .eq('id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

/* ------------------------- agrégats (supervision) ---------------------- */

export function readinessAggregates(
  db: AdminDb,
  tenantIds: string[],
  configColumns: string
) {
  return Promise.all([
    db
      .from('discord_guilds')
      .select('tenant_id, guild_id, is_primary')
      .in('tenant_id', tenantIds),
    untyped(db).from('tenant_discord_config').select(configColumns),
    db
      .from('tenant_staff')
      .select('tenant_id, role')
      .in('tenant_id', tenantIds),
    db.from('tenant_secrets').select('tenant_id').in('tenant_id', tenantIds),
    db
      .from('integration_secrets')
      .select('tenant_id')
      .eq('key', 'brevo_api_key')
      .in('tenant_id', tenantIds),
    db
      .from('tenant_api_tokens')
      .select('tenant_id, expires_at, revoked_at')
      .is('revoked_at', null)
      .in('tenant_id', tenantIds),
  ]);
}

/** Nombre de lignes d'un domaine du manifeste `TENANT_DOMAINS`. */
export async function countTenantRows(
  db: AdminDb,
  table: string,
  tenantId: string,
  where: Record<string, unknown>,
  softDeleteCol: string | undefined
) {
  let q = untyped(db)
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  for (const [col, value] of Object.entries(where)) {
    q = q.eq(col, value as never);
  }
  if (softDeleteCol) q = q.is(softDeleteCol, null);
  const { count, error } = await q;
  return { count, error };
}

/** Date la plus récente d'un signe de vie (`LIFE_SIGNS`). */
export async function latestTenantDate(
  db: AdminDb,
  table: string,
  dateCol: string,
  tenantId: string
) {
  const { data, error } = await untyped(db)
    .from(table)
    .select(dateCol)
    .eq('tenant_id', tenantId)
    .not(dateCol, 'is', null)
    .order(dateCol, { ascending: false })
    .limit(1);
  return { rows: (data ?? []) as unknown as Record<string, unknown>[], error };
}

export function overviewAggregates(db: AdminDb, tenantId: string) {
  return Promise.all([
    db.from('discord_guilds').select('guild_id').eq('tenant_id', tenantId),
    db
      .from('tenant_staff')
      .select('staff_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
    db
      .from('integration_secrets')
      .select('tenant_id')
      .eq('key', 'brevo_api_key')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    db
      .from('tenant_secrets')
      .select('tenant_id')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
  ]);
}

export async function listDiscordConfigColumns(
  db: AdminDb,
  columns: string,
  guildIds: string[]
) {
  const { data, error } = await untyped(db)
    .from('tenant_discord_config')
    .select(columns)
    .in('guild_id', guildIds);
  return { rows: (data ?? []) as unknown as Record<string, unknown>[], error };
}

/* --------------------------- guilds / staff ---------------------------- */

export async function countTenantGuildsAndStaff(
  db: AdminDb,
  tenantIds: string[]
) {
  return Promise.all([
    db.from('discord_guilds').select('tenant_id').in('tenant_id', tenantIds),
    db.from('tenant_staff').select('tenant_id').in('tenant_id', tenantIds),
  ]);
}

export async function listTenantGuilds(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('discord_guilds')
    .select('guild_id, is_primary, created_at')
    .eq('tenant_id', tenantId);
  return { rows: data ?? [], error };
}

export async function getGuildLink(db: AdminDb, guildId: string) {
  const { data, error } = await db
    .from('discord_guilds')
    .select('guild_id, tenant_id')
    .eq('guild_id', guildId)
    .maybeSingle();
  return { row: data, error };
}

export async function getTenantGuild(
  db: AdminDb,
  tenantId: string,
  guildId: string
) {
  const { data, error } = await db
    .from('discord_guilds')
    .select('guild_id')
    .eq('tenant_id', tenantId)
    .eq('guild_id', guildId)
    .maybeSingle();
  return { row: data, error };
}

export async function listTenantStaff(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('tenant_staff')
    .select('staff_id, role, created_at')
    .eq('tenant_id', tenantId);
  return { rows: data ?? [], error };
}

export async function listTenantStaffRoles(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('tenant_staff')
    .select('staff_id, role')
    .eq('tenant_id', tenantId);
  return { rows: data ?? [], error };
}

export async function getTenantStaffLink(
  db: AdminDb,
  tenantId: string,
  staffId: string
) {
  const { data } = await db
    .from('tenant_staff')
    .select('staff_id')
    .eq('tenant_id', tenantId)
    .eq('staff_id', staffId)
    .maybeSingle();
  return data;
}

export async function upsertTenantStaff(
  db: AdminDb,
  row: { tenant_id: string; staff_id: string; role: string }
) {
  const { error } = await db
    .from('tenant_staff')
    .upsert(row, { onConflict: 'tenant_id,staff_id' });
  return { error };
}

export async function deleteTenantStaff(
  db: AdminDb,
  tenantId: string,
  staffId: string
) {
  const { error } = await db
    .from('tenant_staff')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('staff_id', staffId);
  return { error };
}

export async function listStaffIdentities(db: AdminDb, staffIds: string[]) {
  const { data } = await db
    .from('staff')
    .select('id, email, display_name')
    .in('id', staffIds);
  return data ?? [];
}

export async function listStaffNames(db: AdminDb, staffIds: string[]) {
  const { data } = await db
    .from('staff')
    .select('id, display_name')
    .in('id', staffIds);
  return data ?? [];
}

export async function findStaffById(db: AdminDb, staffId: string) {
  const { data, error } = await db
    .from('staff')
    .select('id')
    .eq('id', staffId)
    .maybeSingle();
  return { row: data, error };
}

export async function findStaffByEmail(db: AdminDb, email: string) {
  const { data, error } = await db
    .from('staff')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  return { row: data, error };
}

/* ---------------------------- invitations ------------------------------ */

export async function listInvitations(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('tenant_invitations')
    .select('id, email, role, expires_at, accepted_at, revoked_at, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100);
  return { rows: data ?? [], error };
}

export async function revokeLiveInvitationsFor(
  db: AdminDb,
  tenantId: string,
  email: string
) {
  await db
    .from('tenant_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .ilike('email', email)
    .is('accepted_at', null)
    .is('revoked_at', null);
}

export async function insertInvitation(
  db: AdminDb,
  row: Database['public']['Tables']['tenant_invitations']['Insert']
) {
  const { data, error } = await db
    .from('tenant_invitations')
    .insert(row)
    .select('id, email, role, expires_at, created_at')
    .single();
  return { row: data, error };
}

export async function revokeInvitation(
  db: AdminDb,
  tenantId: string,
  invitationId: string
) {
  const { data, error } = await db
    .from('tenant_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invitationId)
    .eq('tenant_id', tenantId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .select('id, email')
    .maybeSingle();
  return { row: data, error };
}

/* --------------------------- discord config ---------------------------- */

export async function listDiscordConfigs(db: AdminDb, guildIds: string[]) {
  const { data, error } = await db
    .from('tenant_discord_config')
    .select(DISCORD_CONFIG_COLUMNS)
    .in('guild_id', guildIds);
  return { rows: data ?? [], error };
}

export async function upsertDiscordConfig(
  db: AdminDb,
  payload: DiscordConfigUpsert
) {
  const { error } = await db
    .from('tenant_discord_config')
    .upsert(payload, { onConflict: 'guild_id' });
  return { error };
}

export async function getDiscordConfig(db: AdminDb, guildId: string) {
  const { data, error } = await db
    .from('tenant_discord_config')
    .select(DISCORD_CONFIG_COLUMNS)
    .eq('guild_id', guildId)
    .maybeSingle();
  return { row: data, error };
}

/** Secret HMAC du bot : lu pour SIGNER l'appel au bot, jamais rendu. */
export async function getBotWebhookSecret(db: AdminDb, tenantId: string) {
  const { data } = await db
    .from('tenant_secrets')
    .select('bot_webhook_secret')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data?.bot_webhook_secret ?? null;
}

/* ----------------------------- facturation ----------------------------- */

export async function getTenantBilling(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('tenants')
    .select(
      'id, plan, plan_status, plan_started_at, plan_expires_at, plan_is_trial, plan_term, nonprofit_verified_at, nonprofit_org_name, nonprofit_rna, nonprofit_verified_via'
    )
    .eq('id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function listPlanPayments(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('tenant_plan_payments')
    .select('id, plan, amount, helloasso_payment_id, applied_at')
    .eq('tenant_id', tenantId)
    .order('applied_at', { ascending: false })
    .limit(20);
  return { rows: data ?? [], error };
}

export async function getTenantForCheckout(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('tenants')
    .select('id, slug, name, plan')
    .eq('id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function insertCgvAcceptance(
  db: AdminDb,
  row: Database['public']['Tables']['plan_cgv_acceptances']['Insert']
) {
  const { data, error } = await db
    .from('plan_cgv_acceptances')
    .insert(row)
    .select('id')
    .single();
  return { row: data, error };
}

export async function linkCgvAcceptance(
  db: AdminDb,
  acceptanceId: string,
  checkoutIntentId: number
) {
  const { error } = await db
    .from('plan_cgv_acceptances')
    .update({ checkout_intent_id: checkoutIntentId })
    .eq('id', acceptanceId);
  return { error };
}

export async function insertPlanCheckout(
  db: AdminDb,
  row: Database['public']['Tables']['tenant_plan_checkouts']['Insert']
) {
  const { error } = await db.from('tenant_plan_checkouts').insert(row);
  return { error };
}

export async function findTenantByRna(
  db: AdminDb,
  rna: string,
  exceptTenantId: string
) {
  const { data } = await db
    .from('tenants')
    .select('id')
    .eq('nonprofit_rna', rna)
    .neq('id', exceptTenantId)
    .maybeSingle();
  return data;
}

export async function getNonprofitVia(db: AdminDb, tenantId: string) {
  const { data } = await db
    .from('tenants')
    .select('nonprofit_verified_via')
    .eq('id', tenantId)
    .maybeSingle();
  return data;
}

export async function updateTenant(
  db: AdminDb,
  tenantId: string,
  patch: TenantUpdate
) {
  const { error } = await db.from('tenants').update(patch).eq('id', tenantId);
  return { error };
}

export async function getTenantDomain(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('tenants')
    .select(
      'id, slug, custom_domain, custom_domain_state, custom_domain_token, custom_domain_checked_at, custom_domain_error'
    )
    .eq('id', tenantId)
    .maybeSingle();
  return { row: data, error };
}
