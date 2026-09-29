// features/admin/tenants/repository/guildLinks.ts — file d'onboarding
// Discord (`pending_guild_links`) et rattachement (`discord_guilds`).
// NON scopé par tenant : une guild en attente n'appartient à aucun espace
// (garde `scope: 'platform'`).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Database } from '@/types/database.generated';

type TenantInsert = Database['public']['Tables']['tenants']['Insert'];

export const RESOLVED_TENANT_COLUMNS =
  'id, slug, name, is_active, default_locale' as const;

export async function findPendingGuild(db: AdminDb, guildId: string) {
  const { data, error } = await db
    .from('pending_guild_links')
    .select('guild_id')
    .eq('guild_id', guildId)
    .maybeSingle();
  return { row: data, error };
}

export async function deletePendingGuild(db: AdminDb, guildId: string) {
  const { error } = await db
    .from('pending_guild_links')
    .delete()
    .eq('guild_id', guildId);
  return { error };
}

export async function findLinkedGuild(db: AdminDb, guildId: string) {
  const { data, error } = await db
    .from('discord_guilds')
    .select('guild_id, tenant_id')
    .eq('guild_id', guildId)
    .maybeSingle();
  return { row: data, error };
}

export async function findTenantById(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('tenants')
    .select(RESOLVED_TENANT_COLUMNS)
    .eq('id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function insertTenant(db: AdminDb, row: TenantInsert) {
  const { data, error } = await db
    .from('tenants')
    .insert(row)
    .select(RESOLVED_TENANT_COLUMNS)
    .single();
  return { row: data, error };
}

export async function countTenantGuilds(db: AdminDb, tenantId: string) {
  const { count } = await db
    .from('discord_guilds')
    .select('guild_id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  return count ?? 0;
}

export async function insertGuildLink(
  db: AdminDb,
  guildId: string,
  tenantId: string,
  isPrimary: boolean
) {
  const { error } = await db.from('discord_guilds').insert({
    guild_id: guildId,
    tenant_id: tenantId,
    is_primary: isPrimary,
  });
  return { error };
}

export async function upsertTenantStaffAdmin(
  db: AdminDb,
  tenantId: string,
  staffId: string
) {
  const { error } = await db
    .from('tenant_staff')
    .upsert(
      { tenant_id: tenantId, staff_id: staffId, role: 'admin' },
      { onConflict: 'tenant_id,staff_id' }
    );
  return { error };
}
