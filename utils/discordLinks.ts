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

/** Qui détient déjà ce compte Discord, si quelqu'un le détient. */
export async function findDiscordLinkOwner(
  discordUserId: string
): Promise<DiscordLink | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id, discord_user_id, discord_username')
    .eq('discord_user_id', discordUserId)
    .maybeSingle();
  if (error) {
    logger.error('[discordLinks] owner lookup error', error);
    return null;
  }
  if (!data) return null;
  return {
    authUserId: data.auth_user_id,
    discordUserId: data.discord_user_id,
    discordUsername: data.discord_username,
  };
}

export type ClaimResult =
  | { ok: true; transferredFrom: string | null }
  | { ok: false; code: 'held_by_other'; heldBy: string }
  | { ok: false; code: 'write_failed'; error?: string };

/**
 * Rattache un compte Discord à un compte du site, en reprenant le lien s'il
 * est détenu ailleurs.
 *
 * POURQUOI LE TRANSFERT EXISTE. Beaucoup de joueuses se sont inscrites DEUX
 * fois le même jour : un compte e-mail (celui qui figure au roster) et un
 * compte Discord OAuth. Le role-sync raisonne sur `team_members.user_id` :
 * le compte du roster n'a pas de Discord, le compte Discord n'est dans aucun
 * roster, donc le bot retire le rôle d'équipe toutes les 30 minutes, et
 * personne ne peut le garder. Le 18/09, deux joueuses ont perdu leur rôle
 * quatre fois dans la soirée.
 *
 * Sans reprise possible, la seule issue était une correction en base par le
 * staff : `discord_user_id` est UNIQUE, donc rattacher son Discord au bon
 * compte butait sur un 409 définitif.
 *
 * POURQUOI C'EST SÛR. L'identifiant Discord ne vient pas d'une saisie mais de
 * l'identité OAuth attachée à la session : reprendre le lien exige donc de
 * prouver, à l'instant, qu'on contrôle CE compte Discord. Celle qui le prouve
 * est légitime à décider où il pointe. Le transfert reste un geste EXPLICITE
 * (`allowTransfer`) pour qu'il ne se produise jamais par surprise.
 */
export async function claimDiscordLink(
  authUserId: string,
  discordUserId: string,
  discordUsername: string | null,
  opts: { allowTransfer?: boolean } = {}
): Promise<ClaimResult> {
  if (!supabaseAdmin) return { ok: false, code: 'write_failed' };

  const owner = await findDiscordLinkOwner(discordUserId);

  if (owner && owner.authUserId !== authUserId) {
    if (!opts.allowTransfer) {
      return { ok: false, code: 'held_by_other', heldBy: owner.authUserId };
    }
    // Le lien part de l'ancien compte AVANT d'arriver sur le nouveau :
    // `discord_user_id` est UNIQUE, les deux ne peuvent pas coexister.
    const { error: delErr } = await supabaseAdmin
      .from('user_discord_links')
      .delete()
      .eq('auth_user_id', owner.authUserId);
    if (delErr) {
      logger.error('[discordLinks] transfer delete error', delErr);
      return { ok: false, code: 'write_failed', error: delErr.message };
    }
  }

  const upserted = await upsertDiscordLink(
    authUserId,
    discordUserId,
    discordUsername
  );
  if (!upserted.ok) {
    return { ok: false, code: 'write_failed', error: upserted.error };
  }

  return {
    ok: true,
    transferredFrom:
      owner && owner.authUserId !== authUserId ? owner.authUserId : null,
  };
}
