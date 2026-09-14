// utils/tcg/grantSupporterWelcome.ts
//
// Le cadeau d'accueil d'une SUPPORTRICE : un paquet et des pièces, une fois par
// compte.
//
// POURQUOI IL EXISTE. Les six autres sources de gain supposent qu'on joue. Une
// supportrice n'a qu'une voie ouverte — le drop Twitch pendant un direct — donc
// hors direct, elle arrive sur une collection vide et le rôle qu'on vient de
// lui donner ne mène nulle part. Ce cadeau ouvre la porte.
//
// UNE FOIS PAR COMPTE, PAS PAR ÉDITION, et c'est toute la différence avec
// `grantWelcomeGift`. L'unicité du registre est `(tenant_id, user_id,
// source_kind, source_ref)` : en mettant le TENANT dans `source_ref`, « une
// fois, jamais deux » est garanti par le SCHÉMA, sans compteur applicatif.
// `source_ref` ne peut pas être NULL pour cela — deux NULL sont DISTINCTS dans
// une contrainte UNIQUE, l'index ne bloquerait rien.
//
// L'IDEMPOTENCE VIENT DU PORTE-MONNAIE, PAS DES PAQUETS, comme pour le cadeau
// d'édition : `tcg_packs` n'a que `UNIQUE (tenant_id, user_id,
// source_match_id)`, et un cadeau n'a pas de match. On écrit donc les pièces
// D'ABORD en `ON CONFLICT DO NOTHING ... RETURNING`, et on n'accorde le paquet
// que si cette insertion a réellement rendu une ligne. Un rejeu ne rend rien,
// donc n'accorde rien.
//
// ⚠️ L'ÉCART EST RENDU, JAMAIS AVALÉ. Si l'insertion du paquet échoue, les
// pièces sont déjà écrites et ne seront pas rejouées : on le journalise ET on
// rend `packGranted: false`, que l'appelant DOIT regarder. Le 2026-09-14, la
// version « on journalise et on continue » a laissé 58 comptes avec des pièces
// et sans paquet pendant qu'un écran affichait un succès vert. Le compte rendu
// portait déjà l'écart ; personne ne le lisait.
//
// CE CADEAU N'EST PAS ACHETABLE, et ne le deviendra pas : la monnaie se gagne
// (boîtes à butin BE/NL, ANJ, public mineur — cf. docs/TCG.md). Faire un don ne
// déclenche RIEN ici, et aucun appelant ne doit le brancher sur un paiement.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { earnReward } from './earnSources';
import { refreshBalance } from './grantVictoryRewards';

/** Origine dans `tcg_wallet_entries`. */
const WALLET_SOURCE_KIND = 'supporter_welcome';
/** Origine dans `tcg_packs` — son vocabulaire diffère, et `welcome` y suffit. */
const PACK_SOURCE_KIND = 'welcome';

/** Le rôle de compte qui ouvre droit à ce cadeau. */
const SUPPORTER_ROLE = 'supporter';

export type SupporterWelcomeOutcome =
  /** Cadeau accordé par cet appel. */
  | { status: 'granted'; coins: number; packGranted: boolean }
  /** `dryRun` seulement : rien n'a été écrit, mais le cadeau est réclamable. */
  | { status: 'claimable'; coins: number }
  /** Déjà reçu : état NORMAL sur un rejeu, pas une erreur. */
  | { status: 'already' }
  /** Le compte n'est pas une supportrice. */
  | { status: 'not_supporter' }
  /** Elle figure sur un roster : c'est le cadeau d'ÉDITION qui la concerne. */
  | { status: 'on_roster' }
  /** Panne de lecture ou d'écriture — distincte d'un refus. */
  | { status: 'error' };

/**
 * Le rôle de compte, lu dans les metadata d'authentification.
 *
 * CE PROJET N'A PAS DE TABLE `profiles` : tout le profil vit dans
 * `auth.users.raw_user_meta_data`. On passe donc par l'API admin plutôt que par
 * un `from('profiles')` qui n'existe pas.
 *
 * UNE ERREUR DE LECTURE N'EST PAS UNE ABSENCE DE RÔLE, et le type le force :
 * rendre `null` pour les deux cas ferait passer une panne transitoire pour un
 * refus définitif affiché à la personne — c'est le travers que le dépôt a déjà
 * payé (`if (error) return null`, quatre doublons Discord le 2026-09-12). Un
 * compte sans rôle en metadata est simplement « pas supportrice ».
 */
async function readAccountRole(
  userId: string
): Promise<{ ok: true; role: string | null } | { ok: false }> {
  if (!supabaseAdmin) return { ok: false };
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) {
    logger.error('[tcg/supporter-welcome] rôle illisible: %s', error.message);
    return { ok: false };
  }
  const role = data?.user?.user_metadata?.role;
  return { ok: true, role: typeof role === 'string' ? role : null };
}

/**
 * Est-elle sur un roster ?
 *
 * POURQUOI CE REFUS. Le rôle de compte est une simple étiquette choisie à
 * l'inscription : rien n'empêche une joueuse de cocher « supportrice ». Sans ce
 * garde-fou, elle encaisserait ce cadeau EN PLUS de celui de son édition. Les
 * deux accueils existent, mais pas pour la même personne au même moment.
 *
 * CE CONTRÔLE RESTE NÉCESSAIRE MALGRÉ LE TRIGGER. Depuis
 * `clear_supporter_role_on_roster_join`, l'étiquette tombe à l'entrée dans un
 * roster — donc le cas « supportrice ET sur un roster » ne devrait plus exister.
 * Mais le trigger ne bloque jamais l'insertion en cas d'échec (il avertit), et
 * un rôle peut aussi être reposé à la main depuis /admin/users/manage. On
 * vérifie donc le FAIT plutôt que de faire confiance à l'étiquette.
 */
