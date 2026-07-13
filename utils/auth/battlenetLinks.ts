// utils/auth/battlenetLinks.ts
//
// Rattachement de l'identité Battle.net vérifiée au compte joueur + estampillage
// du badge « BattleTag vérifié » sur les lignes team_members. Modelé sur
// utils/discordLinks.ts (upsertDiscordLink) — service_role uniquement.
//
// Anti-smurf : `user_battlenet_links.battle_net_id` est UNIQUE. On refuse de
// voler le lien si le compte Blizzard est déjà rattaché à un AUTRE utilisateur
// (ALREADY_LINKED_TO_OTHER), tout en restant idempotent pour le même user.
//
// Tables (déjà en prod) :
//   user_battlenet_links(auth_user_id PK, battle_net_id UNIQUE, battle_tag,
//                        region, verified_at, created_at, updated_at)  — RLS service-role
//   team_members(+ battle_tag_verified_at, verified_battle_net_id)

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '../logger';

export type BattlenetLinkInput = {
  battleNetId: string;
  battleTag: string;
  region?: string | null;
};

export type UpsertBattlenetLinkResult =
  | { ok: true }
  | { ok: false; code: 'ALREADY_LINKED_TO_OTHER' | 'ERROR'; error?: string };

/**
 * Insère/actualise le lien Battle.net d'un utilisateur (service_role).
 *
 * - Si `battleNetId` est déjà rattaché à un AUTRE auth_user_id → renvoie
 *   `ALREADY_LINKED_TO_OTHER` (on ne vole pas le lien).
 * - Idempotent pour le même utilisateur : réactualise battle_tag/region et
 *   repose verified_at = now.
 */
export async function upsertBattlenetLink(
  authUserId: string,
  input: BattlenetLinkInput
): Promise<UpsertBattlenetLinkResult> {
  if (!supabaseAdmin)
    return { ok: false, code: 'ERROR', error: 'admin unavailable' };

  const battleNetId = input.battleNetId.trim();
  const battleTag = input.battleTag.trim();
  if (!battleNetId || !battleTag) {
    return { ok: false, code: 'ERROR', error: 'missing battleNetId/battleTag' };
  }

  // Anti-smurf : le compte Blizzard appartient-il déjà à quelqu'un d'autre ?
  const { data: existing, error: lookupErr } = await supabaseAdmin
    .from('user_battlenet_links')
    .select('auth_user_id')
    .eq('battle_net_id', battleNetId)
    .maybeSingle();

  if (lookupErr) {
    logger.error('[battlenetLinks] lookup error', lookupErr);
    return { ok: false, code: 'ERROR', error: lookupErr.message };
  }
  if (existing && existing.auth_user_id !== authUserId) {
    return { ok: false, code: 'ALREADY_LINKED_TO_OTHER' };
  }

  const now = new Date().toISOString();
  const { error: upsertErr } = await supabaseAdmin
    .from('user_battlenet_links')
    .upsert(
      {
        auth_user_id: authUserId,
        battle_net_id: battleNetId,
        battle_tag: battleTag,
        region: input.region ?? null,
        verified_at: now,
        updated_at: now,
      },
      { onConflict: 'auth_user_id' }
    );

  if (upsertErr) {
    const msg = upsertErr.message?.toLowerCase() ?? '';
    // Filet anti-race : une violation UNIQUE sur battle_net_id signifie qu'un
    // autre user a réclamé le compte Blizzard entre le lookup et l'upsert.
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return { ok: false, code: 'ALREADY_LINKED_TO_OTHER' };
    }
    logger.error('[battlenetLinks] upsert error', upsertErr);
    return { ok: false, code: 'ERROR', error: upsertErr.message };
  }
  return { ok: true };
}

export type StampVerifiedResult = {
  /** Lignes team_members estampillées (battle_tag == tag vérifié, case-insensitive). */
  verifiedCount: number;
  /** Lignes team_members du user dont le battle_tag diffère → NON estampillées. */
  mismatchCount: number;
};

/**
 * Pose `battle_tag_verified_at = now()` + `verified_battle_net_id` sur les
 * lignes team_members où `user_id = authUserId` ET `lower(battle_tag) =
 * lower(verifiedBattleTag)`.
 *
 * Les lignes dont le battle_tag diffère (mismatch) ne sont PAS estampillées :
 * l'admin les verra non vérifiées. Comparaison case-insensitive côté serveur
 * (lecture puis update ciblé par id — l'égalité insensible à la casse n'est pas
 * exprimable en un seul filtre PostgREST).
 */
export async function stampVerifiedTeamMembers(
  authUserId: string,
  verifiedBattleTag: string,
  battleNetId: string
): Promise<StampVerifiedResult> {
  if (!supabaseAdmin) return { verifiedCount: 0, mismatchCount: 0 };

  const { data: rows, error } = await supabaseAdmin
    .from('team_members')
    .select('id, battle_tag')
    .eq('user_id', authUserId);

  if (error) {
    logger.error('[battlenetLinks] team_members read error', error);
    return { verifiedCount: 0, mismatchCount: 0 };
  }

  const target = verifiedBattleTag.trim().toLowerCase();
  const matchingIds: string[] = [];
  let mismatchCount = 0;

  for (const row of rows ?? []) {
    const tag = ((row as { battle_tag?: string | null }).battle_tag ?? '')
      .trim()
      .toLowerCase();
    if (!tag) continue; // pas de battle_tag renseigné → ni vérifié ni mismatch
    if (tag === target) {
      matchingIds.push(String((row as { id: string }).id));
    } else {
      mismatchCount += 1;
    }
  }

  if (matchingIds.length > 0) {
    const now = new Date().toISOString();
    const { error: updateErr } = await supabaseAdmin
      .from('team_members')
      .update({
        battle_tag_verified_at: now,
        verified_battle_net_id: battleNetId,
      })
      .in('id', matchingIds);
    if (updateErr) {
      logger.error('[battlenetLinks] team_members stamp error', updateErr);
      return { verifiedCount: 0, mismatchCount };
    }
  }

  return { verifiedCount: matchingIds.length, mismatchCount };
}

export type BattlenetLinkStatus = {
  linked: boolean;
  battleTag: string | null;
  verifiedAt: string | null;
};

/** Lecture de l'état du lien Battle.net d'un utilisateur (pour l'UI). */
export async function getBattlenetLinkStatus(
  authUserId: string
): Promise<BattlenetLinkStatus> {
  if (!supabaseAdmin)
    return { linked: false, battleTag: null, verifiedAt: null };
  const { data, error } = await supabaseAdmin
    .from('user_battlenet_links')
    .select('battle_tag, verified_at')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (error) {
    logger.error('[battlenetLinks] status read error', error);
    return { linked: false, battleTag: null, verifiedAt: null };
  }
  if (!data) return { linked: false, battleTag: null, verifiedAt: null };
  return {
    linked: true,
    battleTag: (data as { battle_tag?: string | null }).battle_tag ?? null,
    verifiedAt: (data as { verified_at?: string | null }).verified_at ?? null,
  };
}
