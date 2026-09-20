// utils/tcg/grantCoinsThenPacks.ts
//
// Accorder des pièces PUIS des paquets, pour une source qui n'a pas de match.
//
// POURQUOI CE MODULE. Trois sources sans match doivent faire apparaître un
// paquet : le drop Twitch, la série de check-ins et le palmarès de fin de
// tournoi. Les deux cadeaux d'accueil (`grantWelcomeGift`,
// `grantSelfWelcome`) portent déjà chacun leur copie de la mécanique ; en
// écrire trois de plus aurait donné cinq versions d'un ordre d'écriture dont UNE
// SEULE inversion suffit à multiplier les paquets. Les nouvelles sources passent
// donc par ici, et seulement par ici.
//
// L'IDEMPOTENCE VIENT DU PORTE-MONNAIE, PAS DES PAQUETS. `tcg_packs` n'a que
// `UNIQUE (tenant_id, user_id, source_match_id)`, et ces sources n'ont pas de
// match : `source_match_id` vaut NULL, et deux NULL sont DISTINCTS dans une
// contrainte UNIQUE — l'index ne bloque rien. `tcg_wallet_entries`, lui, porte
// `UNIQUE (tenant_id, user_id, source_kind, source_ref)`, une ancre bien réelle.
//
// D'où l'ordre, qui n'est pas négociable :
//   1. les pièces en `ON CONFLICT DO NOTHING ... RETURNING` — qui ne rend QUE
//      les lignes réellement insérées ;
//   2. les paquets, aux seules personnes que ce RETURNING a rendues.
// Un rejeu (retry de webhook, double check-in, finalisation relancée) rend zéro
// ligne à l'étape 1, donc n'accorde rien à l'étape 2.
//
// L'ORDRE INVERSE SERAIT PIRE : un échec entre les deux écritures laisserait un
// paquet sans pièces, et la relance — le porte-monnaie étant encore vide —
// ajouterait un SECOND paquet. Ici, le pire cas est une personne créditée sans
// paquet : un manque visible et réparable à la main, pas une multiplication
// silencieuse.
//
// ⚠️ L'ÉCART EST RENDU, JAMAIS AVALÉ. `packsGranted` et `packsExpected` sortent
// du compte rendu, et `packIds` est vide pour qui n'a pas reçu son paquet. Le
// 2026-09-14, 58 paquets ont été rejetés par un `CHECK` pendant qu'un écran
// affichait un succès : le compte rendu portait déjà l'écart, personne ne le
// lisait. Les appelants DOIVENT le lire.
//
// LA MONNAIE SE GAGNE, ELLE NE S'ACHÈTE PAS. Ce module ne crédite que des
// montants POSITIFS : aucune dépense, aucun moyen de paiement ne passe par ici
// (boîtes à butin interdites BE/NL, surveillées par l'ANJ — cf. docs/TCG.md).

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { refreshBalance } from './grantVictoryRewards';

/**
 * Origines de paquet SANS match, dans le vocabulaire de `tcg_packs` (qui
 * diffère de celui du porte-monnaie). Chacune doit figurer dans les DEUX
 * contraintes de la table — `tcg_packs_source_kind_check` ET
 * `tcg_packs_source_coherent` — cf. `tcg_earn_sources_drop_streak_placement.sql`.
 */
export type TcgMatchlessPackSourceKind =
  | 'welcome'
  | 'drop'
  | 'placement'
  | 'streak';

export type CoinsThenPacksGrant = {
  userId: string;
  /** Ce qui rend l'occurrence unique — la LIMITE anti-abus, cf. `earnSources.ts`. */
  sourceRef: string;
  /** Strictement positif : le registre interdit `amount = 0`. */
  coins: number;
  /** Paquets à accorder si, et seulement si, les pièces ont été écrites. */
  packs: number;
};

export type CoinsThenPacksCredit = {
  userId: string;
  sourceRef: string;
  coins: number;
  /** Paquets réellement créés. Vide si l'insertion des paquets a échoué. */
  packIds: string[];
};

