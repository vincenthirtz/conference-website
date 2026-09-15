// utils/tcg/grantCollectionSets.ts
//
// « Où en sont mes séries, et en ai-je complété une ? » — lecture de la
// progression ET attribution de la récompense d'une série complétée.
//
// DEUX DÉCLENCHEURS, UN SEUL ÉCRIVAIN.
//   - l'ouverture d'un paquet (`POST /api/player/tcg/packs`) : le moment où une
//     série se complète, celui où l'annonce a du sens ;
//   - la lecture des séries (`GET /api/player/tcg/sets`) : une vérification
//     PARESSEUSE qui rattrape tout ce que le premier a manqué — séries déjà
//     complètes avant la fonctionnalité, migration appliquée après coup,
//     ouverture dont l'effet de bord a échoué, série dont le contenu a changé.
// Les deux passent par `checkCollectionSets`, donc par la même clé.
//
// LA LIMITE EST UNE CLÉ, PAS UNE RELECTURE. `source_ref` = l'identifiant stable
// de la série (`collectionSets.ts`), et `UNIQUE (tenant_id, user_id,
// source_kind, source_ref)` fait le reste : `grantCoinsThenPacks` écrit en
// `ON CONFLICT DO NOTHING ... RETURNING`, et seul ce retour décide qu'on a
// crédité. Deux onglets qui lisent en même temps, une ouverture et une lecture
// simultanées : une seule ligne, une seule annonce. La lecture préalable des
// séries déjà récompensées ne sert QU'À L'AFFICHAGE et à éviter des écritures
// inutiles — jamais de garde-fou.
//
// RECYCLER APRÈS LA RÉCOMPENSE NE LA REPREND PAS. La série se relit sur ce
// qu'on possède encore (le compteur redescend), la récompense vit dans le
// registre (elle reste). Et recompléter la série ne recrédite rien : la clé
// est déjà prise. Même doctrine que le palmarès : un gain versé ne se reprend
// pas, une correction se fait à la main (`admin_grant`).
//
// LA MONNAIE SE GAGNE, ELLE NE S'ACHÈTE PAS. Des pièces seules, montant
// positif, aucun moyen de paiement.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { emitBotEvent } from '@/utils/botEvents';
import { getDiscordLinksForUsers } from '@/utils/discordLinks';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { getEarnSource } from './earnSources';
import { grantCoinsThenPacks } from './grantCoinsThenPacks';
import { readOwnedCardRows } from './readOwnedCards';
import { readCollectionSets } from './readCollectionSets';
import { cardSubjectKey } from './subjectKey';
import {
  collectionSetLabelFr,
  evaluateCollectionSets,
  type CollectionSetDefinition,
  type CollectionSetProgress,
} from './collectionSets';

export const COLLECTION_SET_SOURCE_KIND = 'collection_set';

/**
 * Séries récompensées au plus par appel. Chaque attribution est une écriture et
 * un recalcul de solde : une lecture qui rattraperait trente séries d'un coup
 * (migration tardive) resterait bornée, la suivante finissant le travail.
 */
export const MAX_SET_GRANTS_PER_CALL = 20;

export type SetProgressWithReward = CollectionSetProgress & {
  /**
   * La récompense de cette série est-elle déjà au registre ? `null` = lecture
   * du registre en échec : on ne sait pas, et on ne l'affirme pas.
   */
  rewarded: boolean | null;
  /** Vrai si CET appel vient d'écrire la récompense. */
  justRewarded: boolean;
};

export type CompletedSetNotice = {
  key: string;
  kind: CollectionSetDefinition['kind'];
  mode: string | null;
  tournamentName: string | null;
  teamName: string | null;
  coins: number;
};

export type CheckSetsResult =
  | {
      ok: true;
      sets: SetProgressWithReward[];
      /** Séries dont la récompense vient d'être écrite par cet appel. */
      newlyRewarded: CompletedSetNotice[];
      /** Montant d'une récompense de série, pour que l'interface l'annonce. */
      rewardCoins: number;
    }
  | { ok: false; error: string };

/** Les `source_ref` de séries déjà récompensées. `null` = illisible. */
async function readRewardedSetKeys(
  tenantId: string,
  userId: string
): Promise<Set<string> | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('tcg_wallet_entries')
    .select('source_ref')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('source_kind', COLLECTION_SET_SOURCE_KIND)
    // Une ligne par série au plus : 1000 couvre largement l'existant.
    .limit(1000);
  if (error) {
    logger.warn(
      '[tcg/sets] séries récompensées illisibles pour %s: %s',
      userId,
      error.message
    );
    return null;
  }
  return new Set(
    ((data ?? []) as Array<{ source_ref: string }>).map((r) => r.source_ref)
  );
}

/**
 * Annonce `tcg.set_completed` — UNE fois, à la seule écriture réelle.
 *
 * Contrat FIXE (consommé par le bot) :
 * `{ userId, discordUserId, discordUsername, setKey, setLabel, coins, ctaUrl }`.
 * `setLabel` ne porte aucun nom de joueuse (cf. `collectionSetLabelFr`).
 *
 * Ne lève jamais : les pièces sont déjà écrites.
 */
