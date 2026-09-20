// utils/tcg/photoPurge.ts
//
// Effacer une photo du bucket PUBLIC, de façon qu'un échec soit rattrapable.
//
// LE PROBLÈME QUE CE MODULE EXISTE POUR RÉSOUDRE. Retirer son consentement (ou
// voir sa photo refusée) faisait deux gestes : mettre `photo_path` à NULL en
// base, puis supprimer le fichier. `teams-images` est un bucket PUBLIC. Quand
// la suppression échouait — réseau, 5xx du stockage —, plus rien ne portait le
// chemin : l'échec était journalisé, aucune reprise n'était possible, et la
// photo restait joignable par son URL. Indéfiniment. C'est l'inverse exact du
// « retrait rétroactif » que le produit promet.
//
// INVERSER L'ORDRE NE SUFFISAIT PAS. Supprimer le fichier d'abord laisserait,
// si l'écriture échoue ensuite, une ligne pointant vers un fichier disparu :
// une carte cassée au lieu d'une carte sans photo. Il faut un TROISIÈME
// endroit qui survive aux deux échecs — `tcg_photo_purges`.
//
// L'ORDRE, DONC, EST : mettre en file → couper le pointeur en base → tenter la
// suppression → retirer de la file si elle a réussi. Chaque étape peut échouer
// sans laisser de photo publique orpheline :
//   - la mise en file échoue → on n'a rien coupé, la joueuse réessaie (et on
//     REFUSE de continuer : c'est le seul cas où l'on préfère ne rien faire) ;
//   - la coupure échoue → une ligne de file en trop, que le balayage traitera ;
//     le fichier est encore référencé, donc encore affiché — pas de fuite ;
//   - la suppression échoue → la file garde le chemin, le cron réessaie.
//
// UNE LIGNE DE FILE EN TROP NE COÛTE RIEN : le balayage qui ne trouve pas le
// fichier considère le travail fait. Une ligne MANQUANTE, elle, est une photo
// publique pour toujours. Toute l'asymétrie du module tient là.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

/** Le bucket des photos de carte. PUBLIC — d'où tout ce fichier. */
export const TCG_PHOTO_BUCKET = 'teams-images';

export type PurgeReason = 'revoked' | 'rejected';

/**
 * Met un chemin dans la file, AVANT que la base cesse de le référencer.
 *
 * Rend `false` si la file n'a pas pu être écrite — l'appelant doit alors
 * s'arrêter plutôt que de couper le pointeur : mieux vaut un retrait à
 * recommencer qu'un fichier public dont plus personne ne connaît le chemin.
 *
 * Le conflit sur l'index unique n'est PAS une erreur : deux retraits
 * concurrents sur la même photo veulent la même chose, et une seule ligne
 * suffit à l'obtenir.
 */
export async function enqueuePhotoPurge(input: {
  tenantId: string;
  userId: string;
  storagePath: string;
  reason: PurgeReason;
}): Promise<boolean> {
  if (!supabaseAdmin) return false;

  const { error } = await supabaseAdmin.from('tcg_photo_purges').upsert(
    {
      tenant_id: input.tenantId,
      user_id: input.userId,
      storage_path: input.storagePath,
      reason: input.reason,
    },
    { onConflict: 'storage_path', ignoreDuplicates: true }
  );

  if (error) {
    logger.error(
      '[tcg/photo-purge] mise en file impossible (%s): %s',
      input.storagePath,
      error.message
    );
    return false;
  }
  return true;
}

/**
 * Retire une ligne de file posée pour rien.
 *
 * Le refus de modération met le chemin en file AVANT son écriture
 * conditionnelle, qui peut perdre la course (la joueuse a remplacé sa photo
 * entre-temps). Sans ce retrait, le balayage effacerait un fichier que la base
 * référence toujours : une carte cassée, soit l'inverse exact du but.
 */
export async function cancelPhotoPurge(storagePath: string): Promise<void> {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin
    .from('tcg_photo_purges')
    .delete()
    .eq('storage_path', storagePath);
  if (error) {
    logger.error(
      '[tcg/photo-purge] ligne de file non retirée (%s): %s',
      storagePath,
      error.message
    );
  }
}

