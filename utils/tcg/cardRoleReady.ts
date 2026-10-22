// utils/tcg/cardRoleReady.ts
//
// LE RÔLE FIGÉ DES CARTES EST-IL LISIBLE ? — c'est-à-dire : la migration
// `database/migrations/tcg_card_role.sql` est-elle appliquée ?
//
// Même contrat que `heroCardsReady.ts`, dont ce module reprend la forme : le
// code part en production AVANT la migration, appliquée à la main. Entre les
// deux, citer `card_role` dans une lecture la ferait tomber entière (42703),
// et l'écrire à l'ouverture d'un paquet ferait échouer l'ouverture.
//
// CE QUI SE PASSE TANT QU'ELLE MANQUE. Rien n'est écrit, rien n'est lu : les
// chiffres d'une carte (`cardStats.ts`) se répartissent selon le rôle COURANT,
// celui que dessine déjà la figurine. Justes, mais pas encore stables — une
// joueuse qui change de héros verrait ses cartes suivre. Appliquer la
// migration fige le rôle de toutes les cartes existantes (backfill) et ouvre
// l'écriture dans la minute, sans redéploiement.
//
// MISE EN CACHE : « ouvert » est définitif pour la vie du processus ; « fermé »
// est relu au plus toutes les `RETRY_AFTER_MS`. Ne lève jamais : dans le
// doute, « fermé » — les cartes gardent leurs chiffres courants.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { isMissingColumnError } from '@/utils/moderation/missingColumn';
import { registerProcessCache } from '@/utils/processCaches';

/** La colonne que la migration ajoute à `tcg_pack_cards`. */
export const CARD_ROLE_COLUMN = 'card_role';

/** Délai avant de reposer la question quand la réponse était « fermé ». */
export const RETRY_AFTER_MS = 60_000;

let known: { ready: boolean; at: number } | null = null;
let inflight: Promise<boolean> | null = null;

registerProcessCache(() => {
  known = null;
  inflight = null;
});

async function probe(): Promise<boolean> {
  if (!supabaseAdmin) return false;
  try {
    const { error } = await supabaseAdmin
      .from('tcg_pack_cards')
      .select(CARD_ROLE_COLUMN)
      .limit(1);
    if (!error) return true;
    // Colonne absente = migration pas encore appliquée : l'état attendu.
    if (!isMissingColumnError(error, CARD_ROLE_COLUMN)) {
      logger.warn(
        '[tcg/stats] sonde de la migration illisible: %s',
        error.message
      );
    }
    return false;
  } catch (err) {
    logger.warn(
      '[tcg/stats] sonde de la migration impossible: %s',
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

/** `true` quand `tcg_pack_cards.card_role` peut être lue et écrite. */
export async function cardRoleReady(): Promise<boolean> {
  if (known?.ready) return true;
  if (known && Date.now() - known.at < RETRY_AFTER_MS) return false;
  if (!inflight) {
    inflight = probe().then((ready) => {
      known = { ready, at: Date.now() };
      inflight = null;
      return ready;
    });
  }
  return inflight;
}

/**
 * Referme la colonne pour `RETRY_AFTER_MS` : une écriture refusée alors que la
 * sonde disait « ouvert » (cache de schéma PostgREST pas encore rechargé) ne
 * doit pas faire échouer le paquet suivant de la même façon.
 */
export function markCardRoleUnavailable(): void {
  known = { ready: false, at: Date.now() };
}

/** `columns` suivi de `, card_role` quand la colonne existe. */
export function withCardRoleColumn(columns: string, ready: boolean): string {
  return ready ? `${columns}, ${CARD_ROLE_COLUMN}` : columns;
}
