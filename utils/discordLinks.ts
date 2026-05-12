import { supabaseAdmin } from '@/utils/supabase';
import { logger } from './logger';

export type DiscordLink = {
  authUserId: string;
  discordUserId: string;
  discordUsername: string | null;
};

/**
 * Lookup a single auth user's Discord link.
 * Returns null if not linked.
 */
export async function getDiscordLinkForUser(
  authUserId: string
): Promise<DiscordLink | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id, discord_user_id, discord_username')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error) {
    logger.error('[discordLinks] lookup error', error);
    return null;
  }
  if (!data) return null;
  return {
    authUserId: data.auth_user_id,
    discordUserId: data.discord_user_id,
    discordUsername: data.discord_username,
  };
}

/**
 * Bulk lookup. Returns a Map keyed by auth_user_id.
 */
export async function getDiscordLinksForUsers(
  authUserIds: string[]
): Promise<Map<string, DiscordLink>> {
  const result = new Map<string, DiscordLink>();
  if (!supabaseAdmin || authUserIds.length === 0) return result;

  const { data, error } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id, discord_user_id, discord_username')
    .in('auth_user_id', authUserIds);

  if (error) {
    logger.error('[discordLinks] bulk lookup error', error);
    return result;
  }
  for (const row of data ?? []) {
    result.set(row.auth_user_id, {
      authUserId: row.auth_user_id,
      discordUserId: row.discord_user_id,
      discordUsername: row.discord_username,
    });
  }
  return result;
}

/**
 * Upsert a link. Called from the OAuth callback after a Discord login.
 */
export async function upsertDiscordLink(
  authUserId: string,
  discordUserId: string,
  discordUsername: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseAdmin) return { ok: false, error: 'admin client unavailable' };

  const { error } = await supabaseAdmin.from('user_discord_links').upsert(
    {
      auth_user_id: authUserId,
      discord_user_id: discordUserId,
      discord_username: discordUsername,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'auth_user_id' }
  );

  if (error) {
    // Likely a unique-constraint violation on discord_user_id (another user
    // already claimed this Discord account). Report it back to the caller.
    logger.error('[discordLinks] upsert error', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
