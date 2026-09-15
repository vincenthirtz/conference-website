// utils/tcg/grantBattlenetVerified.ts
//
// Des pièces TCG, une fois à vie, quand une joueuse PROUVE son compte
// Battle.net.
//
// POURQUOI C'EST SAIN. La vérification n'est pas déclarative : c'est un OAuth
// Blizzard réel (code d'autorisation échangé côté serveur avec le secret
// client, `oauth/userinfo` lu avec le jeton rendu, state signé + nonce en
// cookie + liaison à la session — `pages/api/auth/battlenet/callback.ts`). Ce
// qu'on récompense est donc un fait établi par Blizzard, pas une saisie.
// Recopier le BattleTag d'une autre personne dans son roster ne rapporte rien.
//
// APPELÉ À UN SEUL ENDROIT : le callback de vérification, juste après que
// `upsertBattlenetLink` — seul écrivain de `user_battlenet_links` — a réussi.
// La connexion par Battle.net (compte déjà lié) ne prouve rien de neuf et ne
// passe pas par ici.
//
// LA LIMITE EST DANS LE SCHÉMA, PAS DANS UNE RELECTURE. Trois règles :
//   1. un rejeu (même personne, même compte, même tenant) → la clé du registre
//      `(tenant_id, user_id, source_kind, source_ref)`, `ON CONFLICT DO
//      NOTHING` : zéro ligne rendue ;
//   2. une fois par PERSONNE, tous comptes Blizzard et tous tenants confondus
//      → index unique partiel sur `user_id` ;
//   3. une fois par COMPTE BLIZZARD, toutes personnes et tous tenants
//      confondus → index unique partiel sur `source_ref`.
// Les règles 2 et 3 lèvent un 23505 (le `ON CONFLICT` ne vise que la clé 1),
// que `grantCoinsThenPacks` rend en `reason: 'conflict'` : ici, c'est « déjà
// récompensée », pas une panne. Sans ces deux index, changer de compte
// Blizzard sur la même joueuse recréditerait — de quoi remplir UN porte-monnaie
// avec autant de comptes Blizzard gratuits qu'on veut en créer.
//
// UN SEUL TENANT : celui de la requête, résolu comme le font les routes
// `/api/player/tcg/*`, donc le porte-monnaie que la joueuse voit. Une
// vérification est UN geste ; la multiplier par le nombre d'organisations où
// elle joue la paierait plusieurs fois, et la règle 2 l'interdit de toute façon.
//
// `source_ref` NE PORTE PAS L'IDENTIFIANT BLIZZARD EN CLAIR. La référence
// circule dans l'historique rendu à la joueuse, l'outbox du bot et le DM : on y
// met `bnet:<sha256>`. C'est une pseudonymisation (un identifiant numérique se
// retrouve par force brute), pas un secret — assez pour qu'il ne s'affiche ni
// ne se recherche nulle part. Pas de sel serveur : une rotation du sel
// casserait la règle 3.
//
// NE LÈVE JAMAIS. La vérification est déjà écrite quand on arrive ici : une
// récompense ratée ne doit pas la transformer en échec.
//
// LA MONNAIE SE GAGNE, ELLE NE S'ACHÈTE PAS. Aucun paiement, aucun don n'est
// lié à ce gain (boîtes à butin BE/NL, ANJ — cf. docs/TCG.md).

import { createHash } from 'crypto';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { earnReward, getEarnSource } from './earnSources';
import { grantCoinsThenPacks } from './grantCoinsThenPacks';
import { announceTcgRewards } from './announceReward';
import type { BattlenetRewardOffer } from './battlenetRewardDisplay';

const WALLET_SOURCE_KIND = 'battlenet_verified';

export type BattlenetVerifiedRewardOutcome =
  /** Créditée par cet appel. */
  | { status: 'granted'; coins: number }
  /** Déjà récompensée (rejeu, autre compte Blizzard, autre joueuse, autre tenant). */
  | { status: 'already' }
  /** `schemaReady` faux : la migration n'est pas déclarée passée. Rien tenté. */
  | { status: 'schema_not_ready' }
  /**
   * Écriture refusée ou en panne. `rejected` = la base refuse (typiquement le
   * CHECK 23514 d'une migration non appliquée), `failed` = a priori transitoire.
   */
  | { status: 'error'; reason: 'rejected' | 'failed' | 'invalid_input' };

