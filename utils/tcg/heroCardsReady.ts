// utils/tcg/heroCardsReady.ts
//
// LES CARTES HÉROS SONT-ELLES OUVERTES ? — c'est-à-dire : la migration
// `database/migrations/tcg_hero_cards.sql` est-elle appliquée ?
//
// POURQUOI UNE DÉTECTION ET PAS UN INTERRUPTEUR. Le code part en production
// AVANT la migration, appliquée à la main. Entre les deux, une carte héros
// écrite dans `tcg_pack_cards` serait refusée (colonne absente, CHECK qui ne
// connaît pas `hero`) et l'ouverture de paquet tomberait en 500 ; une lecture
// qui citerait `card_hero_slug` ferait tomber la collection entière (42703).
// Les mascottes n'avaient rien prévu — leur migration est passée AVANT le
// code. Ici, le dépôt applique sa règle habituelle pour une migration manuelle
// (`utils/moderation/missingColumn.ts`, `features/admin/recycle-bin/`) :
// détecter la colonne, et se comporter comme avant tant qu'elle manque.
//
// UNE SONDE, PAS UN ESSAI-ERREUR À CHAQUE LECTURE. Une seule requête dit si la
// colonne existe ; tous les lecteurs (tirage, collection, échanges, vue staff)
// lisent la même réponse. Rejouer chaque lecture « avec, puis sans » doublerait
// les requêtes — et les logs Supabase facturés — jusqu'à la migration.
//
// LA MIGRATION EST ATOMIQUE (une transaction : colonnes, CHECK, fonctions
// d'échange et de forge). Voir la colonne, c'est donc savoir que tout le reste
// est en place.
//
// MISE EN CACHE :
//   - « ouvert » est définitif pour la vie du processus : une colonne ne
//     disparaît pas toute seule (un retour arrière de la migration exige de
//     redémarrer l'API) ;
//   - « fermé » est relu au plus toutes les `RETRY_AFTER_MS` : appliquer la
//     migration ouvre les cartes héros dans la minute, sans redéploiement.
//
// NE LÈVE JAMAIS. Dans le doute — sonde en échec, client absent —, la réponse
// est « fermé » : les héros ne sortent simplement pas, rien d'autre ne change.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { isMissingColumnError } from '@/utils/moderation/missingColumn';
import { registerProcessCache } from '@/utils/processCaches';

/** La colonne que la migration ajoute à `tcg_pack_cards` et `tcg_trade_items`. */
export const HERO_CARD_COLUMN = 'card_hero_slug';

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
      .select('card_hero_slug')
      .limit(1);
    if (!error) return true;
    // Colonne absente = migration pas encore appliquée : l'état attendu, pas
    // une panne. Toute autre erreur est dite, et vaut aussi « fermé ».
    if (!isMissingColumnError(error, HERO_CARD_COLUMN)) {
      logger.warn(
        '[tcg/heroes] sonde de la migration illisible: %s',
        error.message
      );
    }
    return false;
  } catch (err) {
    logger.warn(
      '[tcg/heroes] sonde de la migration impossible: %s',
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

/**
 * `true` quand les cartes héros peuvent être tirées, écrites et lues.
 *
 * Les appels simultanés partagent la même sonde.
 */
export async function heroCardsReady(): Promise<boolean> {
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
 * Referme les cartes héros pour `RETRY_AFTER_MS`.
 *
 * Pour l'ouverture de paquet : si l'écriture d'une carte héros est refusée
 * alors que la sonde disait « ouvert » (cache de schéma PostgREST pas encore
 * rechargé, migration partielle appliquée à la main), le paquet suivant doit
 * sortir SANS héros plutôt que d'échouer de la même façon.
 */
export function markHeroCardsUnavailable(): void {
  known = { ready: false, at: Date.now() };
}

/**
 * `columns` suivi de `, card_hero_slug` quand la colonne existe.
 *
 * Pour les lecteurs qui listent leurs colonnes : sans la colonne, une carte
 * héros serait lue SANS SUJET et sautée en silence (le travers qu'ont connu les
 * mascottes) ; avec elle avant la migration, la lecture entière échouerait.
 */
export function withHeroColumn(columns: string, ready: boolean): string {
  return ready ? `${columns}, ${HERO_CARD_COLUMN}` : columns;
}
