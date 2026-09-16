// utils/freePlayers/claimForAccount.ts
//
// RACCROCHER une fiche « joueuse libre » au compte de la personne.
//
// LE PROBLÈME QU'IL RÈGLE. Le marché a deux portes sans compte : le formulaire
// `/rejoindre` (c'est tout son intérêt — se signaler sans rien créer) et le
// rôle Discord « Recherche une équipe ». Au 16 septembre 2026, 11 fiches sur 13
// n'avaient donc aucun `auth_user_id`.
//
// Or l'invitation en un clic — `POST /api/teams/invite-free-player` — EXIGE un
// compte lié : elle crée une invitation que la joueuse devra accepter, et une
// invitation sans destinataire n'existe pas. Le geste le plus naturel d'une
// capitaine était donc indisponible sur la quasi-totalité du marché. Il restait
// le repli « contacter », qui suppose un email — que les fiches Discord n'ont
// pas non plus.
//
// Rien ne raccrochait les deux : une joueuse se signalait sans compte, en créait
// un plus tard, et sa fiche restait orpheline pour toujours.
//
// DEUX CLÉS, ET PAS UNE DE PLUS. L'email de contact qu'elle a elle-même saisi,
// et l'identifiant Discord qu'elle vient de lier. Toutes deux prouvent la même
// chose — elle a accès à ce canal — et c'est exactement la garantie sur laquelle
// repose déjà le lien de retrait (`utils/freePlayerRemoval.ts`). On ne rapproche
// PAS sur un pseudo ni sur un nom affiché : deux personnes peuvent les partager,
// et rattacher la fiche de quelqu'un d'autre donnerait à une inconnue le pouvoir
// de la retirer.
//
// NE LÈVE JAMAIS, et n'est jamais bloquant. Rattacher est un confort ; échouer
// ne doit faire perdre ni une inscription ni une liaison Discord. Le pire cas
// est l'état d'avant : une fiche orpheline.
//
// IDEMPOTENT : seules les lignes dont `auth_user_id` EST NUL sont touchées. Une
// fiche déjà rattachée — à ce compte ou à un autre — n'est jamais réécrite, ce
// qui rend l'appel sûr à répéter à chaque connexion.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

export type ClaimResult = { claimed: number };

/**
 * Rattache au compte les fiches orphelines qui lui correspondent.
 *
 * `tenantId` borne la recherche : une fiche appartient à un espace, et une
 * personne peut être libre ici sans l'être ailleurs.
 */
export async function claimFreePlayerRows(params: {
  tenantId: string;
  authUserId: string;
  email?: string | null;
  discordUserId?: string | null;
}): Promise<ClaimResult> {
  const { tenantId, authUserId } = params;
  if (!supabaseAdmin || !tenantId || !authUserId) return { claimed: 0 };

  const email = params.email?.trim().toLowerCase() || null;
  const discordUserId = params.discordUserId?.trim() || null;
  if (!email && !discordUserId) return { claimed: 0 };

  // DEUX ÉCRITURES PLUTÔT QU'UN `.or()`. Le filtre `or` de PostgREST est une
  // CHAÎNE analysée par le serveur : y concaténer une adresse revient à
  // construire une requête par concaténation. L'email est validé à
  // l'inscription, mais une valeur validée n'est pas une valeur échappée, et le
  // jour où un appelant moins prudent passera par ici la faille sera déjà
  // ouverte. Deux `eq`/`ilike` paramétrés ne se prêtent pas à la question.
  //
  // Les deux passes sont indépendantes et idempotentes : une fiche ne porte
  // jamais les deux clés à la fois (web = email, Discord = identifiant), et
  // `.is('auth_user_id', null)` empêche la seconde de défaire la première.
  const claimBy = async (
    column: 'contact_email' | 'discord_user_id',
    value: string
  ): Promise<number> => {
    const query = supabaseAdmin!
      .from('free_players')
      .update({ auth_user_id: authUserId })
      .eq('tenant_id', tenantId)
      .is('auth_user_id', null);

    const { data, error } =
      column === 'contact_email'
        ? await query.ilike('contact_email', value).select('id')
        : await query.eq('discord_user_id', value).select('id');

    if (error) {
      logger.error('[freePlayers/claim] rattachement impossible', error);
      return 0;
    }
    return (data ?? []).length;
  };

  try {
    let claimed = 0;
    if (email) claimed += await claimBy('contact_email', email);
    if (discordUserId)
      claimed += await claimBy('discord_user_id', discordUserId);

    if (claimed > 0) {
      logger.info(
        '[freePlayers/claim] %d fiche(s) rattachée(s) au compte %s',
        claimed,
        authUserId
      );
    }
    return { claimed };
  } catch (err) {
    logger.error('[freePlayers/claim] rattachement en erreur', err);
    return { claimed: 0 };
  }
}
