// utils/tcg/grantSelfWelcome.ts
//
// L'accueil qu'on se RÉCLAME : un paquet et des pièces, une fois par compte et
// par espace, pour les personnes que les autres sources de gain oublient.
//
// DEUX MOTIFS, UN SEUL CHEMIN D'ÉCRITURE.
//
//   `supporter` — les autres sources de gain supposent qu'on joue. Une
//   supportrice n'a qu'une voie ouverte, le drop Twitch pendant un direct :
//   hors direct, elle arrive sur une collection vide et le rôle qu'on vient de
//   lui donner ne mène nulle part.
//
//   `staff` — un compte owner, admin ou caster qui ne figure sur AUCUN roster
//   n'avait, lui, strictement aucune porte (constaté le 2026-09-20 : six des
//   sept comptes staff, zéro écriture au registre). Le cadeau d'édition
//   énumère les rosters engagés ; celui de supportrice exige l'étiquette de
//   compte ; les pronostics REFUSENT le staff, et c'est voulu — qui arbitre ne
//   parie pas sur ce qu'il arbitre ; victoires et séries de check-ins
//   supposent qu'on joue. Les personnes qui font tourner le tournoi en étaient
//   donc exclues, définitivement.
//
// LE MOTIF CHANGE L'ÉTIQUETTE, JAMAIS LE MONTANT. `staff_welcome` et
// `supporter_welcome` donnent exactement la même chose : un staff qui
// s'accorderait plus qu'une joueuse ne jouerait plus au même jeu qu'elle. Ce
// qui diffère est ce que le registre RACONTE — et c'est décisif, parce que
// `supporter_welcome` figure dans `TENANT_ATTACHING_WALLET_SOURCES` (les gains
// qui prouvent une présence qu'un staff n'a pas pu fabriquer) : y faire entrer
// un cadeau que le staff se réclame à lui-même viderait cette garde de son
// sens. `staff_welcome` n'y est pas, et ne doit jamais y être.
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

/** Le motif qui ouvre droit à l'accueil — et l'étiquette qu'il laisse. */
export type WelcomeGround = 'supporter' | 'staff';

/** Origine dans `tcg_wallet_entries`, par motif. */
const WALLET_SOURCE_KIND: Record<
  WelcomeGround,
  'supporter_welcome' | 'staff_welcome'
> = {
  supporter: 'supporter_welcome',
  staff: 'staff_welcome',
};
/** Origine dans `tcg_packs` — son vocabulaire diffère, et `welcome` y suffit. */
const PACK_SOURCE_KIND = 'welcome';

/** Le rôle de compte qui ouvre droit à ce cadeau. */
const SUPPORTER_ROLE = 'supporter';

export type SelfWelcomeOutcome =
  /** Cadeau accordé par cet appel. */
  | {
      status: 'granted';
      coins: number;
      packGranted: boolean;
      ground: WelcomeGround;
    }
  /** `dryRun` seulement : rien n'a été écrit, mais le cadeau est réclamable. */
  | { status: 'claimable'; coins: number; ground: WelcomeGround }
  /** Déjà reçu : état NORMAL sur un rejeu, pas une erreur. */
  | { status: 'already' }
  /** Ni supportrice, ni staff de cet espace : aucun motif d'accueil. */
  | { status: 'not_eligible' }
  /**
   * Sur un roster : c'est le cadeau d'ÉDITION qui la concerne, et il ne se
   * cumule pas avec celui-ci. Vaut pour les DEUX motifs — un staff qui joue
   * aussi reçoit son cadeau comme n'importe quelle joueuse.
   */
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
    logger.error('[tcg/self-welcome] rôle illisible: %s', error.message);
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
    logger.error('[tcg/self-welcome] roster illisible: %s', error.message);
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
  userId: string,
  ground: WelcomeGround
): Promise<boolean | null> {
  if (!supabaseAdmin) return null;
  const { count, error } = await supabaseAdmin
    .from('tcg_wallet_entries')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('source_kind', WALLET_SOURCE_KIND[ground])
    .eq('source_ref', tenantId);
  if (error) {
    logger.error('[tcg/self-welcome] registre illisible: %s', error.message);
    return null;
  }
  return (count ?? 0) > 0;
}

/**
 * Ce compte fait-il partie du STAFF de la plateforme, et en activité ?
 *
 * Un staff désactivé (`is_active = false`) ou supprimé en douceur
 * (`deleted_at`) est traité comme s'il n'existait pas — c'est déjà la règle
 * partout ailleurs pour les droits, et un accueil est un droit comme un autre.
 *
 * UNE ERREUR DE LECTURE N'EST PAS UNE ABSENCE : `null`, jamais `false`. Rendre
 * `false` sur une panne transitoire refuserait un cadeau à qui y a droit, et
 * le refus s'afficherait comme un verdict.
 */
async function isActiveStaff(userId: string): Promise<boolean | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('staff')
    .select('id, is_active, deleted_at')
    .eq('auth_user_id', userId)
    .maybeSingle();
  if (error) {
    logger.error('[tcg/self-welcome] staff illisible: %s', error.message);
    return null;
  }
  const row = data as {
    is_active?: boolean | null;
    deleted_at?: string | null;
  } | null;
  if (!row) return false;
  return row.is_active !== false && !row.deleted_at;
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
export async function grantSelfWelcome(input: {
  tenantId: string;
  userId: string;
  dryRun?: boolean;
}): Promise<SelfWelcomeOutcome> {
  const { tenantId, userId, dryRun = false } = input;
  if (!supabaseAdmin || !tenantId || !userId) return { status: 'error' };

  // LE ROSTER TRANCHE EN PREMIER, quel que soit le motif. Qui figure sur un
  // roster relève du cadeau d'ÉDITION : les deux ne se cumulent pas, et cela
  // vaut aussi pour un staff qui joue — il reçoit son cadeau comme n'importe
  // quelle joueuse, par la même voie.
  const onRoster = await isOnAnyRoster(tenantId, userId);
  if (onRoster === null) return { status: 'error' };
  if (onRoster) return { status: 'on_roster' };

  // LE STAFF AVANT L'ÉTIQUETTE DE COMPTE. Un staff peut très bien porter le
  // rôle `supporter` dans ses metadata ; c'est sa fonction qui décide de
  // l'étiquette laissée au registre, pas une case cochée à l'inscription.
  const staff = await isActiveStaff(userId);
  if (staff === null) return { status: 'error' };

  let ground: WelcomeGround;
  if (staff) {
    ground = 'staff';
  } else {
    const roleRead = await readAccountRole(userId);
    if (!roleRead.ok) return { status: 'error' };
    if (roleRead.role !== SUPPORTER_ROLE) return { status: 'not_eligible' };
    ground = 'supporter';
  }

  const { coins, packs } = earnReward(WALLET_SOURCE_KIND[ground]);

  if (dryRun) {
    const claimed = await alreadyClaimed(tenantId, userId, ground);
    if (claimed === null) return { status: 'error' };
    return claimed
      ? { status: 'already' }
      : { status: 'claimable', coins, ground };
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
        source_kind: WALLET_SOURCE_KIND[ground],
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
      '[tcg/self-welcome] pièces non créditées: %s',
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
        '[tcg/self-welcome] paquet non accordé pour %s: %s',
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

  return { status: 'granted', coins, packGranted, ground };
}