/** La référence du registre pour un compte Blizzard. Cf. l'en-tête. */
export function battlenetRewardSourceRef(battleNetId: string): string {
  const digest = createHash('sha256')
    .update(`battlenet:${battleNetId.trim()}`)
    .digest('hex');
  return `bnet:${digest}`;
}

/**
 * Ce que la carte de vérification peut promettre à cette personne.
 *
 * `null` = rien à promettre : source non écrivable (migration non déclarée
 * passée). `claimable: false` = déjà reçue — OU registre illisible : une
 * erreur de lecture n'est pas une absence, et une promesse faite à l'aveugle
 * serait démentie au retour d'OAuth.
 *
 * Par personne seulement : le compte Blizzard n'est pas connu avant l'OAuth,
 * donc la règle « une fois par compte Blizzard » ne peut pas être anticipée.
 * Le cas (compte Blizzard déjà récompensé sur une AUTRE joueuse) suppose un
 * lien libéré entre-temps ; il est rarissime, et le retour d'OAuth ne dira
 * alors simplement rien.
 */
export async function readBattlenetRewardOffer(
  userId: string
): Promise<BattlenetRewardOffer | null> {
  if (!getEarnSource(WALLET_SOURCE_KIND)?.schemaReady) return null;
  const { coins } = earnReward(WALLET_SOURCE_KIND);
  if (!supabaseAdmin || !userId) return { coins, claimable: false };
  const { count, error } = await supabaseAdmin
    .from('tcg_wallet_entries')
    .select('id', { count: 'exact', head: true })
    .eq('source_kind', WALLET_SOURCE_KIND)
    .eq('user_id', userId);
  if (error) {
    logger.warn(
      '[tcg/battlenet-verified] registre illisible pour l’offre: %s',
      error.message
    );
    return { coins, claimable: false };
  }
  return { coins, claimable: (count ?? 0) === 0 };
}

export async function grantBattlenetVerifiedReward(input: {
  tenantId: string;
  userId: string;
  battleNetId: string;
}): Promise<BattlenetVerifiedRewardOutcome> {
  try {
    const tenantId = input.tenantId?.trim();
    const userId = input.userId?.trim();
    const battleNetId = input.battleNetId?.trim();
    if (!tenantId || !userId || !battleNetId) {
      logger.error('[tcg/battlenet-verified] entrée incomplète, rien crédité');
      return { status: 'error', reason: 'invalid_input' };
    }

    // Le drapeau COMMANDE (cf. `earnSources.ts`) : tant que la migration n'est
    // pas déclarée passée, on n'envoie pas une écriture vouée au 23514.
    if (!getEarnSource(WALLET_SOURCE_KIND)?.schemaReady) {
      logger.info('[tcg/battlenet-verified] source non écrivable, rien tenté');
      return { status: 'schema_not_ready' };
    }

    const { coins, packs } = earnReward(WALLET_SOURCE_KIND);
    const result = await grantCoinsThenPacks({
      tenantId,
      walletSourceKind: WALLET_SOURCE_KIND,
      // Source sans paquet : cf. `BATTLENET_VERIFIED_COINS`.
      packSourceKind: null,
      grants: [
        {
          userId,
          sourceRef: battlenetRewardSourceRef(battleNetId),
          coins,
          packs,
        },
      ],
    });

    if (!result.ok) {
      if (result.reason === 'conflict') {
        // Règle 2 ou 3 : cette personne ou ce compte Blizzard l'a déjà eue.
        logger.info(
          '[tcg/battlenet-verified] déjà récompensée (personne ou compte Blizzard)'
        );
        return { status: 'already' };
      }
      // `grantCoinsThenPacks` a déjà journalisé le détail (code, message).
      logger.error(
        '[tcg/battlenet-verified] récompense non créditée (%s)',
        result.reason
      );
      return { status: 'error', reason: result.reason };
    }

    // Zéro ligne rendue = rejeu exact (règle 1). État NORMAL, sans annonce.
    if (result.credited.length === 0) return { status: 'already' };

    // DM Discord à la seule personne créditée par CET appel. Attendu, pour
    // qu'une fonction serverless ne soit pas gelée avant l'écriture dans
    // l'outbox ; ne lève jamais.
    await announceTcgRewards({
      tenantId,
      reason: 'battlenet_verified',
      tournamentId: null,
      credited: result.credited,
    });

    return { status: 'granted', coins };
  } catch (err) {
    logger.error(
      '[tcg/battlenet-verified] récompense impossible: %s',
      err instanceof Error ? err.message : String(err)
    );
    return { status: 'error', reason: 'failed' };
  }
}