export type CoinsThenPacksResult =
  | {
      ok: true;
      /** Personnes créditées PAR CET APPEL. Vide sur un rejeu. */
      credited: CoinsThenPacksCredit[];
      /** Paquets dus aux personnes créditées. */
      packsExpected: number;
      /** Paquets effectivement insérés. Doit égaler `packsExpected`. */
      packsGranted: number;
    }
  | {
      ok: false;
      /**
       * `rejected` : la base REFUSE (CHECK 23514, clé étrangère 23503) — un
       * réessai donnera le même refus, typiquement une migration non passée.
       * `failed` : panne a priori transitoire, qu'un réessai peut lever.
       * `conflict` : violation d'unicité (23505) sur un index AUTRE que la clé
       * du registre — le `ON CONFLICT` ne vise que celle-ci, tout autre index
       * unique lève. Seule `battlenet_verified` en porte (index partiels
       * « une fois par personne / par compte Blizzard ») : pour elle, c'est un
       * « déjà récompensé », pas une panne. Ailleurs, ce serait une anomalie.
       */
      reason: 'rejected' | 'failed' | 'conflict';
      message: string;
    };

/** Codes Postgres d'un refus définitif, qu'un réessai ne changera pas. */
const DEFINITIVE_REJECTION_CODES = new Set(['23514', '23503']);

/** Violation d'unicité hors de la clé d'arbitrage du `ON CONFLICT`. */
const UNIQUE_VIOLATION_CODE = '23505';

/**
 * Crédite des pièces, puis accorde les paquets aux seules lignes insérées.
 *
 * UNE LIGNE PAR PERSONNE PAR APPEL. Les paquets rendus par l'insertion sont
 * rattachés par `user_id` ; deux références pour la même personne dans un même
 * lot rendraient ce rattachement ambigu. Les appelants n'en ont jamais besoin
 * (un drop = une personne, une série = un roster, un palmarès = un rang par
 * personne), et le doublon est écarté ici plutôt que de produire un compte
 * rendu faux.
 *
 * Ne lève jamais : les trois appelants sont des effets de bord (webhook,
 * check-in, finalisation) qui ne doivent pas casser leur hôte.
 */
