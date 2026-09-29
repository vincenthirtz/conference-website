// features/admin/tenants/repository/access.ts

import type { AdminDb } from '@/utils/admin/serviceContext';

/**
 * File d'onboarding Discord, NON scopée par tenant : une guild en attente
 * n'appartient encore à aucun espace. D'où la garde `scope: 'platform'`.
 */
export async function listPendingGuildLinks(db: AdminDb) {
  const { data, error } = await db
    .from('pending_guild_links')
    .select('guild_id, guild_name, owner_discord_id, requested_at')
    .order('requested_at', { ascending: false });
  return { rows: data ?? [], error };
}