export async function announceSetCompleted(input: {
  tenantId: string;
  userId: string;
  set: Pick<
    CollectionSetDefinition,
    'key' | 'kind' | 'mode' | 'tournamentName' | 'teamName'
  >;
  coins: number;
}): Promise<void> {
  try {
    const links = await getDiscordLinksForUsers([input.userId]);
    const link = links.get(input.userId) ?? null;
    await emitBotEvent(
      'tcg.set_completed',
      {
        userId: input.userId,
        discordUserId: link?.discordUserId ?? null,
        discordUsername: link?.discordUsername ?? null,
        setKey: input.set.key,
        setLabel: collectionSetLabelFr(input.set),
        coins: input.coins,
        // Absolue : ce lien part dans un DM, où un chemin relatif est inerte.
        ctaUrl: absoluteSiteUrl('/player/tcg'),
      },
      input.tenantId
    );
  } catch (err) {
    logger.error(
      '[tcg/sets] annonce de la série %s impossible: %s',
      input.set.key,
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Lit la progression des séries d'une joueuse et récompense celles qui sont
 * complètes sans l'avoir encore été.
 *
 * Ne lève jamais. `ok: false` quand la progression elle-même est illisible —
 * et alors RIEN n'est écrit : récompenser sur une lecture partielle (un roster
 * lu à moitié paraît complet) ne se rattraperait pas.
 */
export async function checkCollectionSets(input: {
  tenantId: string;
  userId: string;
}): Promise<CheckSetsResult> {
  const { tenantId, userId } = input;
  const source = getEarnSource(COLLECTION_SET_SOURCE_KIND);
  const rewardCoins = source?.coins ?? 0;

  try {
    const [definitions, owned, rewardedKeys] = await Promise.all([
      readCollectionSets(tenantId),
      // SANS les cartes reçues par échange (paquets `trade`) — pour la
      // récompense ET pour la progression affichée. Une série se paie une fois
      // par joueuse : si l'échange comptait, des comptes se passeraient une
      // série complète et toucheraient chacun ses pièces. Compter l'échange
      // dans la progression mais pas dans la récompense afficherait « complète »
      // sans rien verser, ce que personne ne comprendrait. La règle est dite
      // sur la page des échanges.
      readOwnedCardRows(tenantId, userId, { excludeTradedIn: true }),
      readRewardedSetKeys(tenantId, userId),
    ]);
    if (!definitions.ok) return { ok: false, error: definitions.error };
    if (!owned.ok) return { ok: false, error: owned.error };

    const ownedKeys = new Set<string>();
    for (const row of owned.value) {
      const key = cardSubjectKey(row);
      if (key) ownedKeys.add(key);
    }

    const progress = evaluateCollectionSets(definitions.sets, ownedKeys);
    const byKey = new Map(definitions.sets.map((s) => [s.key, s]));

    // Registre illisible : on TENTE quand même les séries complètes. La clé
    // d'unicité rend l'essai sans risque (un rejeu n'écrit rien) ; c'est
    // l'affichage de « déjà récompensée » qui reste inconnu.
    const toGrant = progress
      .filter((p) => p.complete && !(rewardedKeys?.has(p.key) ?? false))
      .slice(0, MAX_SET_GRANTS_PER_CALL);

    const credited = new Set<string>();
    const newlyRewarded: CompletedSetNotice[] = [];

    // Le drapeau COMMANDE (cf. `earnSources.ts`) : sans lui, aucune écriture.
    if (source?.schemaReady && rewardCoins > 0) {
      // UN APPEL PAR SÉRIE : `grantCoinsThenPacks` n'accepte qu'une ligne par
      // personne par appel, et chaque série est sa propre occurrence.
      for (const p of toGrant) {
        const outcome = await grantCoinsThenPacks({
          tenantId,
          walletSourceKind: COLLECTION_SET_SOURCE_KIND,
          packSourceKind: null,
          grants: [{ userId, sourceRef: p.key, coins: rewardCoins, packs: 0 }],
        });
        if (!outcome.ok) {
          // Refus (migration absente) ou panne : rien n'est écrit, la lecture
          // suivante retentera. Inutile d'insister sur les autres séries du lot
          // si la base refuse la source elle-même.
          logger.warn(
            '[tcg/sets] série %s non récompensée (%s): %s',
            p.key,
            outcome.reason,
            outcome.message
          );
          if (outcome.reason === 'rejected') break;
          continue;
        }
        // Seul le RETURNING décide : vide = quelqu'un d'autre l'a déjà écrite.
        if (outcome.credited.length === 0) {
          credited.add(`already:${p.key}`);
          continue;
        }
        credited.add(p.key);
        newlyRewarded.push({
          key: p.key,
          kind: p.kind,
          mode: p.mode,
          tournamentName: p.tournamentName,
          teamName: p.teamName,
          coins: outcome.credited[0].coins,
        });
        const definition = byKey.get(p.key);
        if (definition) {
          await announceSetCompleted({
            tenantId,
            userId,
            set: definition,
            coins: outcome.credited[0].coins,
          });
        }
      }
    }

    const sets: SetProgressWithReward[] = progress.map((p) => {
      const justRewarded = credited.has(p.key);
      const alreadyByRace = credited.has(`already:${p.key}`);
      return {
        ...p,
        rewarded:
          justRewarded || alreadyByRace
            ? true
            : rewardedKeys === null
              ? null
              : rewardedKeys.has(p.key),
        justRewarded,
      };
    });

    return { ok: true, sets, newlyRewarded, rewardCoins };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      '[tcg/sets] progression impossible pour %s: %s',
      userId,
      message
    );
    return { ok: false, error: message };
  }
}