async function isOnAnyRoster(
  tenantId: string,
  userId: string
): Promise<boolean | null> {
  if (!supabaseAdmin) return null;
  const { count, error } = await supabaseAdmin
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);
  if (error) {
    logger.error('[tcg/supporter-welcome] roster illisible: %s', error.message);
    return null;
  }
  return (count ?? 0) > 0;
}

/**
 * A-t-elle déjà réclamé ? Lecture seule, pour le seul usage de `dryRun`.
 *
 * LE CHEMIN D'ÉCRITURE NE S'EN SERT PAS, et c'est délibéré : lire puis écrire
 * laisserait une fenêtre entre les deux. Là-bas, c'est le `RETURNING` de
 * l'upsert qui fait autorité — la même leçon que les quatre doublons Discord du
 * 2026-09-12.
 */
async function alreadyClaimed(
  tenantId: string,
  userId: string
): Promise<boolean | null> {
  if (!supabaseAdmin) return null;
  const { count, error } = await supabaseAdmin
    .from('tcg_wallet_entries')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('source_kind', WALLET_SOURCE_KIND)
    .eq('source_ref', tenantId);
  if (error) {
    logger.error(
      '[tcg/supporter-welcome] registre illisible: %s',
      error.message
    );
    return null;
  }
  return (count ?? 0) > 0;
}

/**
 * Accorde le cadeau, ou dit pourquoi il ne l'est pas.
 *
 * Ne lève jamais : l'appelant est une route HTTP, et chaque refus est un état
 * qu'elle doit pouvoir traduire, pas une exception à rattraper.
 *
 * `dryRun` sert l'affichage : la carte du tableau de bord ne doit proposer le
 * bouton qu'à qui peut réellement réclamer. Les DEUX chemins partagent les
 * mêmes conditions ci-dessous — les dupliquer dans la route les aurait laissés
 * diverger, et un bouton proposé puis refusé est pire que pas de bouton.
 */
export async function grantSupporterWelcome(input: {
  tenantId: string;
  userId: string;
  dryRun?: boolean;
}): Promise<SupporterWelcomeOutcome> {
  const { tenantId, userId, dryRun = false } = input;
  if (!supabaseAdmin || !tenantId || !userId) return { status: 'error' };

  const roleRead = await readAccountRole(userId);
  if (!roleRead.ok) return { status: 'error' };
  if (roleRead.role !== SUPPORTER_ROLE) return { status: 'not_supporter' };

  const onRoster = await isOnAnyRoster(tenantId, userId);
  if (onRoster === null) return { status: 'error' };
  if (onRoster) return { status: 'on_roster' };

  const { coins, packs } = earnReward(WALLET_SOURCE_KIND);

  if (dryRun) {
    const claimed = await alreadyClaimed(tenantId, userId);
    if (claimed === null) return { status: 'error' };
    return claimed ? { status: 'already' } : { status: 'claimable', coins };
  }

  const nowIso = new Date().toISOString();

  // 1) Les pièces d'abord. `ignoreDuplicates` + `.select()` : PostgREST exécute
  //    un `ON CONFLICT DO NOTHING ... RETURNING`, qui ne rend QUE les lignes
  //    réellement insérées. C'est ce retour qui décide de la suite.
  const { data: inserted, error: coinError } = await supabaseAdmin
    .from('tcg_wallet_entries')
    .upsert(
      {
        tenant_id: tenantId,
        user_id: userId,
        amount: coins,
        source_kind: WALLET_SOURCE_KIND,
        // Le TENANT, pas un tournoi : « une fois par compte ». Cf. l'en-tête.
        source_ref: tenantId,
        created_at: nowIso,
      },
      {
        onConflict: 'tenant_id,user_id,source_kind,source_ref',
        ignoreDuplicates: true,
      }
    )
    .select('user_id');

  if (coinError) {
    logger.error(
      '[tcg/supporter-welcome] pièces non créditées: %s',
      coinError.message
    );
    return { status: 'error' };
  }

  // Zéro ligne rendue = elle l'avait déjà. C'est un rejeu, pas une panne.
  if (((inserted ?? []) as unknown[]).length === 0)
    return { status: 'already' };

  // 2) Le paquet, seulement maintenant qu'on sait l'avoir créditée.
  let packGranted = false;
  if (packs > 0) {
    const { error: packError } = await supabaseAdmin.from('tcg_packs').insert({
      tenant_id: tenantId,
      user_id: userId,
      source_kind: PACK_SOURCE_KIND,
      // Pas de match derrière un cadeau — et c'est aussi pourquoi l'index
      // unique de `tcg_packs` ne protège de rien ici.
      source_match_id: null,
      granted_at: nowIso,
    });
    if (packError) {
      logger.error(
        '[tcg/supporter-welcome] paquet non accordé pour %s: %s',
        userId,
        packError.message
      );
    } else {
      packGranted = true;
    }
  }

  // 3) Recalcul du solde depuis le registre, jamais un incrément : un incrément
  //    perdu creuse un écart définitif, un recalcul se répare tout seul.
  await refreshBalance(tenantId, userId);

  return { status: 'granted', coins, packGranted };
}
