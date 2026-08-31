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
import { roleRequiresBattleTag } from '../teams/roleKind';

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
  /**
   * Lignes JOUANTES dont le battle_tag était VIDE et qu'on a remplies avec le
   * tag prouvé. Comptées à part de `verifiedCount` : ce n'est pas la même
   * chose de confirmer une déclaration et d'en écrire une à la place de
   * quelqu'un.
   */
  filledCount: number;
};

/**
 * Pose `battle_tag_verified_at` + `verified_battle_net_id` sur les lignes
 * team_members où `user_id = authUserId` ET `lower(battle_tag) =
 * lower(verifiedBattleTag)`.
 *
 * Les lignes dont le battle_tag diffère (mismatch) ne sont PAS estampillées :
 * l'admin les verra non vérifiées. Comparaison case-insensitive côté serveur
 * (lecture puis update ciblé par id — l'égalité insensible à la casse n'est pas
 * exprimable en un seul filtre PostgREST).
 *
 * UNE LIGNE JOUANTE SANS TAG EST REMPLIE, pas ignorée. Blizzard vient de
 * prouver ce tag : le laisser de côté produisait une fiche « BattleTag
 * manquant » alors que le site connaissait la réponse, et rien ne venait
 * jamais la corriger — le cas s'est présenté sur trois rosters (Chocomates,
 * Team Positivité). L'encadrement, lui, garde son tag vide : un coach n'a
 * jamais à en fournir, et lui en écrire un serait une donnée que personne n'a
 * demandée.
 *
 * L'estampille elle-même est ensuite (re)posée par le trigger
 * `sync_team_member_battletag_verification`, qui lit `user_battlenet_links` —
 * déjà à jour ici, `upsertBattlenetLink` tournant AVANT dans le callback. On
 * l'écrit quand même explicitement : le code ne doit pas dépendre d'un effet
 * de bord pour produire son propre résultat.
 */
export async function stampVerifiedTeamMembers(
  authUserId: string,
  verifiedBattleTag: string,
  battleNetId: string
): Promise<StampVerifiedResult> {
  const empty = { verifiedCount: 0, mismatchCount: 0, filledCount: 0 };
  if (!supabaseAdmin) return empty;

  const { data: rows, error } = await supabaseAdmin
    .from('team_members')
    .select('id, battle_tag, role')
    .eq('user_id', authUserId);

  if (error) {
    logger.error('[battlenetLinks] team_members read error', error);
    return empty;
  }

  const trimmedTag = verifiedBattleTag.trim();
  const target = trimmedTag.toLowerCase();
  const matchingIds: string[] = [];
  const emptyPlayingIds: string[] = [];
  let mismatchCount = 0;

  for (const row of rows ?? []) {
    const typed = row as {
      id: string;
      battle_tag?: string | null;
      role?: string | null;
    };
    const tag = (typed.battle_tag ?? '').trim().toLowerCase();
    if (!tag) {
      // Vide : à remplir si la fiche joue, à laisser tel quel sinon.
      if (roleRequiresBattleTag(typed.role)) {
        emptyPlayingIds.push(String(typed.id));
      }
      continue;
    }
    if (tag === target) {
      matchingIds.push(String(typed.id));
    } else {
      mismatchCount += 1;
    }
  }

  const now = new Date().toISOString();
  const stamp = {
    battle_tag_verified_at: now,
    verified_battle_net_id: battleNetId,
  };

  if (matchingIds.length > 0) {
    const { error: updateErr } = await supabaseAdmin
      .from('team_members')
      .update(stamp)
      .in('id', matchingIds);
    if (updateErr) {
      logger.error('[battlenetLinks] team_members stamp error', updateErr);
      return { verifiedCount: 0, mismatchCount, filledCount: 0 };
    }
  }

  let filledCount = 0;
  if (emptyPlayingIds.length > 0) {
    const { error: fillErr } = await supabaseAdmin
      .from('team_members')
      .update({ battle_tag: trimmedTag, ...stamp })
      .in('id', emptyPlayingIds);
    if (fillErr) {
      // Le remplissage est un CONFORT : son échec ne doit pas annuler des
      // estampilles déjà posées, qui sont, elles, l'objet du flux.
      logger.error('[battlenetLinks] team_members fill error', fillErr);
    } else {
      filledCount = emptyPlayingIds.length;
    }
  }

  return { verifiedCount: matchingIds.length, mismatchCount, filledCount };
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

/**
 * Résout le compte site propriétaire d'un compte Blizzard (`battle_net_id`).
 * Sert au flux de CONNEXION Battle.net : on ne se connecte qu'à un compte
 * DÉJÀ lié — Blizzard ne renvoyant pas d'email, on ne peut ni créer ni
 * rattacher un compte à l'aveugle sans ouvrir une prise de contrôle.
 *
 * Renvoie null si aucun lien n'existe (l'appelant doit alors renvoyer vers la
 * connexion classique, jamais créer de compte).
 */
export async function findAuthUserIdByBattleNetId(
  battleNetId: string
): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const id = battleNetId.trim();
  if (!id) return null;

  const { data, error } = await supabaseAdmin
    .from('user_battlenet_links')
    .select('auth_user_id')
    .eq('battle_net_id', id)
    .maybeSingle();
  if (error) {
    logger.error('[battlenetLinks] login lookup error', error);
    return null;
  }
  return (data as { auth_user_id?: string | null } | null)?.auth_user_id ?? null;
}
