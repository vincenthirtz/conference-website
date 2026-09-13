// utils/auth/twitchLinks.ts
//
// Le pont entre un compte Twitch et un compte du site (`user_twitch_links`).
//
// POURQUOI CETTE TABLE PLUTÔT QUE `team_members.twitch`. Ce champ-là est saisi
// librement par la joueuse ou sa capitaine, sans aucune vérification : s'en
// servir pour attribuer un gain laisserait n'importe qui inscrire le pseudo
// d'une autre et encaisser ses drops. Une identité qui DÉCIDE D'UN GAIN doit
// être prouvée par OAuth, jamais déclarée. C'est écrit dans la migration, et
// c'est la raison d'être de ce module.
//
// ON NE VOLE JAMAIS UN LIEN. Si le compte Twitch appartient déjà à quelqu'un
// d'autre, on refuse (`ALREADY_LINKED_TO_OTHER`) au lieu de réattribuer :
// `twitch_user_id` est UNIQUE en base, mais compter sur la violation de
// contrainte donnerait une erreur opaque là où il faut un message clair. Même
// garde que `utils/auth/battlenetLinks.ts`.
//
// L'IDENTIFIANT FAIT FOI, PAS LE PSEUDO. `twitch_user_id` est stable ; le login
// se renomme. Le login n'est conservé que pour l'affichage et le diagnostic —
// aucune décision ne s'y appuie, et on le rafraîchit à chaque passage pour
// qu'un renommage ne laisse pas un nom périmé sur les écrans.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

export type TwitchLinkInput = {
  twitchUserId: string;
  twitchLogin: string | null;
};

export type UpsertTwitchLinkResult =
  | { ok: true }
  | { ok: false; code: 'ALREADY_LINKED_TO_OTHER' | 'ERROR'; error?: string };

/**
 * Crée ou rafraîchit le lien Twitch d'un compte (service_role).
 *
 * Idempotent pour la même personne : réappeler ne fait qu'actualiser le login.
 */
export async function upsertTwitchLink(
  authUserId: string,
  input: TwitchLinkInput
): Promise<UpsertTwitchLinkResult> {
  if (!supabaseAdmin) {
    return { ok: false, code: 'ERROR', error: 'admin unavailable' };
  }

  const twitchUserId = input.twitchUserId.trim();
  if (!twitchUserId) {
    return { ok: false, code: 'ERROR', error: 'missing twitchUserId' };
  }
  const twitchLogin = input.twitchLogin?.trim() || null;

  // Ce compte Twitch appartient-il déjà à quelqu'un d'autre ?
  const { data: existing, error: lookupErr } = await supabaseAdmin
    .from('user_twitch_links')
    .select('auth_user_id')
    .eq('twitch_user_id', twitchUserId)
    .maybeSingle();

  if (lookupErr) {
    logger.error('[twitchLinks] lookup error', lookupErr);
    return { ok: false, code: 'ERROR', error: lookupErr.message };
  }
  if (existing && existing.auth_user_id !== authUserId) {
    return { ok: false, code: 'ALREADY_LINKED_TO_OTHER' };
  }

  const now = new Date().toISOString();
  const { error: upsertErr } = await supabaseAdmin
    .from('user_twitch_links')
    .upsert(
      {
        auth_user_id: authUserId,
        twitch_user_id: twitchUserId,
        twitch_login: twitchLogin,
        updated_at: now,
      },
      { onConflict: 'auth_user_id' }
    );

  if (upsertErr) {
    logger.error('[twitchLinks] upsert error', upsertErr);
    return { ok: false, code: 'ERROR', error: upsertErr.message };
  }

  return { ok: true };
}

export type TwitchLinkStatus = {
  linked: boolean;
  twitchLogin: string | null;
  linkedAt: string | null;
};

/** L'état du lien pour un compte. Ne lève jamais : illisible = non lié. */
export async function getTwitchLinkStatus(
  authUserId: string
): Promise<TwitchLinkStatus> {
  const absent: TwitchLinkStatus = {
    linked: false,
    twitchLogin: null,
    linkedAt: null,
  };
  if (!supabaseAdmin) return absent;

  const { data, error } = await supabaseAdmin
    .from('user_twitch_links')
    .select('twitch_login, linked_at')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error) {
    // Une lecture en échec n'est PAS une absence de lien — mais l'écran qui
    // s'en sert ne peut qu'afficher « non lié ». On le journalise pour que
    // l'écart ne reste pas invisible. Cf. la leçon des 504 PostgREST.
    logger.warn('[twitchLinks] statut illisible: %s', error.message);
    return absent;
  }
  if (!data) return absent;

  return {
    linked: true,
    twitchLogin: (data as { twitch_login: string | null }).twitch_login,
    linkedAt: (data as { linked_at: string | null }).linked_at,
  };
}

/**
 * Le compte du site derrière un identifiant Twitch, ou `null`.
 *
 * C'est CE point qui débloque le webhook de drop : il reçoit un identifiant
 * Twitch et n'avait aucun moyen de le traduire.
 *
 * Rend `undefined` quand la lecture échoue — à distinguer de `null` (« aucun
 * lien »). L'appelant doit demander un réessai plutôt que de conclure à
 * l'absence : une erreur de lecture n'est pas une absence de donnée.
 */
export async function findAuthUserIdByTwitchUserId(
  twitchUserId: string
): Promise<string | null | undefined> {
  if (!supabaseAdmin) return undefined;

  const { data, error } = await supabaseAdmin
    .from('user_twitch_links')
    .select('auth_user_id')
    .eq('twitch_user_id', twitchUserId.trim())
    .maybeSingle();

  if (error) {
    logger.error('[twitchLinks] résolution impossible', error);
    return undefined;
  }
  return data ? (data as { auth_user_id: string }).auth_user_id : null;
}

/** Retire le lien. Idempotent : délier ce qui ne l'est pas réussit. */
export async function deleteTwitchLink(authUserId: string): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const { error } = await supabaseAdmin
    .from('user_twitch_links')
    .delete()
    .eq('auth_user_id', authUserId);
  if (error) {
    logger.error('[twitchLinks] suppression impossible', error);
    return false;
  }
  return true;
}

/**
 * Les pseudos Twitch de plusieurs comptes, pour l'overlay.
 *
 * L'overlay est une URL PUBLIQUE : il ne doit afficher que le pseudo Twitch,
 * déjà public par nature (il s'affiche dans le chat), et jamais le nom du
 * compte du site. Cette fonction est le seul chemin par lequel il obtient un
 * nom — c'est ce qui rend la règle vérifiable.
 */
export async function readTwitchLoginsByUserIds(
  authUserIds: readonly string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!supabaseAdmin || authUserIds.length === 0) return out;

  const { data, error } = await supabaseAdmin
    .from('user_twitch_links')
    .select('auth_user_id, twitch_login')
    .in('auth_user_id', [...new Set(authUserIds)]);

  if (error) {
    logger.warn('[twitchLinks] pseudos illisibles: %s', error.message);
    return out;
  }
  for (const row of (data ?? []) as Array<{
    auth_user_id: string;
    twitch_login: string | null;
  }>) {
    if (row.twitch_login) out.set(row.auth_user_id, row.twitch_login);
  }
  return out;
}
