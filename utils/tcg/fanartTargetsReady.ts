// utils/tcg/fanartTargetsReady.ts
//
// LES ILLUSTRATIONS ALTERNATIVES SONT-ELLES OUVERTES ? — c'est-à-dire : la
// migration `database/migrations/tcg_fanart_targets.sql` est-elle appliquée ?
//
// MÊME RÈGLE QUE `heroCardsReady.ts`, POUR LA MÊME RAISON. Le code part en
// production AVANT la migration, appliquée à la main. Entre les deux, citer
// `target_kind` ferait tomber la lecture entière (42703) : plus de file de
// modération, plus de « mes propositions », plus aucune face de fan art. Tant
// que la colonne manque, personne ne la cite, le sélecteur de cible n'est pas
// proposé, et tout se comporte exactement comme avant.
//
// UNE SONDE PAR PROCESSUS, PAS UN ESSAI-ERREUR À CHAQUE LECTURE : rejouer
// chaque lecture « avec, puis sans » doublerait les requêtes — et les logs
// Supabase facturés — jusqu'à la migration.
//
// LA MIGRATION EST ATOMIQUE (colonnes et CHECK dans une transaction) : voir
// `target_kind`, c'est savoir que `target_slug` et les garde-fous sont là.
//
// MISE EN CACHE, comme les héros :
//   - « ouvert » est définitif pour la vie du processus (un retour arrière de
//     la migration exige de redémarrer l'API) ;
//   - « fermé » est relu au plus toutes les `RETRY_AFTER_MS` : appliquer la
//     migration ouvre les cibles dans la minute, sans redéploiement.
//
// NE LÈVE JAMAIS. Dans le doute, « fermé » : les fan arts restent des fan arts.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { isMissingColumnError } from '@/utils/moderation/missingColumn';
import { registerProcessCache } from '@/utils/processCaches';

/** La colonne sondée ; `target_slug` arrive dans la même transaction. */
export const FANART_TARGET_KIND_COLUMN = 'target_kind';

/** Les deux colonnes, telles qu'un lecteur les ajoute à son `select`. */
export const FANART_TARGET_COLUMNS = 'target_kind, target_slug';

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
      .from('tcg_fanart_cards')
      .select(FANART_TARGET_KIND_COLUMN)
      .limit(1);
    if (!error) return true;
    // Colonne absente = migration pas encore appliquée : l'état attendu.
    if (!isMissingColumnError(error, FANART_TARGET_KIND_COLUMN)) {
      logger.warn(
        '[tcg/fanart] sonde de la migration des cibles illisible: %s',
        error.message
      );
    }
    return false;
  } catch (err) {
    logger.warn(
      '[tcg/fanart] sonde de la migration des cibles impossible: %s',
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

/**
 * `true` quand une fan art peut porter une cible (lecture et écriture).
 * Les appels simultanés partagent la même sonde.
 */
export async function fanartTargetsReady(): Promise<boolean> {
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
 * Referme les cibles pour `RETRY_AFTER_MS` : une lecture qui les cite a été
 * refusée alors que la sonde disait « ouvert » (cache de schéma PostgREST pas
 * encore rechargé). Les suivantes repartent sans elles.
 */
export function markFanartTargetsUnavailable(): void {
  known = { ready: false, at: Date.now() };
}

/** `columns` suivi des deux colonnes de cible quand elles existent. */
export function withFanartTargetColumns(
  columns: string,
  ready: boolean
): string {
  return ready ? `${columns}, ${FANART_TARGET_COLUMNS}` : columns;
}

/** L'erreur dit-elle que les colonnes de cible manquent ? */
export function isMissingFanartTargetColumn(err: unknown): boolean {
  return (
    isMissingColumnError(err, FANART_TARGET_KIND_COLUMN) ||
    isMissingColumnError(err, 'target_slug')
  );
}
