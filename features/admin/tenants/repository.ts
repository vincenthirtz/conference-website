// features/admin/tenants/repository.ts

import type { SupabaseClient } from '@supabase/supabase-js';

export type PendingGuildLink = {
  guild_id: string;
  guild_name: string | null;
  owner_discord_id: string | null;
  requested_at: string;
};

/**
 * File d'onboarding Discord, NON scopée par tenant : une guild en attente
 * n'appartient encore à aucun espace. D'où la garde `scope: 'platform'`.
 */
export async function listPendingGuildLinks(db: SupabaseClient) {
  const { data, error } = await db
    .from('pending_guild_links')
    .select('guild_id, guild_name, owner_discord_id, requested_at')
    .order('requested_at', { ascending: false });
  return { rows: (data ?? []) as PendingGuildLink[], error };
}