export async function grantCoinsThenPacks(input: {
  tenantId: string;
  /** `tcg_wallet_entries.source_kind` — une clé du registre. */
  walletSourceKind: string;
  /**
   * `null` = source SANS paquet (`battlenet_verified`). Un lot qui demanderait
   * alors un paquet est une erreur de programmation : la ligne est écartée,
   * plutôt que d'inventer une origine de paquet que le schéma refuserait.
   */
  packSourceKind: TcgMatchlessPackSourceKind | null;
  grants: readonly CoinsThenPacksGrant[];
}): Promise<CoinsThenPacksResult> {
  const { tenantId, walletSourceKind, packSourceKind } = input;
  if (!supabaseAdmin) {
    return { ok: false, reason: 'failed', message: 'supabase indisponible' };
  }

  // Garde d'entrée : un montant nul ou négatif ne passe pas. Nul, le CHECK le
  // rejetterait et ferait perdre le lot entier ; négatif, ce serait une
  // dépense déguisée en gain.
  const seen = new Set<string>();
  const grants: CoinsThenPacksGrant[] = [];
  for (const grant of input.grants) {
    if (!grant.userId || !grant.sourceRef) continue;
    if (!Number.isInteger(grant.coins) || grant.coins <= 0) continue;
    if (!Number.isInteger(grant.packs) || grant.packs < 0) continue;
    if (packSourceKind === null && grant.packs > 0) {
      logger.error(
        '[tcg/coins-then-packs] « %s » : paquet demandé sans origine de paquet',
        walletSourceKind
      );
      continue;
    }
    if (seen.has(grant.userId)) continue;
    seen.add(grant.userId);
    grants.push(grant);
  }
  if (grants.length === 0) {
    return { ok: true, credited: [], packsExpected: 0, packsGranted: 0 };
  }

  try {
    const nowIso = new Date().toISOString();

    // 1) Les pièces. `ignoreDuplicates` + `.select()` : PostgREST exécute un
    //    `ON CONFLICT DO NOTHING ... RETURNING`, qui ne rend QUE les lignes
    //    réellement insérées. C'est ce retour qui décide de la suite.
    const { data: insertedRows, error: coinError } = await supabaseAdmin
      .from('tcg_wallet_entries')
      .upsert(
        grants.map((grant) => ({
          tenant_id: tenantId,
          user_id: grant.userId,
          amount: grant.coins,
          source_kind: walletSourceKind,
          source_ref: grant.sourceRef,
          created_at: nowIso,
        })),
        {
          onConflict: 'tenant_id,user_id,source_kind,source_ref',
          ignoreDuplicates: true,
        }
      )
      .select('user_id, source_ref');

    if (coinError) {
      const code = (coinError as { code?: string }).code ?? '';
      const message =
        (coinError as { message?: string }).message ?? String(coinError);
      if (code === UNIQUE_VIOLATION_CODE) {
        // Pas `error` : pour la seule source concernée, c'est l'état normal
        // d'une seconde tentative. L'appelant décide de ce que ça veut dire.
        logger.warn(
          '[tcg/coins-then-packs] « %s » refusé par un index unique: %s',
          walletSourceKind,
          message
        );
        return { ok: false, reason: 'conflict', message };
      }
      const reason = DEFINITIVE_REJECTION_CODES.has(code)
        ? 'rejected'
        : 'failed';
      logger.error(
        '[tcg/coins-then-packs] pièces « %s » non créditées (%s): %s',
        walletSourceKind,
        code || 'sans code',
        message
      );
      return { ok: false, reason, message };
    }

    const insertedKeys = new Set(
      ((insertedRows ?? []) as Array<{ user_id: string; source_ref: string }>)
        .filter((row) => typeof row.user_id === 'string')
        .map((row) => `${row.user_id}\u0000${row.source_ref}`)
    );
    const creditedGrants = grants.filter((grant) =>
      insertedKeys.has(`${grant.userId}\u0000${grant.sourceRef}`)
    );
    if (creditedGrants.length === 0) {
      // Rejeu intégral : rien d'écrit, rien à accorder. État NORMAL.
      return { ok: true, credited: [], packsExpected: 0, packsGranted: 0 };
    }

    // 2) Les paquets, UNIQUEMENT pour les lignes que l'insertion a rendues.
    //    Sans ce filtre, un rejeu ajouterait des paquets à tout le monde :
    //    rien, dans `tcg_packs`, ne l'en empêcherait (cf. l'en-tête).
    const packRows = creditedGrants.flatMap((grant) =>
      Array.from({ length: grant.packs }, () => ({
        tenant_id: tenantId,
        user_id: grant.userId,
        source_kind: packSourceKind,
        // Pas de match derrière ces sources : la colonne reste nulle, et
        // c'est précisément pourquoi elle ne protège de rien ici.
        source_match_id: null,
        granted_at: nowIso,
      }))
    );
    const packsExpected = packRows.length;
    const packIdsByUser = new Map<string, string[]>();
    let packsGranted = 0;

    if (packsExpected > 0 && packSourceKind !== null) {
      const { data: packData, error: packError } = await supabaseAdmin
        .from('tcg_packs')
        .insert(packRows)
        .select('id, user_id');
      if (packError) {
        // Les pièces sont écrites et ne seront PAS rejouées : on le dit fort,
        // et le compte rendu le porte (`packsGranted` < `packsExpected`).
        logger.error(
          '[tcg/coins-then-packs] %d paquet(s) « %s » non accordé(s): %s',
          packsExpected,
          packSourceKind,
          (packError as { message?: string }).message ?? String(packError)
        );
      } else {
        for (const row of (packData ?? []) as Array<{
          id: string;
          user_id: string;
        }>) {
          if (typeof row.id !== 'string') continue;
          const ids = packIdsByUser.get(row.user_id) ?? [];
          ids.push(row.id);
          packIdsByUser.set(row.user_id, ids);
          packsGranted += 1;
        }
      }
    }

    // 3) Le solde se RECALCULE depuis le registre, il ne s'incrémente pas : un
    //    incrément perdu creuse un écart définitif, un recalcul se répare seul.
    await Promise.all(
      creditedGrants.map((grant) => refreshBalance(tenantId, grant.userId))
    );

    return {
      ok: true,
      credited: creditedGrants.map((grant) => ({
        userId: grant.userId,
        sourceRef: grant.sourceRef,
        coins: grant.coins,
        packIds: packIdsByUser.get(grant.userId) ?? [],
      })),
      packsExpected,
      packsGranted,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      '[tcg/coins-then-packs] attribution « %s » impossible: %s',
      walletSourceKind,
      message
    );
    return { ok: false, reason: 'failed', message };
  }
}