/**
 * Tente la suppression tout de suite, et ne vide la file qu'en cas de succès.
 *
 * Ne lève jamais et ne rend rien d'exploitable : l'appelant a déjà répondu à
 * la joueuse que le retrait est acquis — il l'est, la base ne référence plus
 * la photo. Ce qui reste est un travail de ménage, qui a son cron.
 */
export async function tryPurgeNow(storagePath: string): Promise<void> {
  if (!supabaseAdmin) return;

  const { error } = await supabaseAdmin.storage
    .from(TCG_PHOTO_BUCKET)
    .remove([storagePath]);

  if (error) {
    // On laisse la ligne en file. Le cron reprendra — c'est précisément le
    // cas pour lequel la file existe.
    logger.warn(
      '[tcg/photo-purge] suppression différée (%s): %s',
      storagePath,
      error.message
    );
    await noteAttempt(storagePath, error.message);
    return;
  }

  await supabaseAdmin
    .from('tcg_photo_purges')
    .delete()
    .eq('storage_path', storagePath);
}

/**
 * Consigne un échec sur la ligne de file.
 *
 * `attempts` qui grimpe est le signe d'un chemin qui ne s'effacera jamais (un
 * fichier déplacé à la main, un bucket renommé) : c'est une ligne à REGARDER,
 * pas une ligne à ignorer. On ne la supprime donc jamais automatiquement au
 * bout de N essais — supprimer serait oublier une photo publique.
 */
async function noteAttempt(storagePath: string, message: string) {
  if (!supabaseAdmin) return;
  const { data } = await supabaseAdmin
    .from('tcg_photo_purges')
    .select('attempts')
    .eq('storage_path', storagePath)
    .maybeSingle();
  const attempts = ((data as { attempts?: number } | null)?.attempts ?? 0) + 1;
  await supabaseAdmin
    .from('tcg_photo_purges')
    .update({
      attempts,
      last_attempt_at: new Date().toISOString(),
      last_error: message.slice(0, 500),
    })
    .eq('storage_path', storagePath);
}

export type SweepResult = {
  examined: number;
  purged: number;
  failed: number;
};

/**
 * Le balayage : reprend les chemins que la suppression immédiate a manqués.
 *
 * LES PLUS ANCIENS D'ABORD — une photo en attente depuis hier passe avant une
 * mise en file d'il y a une minute. Borné (`limit`) pour qu'un incident de
 * stockage ne fasse pas dépasser le temps d'exécution de la fonction.
 *
 * UN FICHIER INTROUVABLE EST UN SUCCÈS. Le stockage Supabase ne distingue pas
 * « supprimé » de « n'existait pas » dans son retour : dans les deux cas, le
 * fichier n'est plus là, et c'est tout ce que la file voulait obtenir.
 */
export async function sweepPhotoPurges(limit = 50): Promise<SweepResult> {
  const result: SweepResult = { examined: 0, purged: 0, failed: 0 };
  if (!supabaseAdmin) return result;

  const { data, error } = await supabaseAdmin
    .from('tcg_photo_purges')
    .select('storage_path')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    logger.error('[tcg/photo-purge] file illisible: %s', error.message);
    return result;
  }

  const rows = (data ?? []) as Array<{ storage_path: string }>;
  result.examined = rows.length;

  for (const row of rows) {
    const { error: removeError } = await supabaseAdmin.storage
      .from(TCG_PHOTO_BUCKET)
      .remove([row.storage_path]);

    if (removeError) {
      result.failed += 1;
      await noteAttempt(row.storage_path, removeError.message);
      continue;
    }

    const { error: deleteError } = await supabaseAdmin
      .from('tcg_photo_purges')
      .delete()
      .eq('storage_path', row.storage_path);

    if (deleteError) {
      // Le fichier est parti : la promesse est tenue. La ligne restante sera
      // rejouée au prochain passage, et le sera sans effet.
      logger.warn(
        '[tcg/photo-purge] fichier effacé mais ligne conservée (%s): %s',
        row.storage_path,
        deleteError.message
      );
    }
    result.purged += 1;
  }

  return result;
}
