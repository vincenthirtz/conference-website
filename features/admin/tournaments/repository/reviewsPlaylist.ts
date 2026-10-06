// features/admin/tournaments/repository/reviewsPlaylist.ts — accès base de la
// playlist YouTube « Reviews » d'un tournoi (`tournaments.reviews_playlist_id`).
//
// La colonne n'est pas encore dans types/database.generated.ts (migration
// tournaments_reviews_playlist.sql à appliquer, puis types à régénérer) : on
// passe par un nom de colonne typé `string` et des casts LOCAUX, plutôt que de
// toucher au fichier généré.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesUpdate } from '@/types/database.generated';

export const REVIEWS_PLAYLIST_COLUMN: string = 'reviews_playlist_id';

export async function readReviewsPlaylist(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data, error } = await db
    .from('tournaments')
    .select(`id, ${REVIEWS_PLAYLIST_COLUMN}`)
    .eq('tenant_id', tenantId)
    .eq('id', tournamentId)
    .maybeSingle();
  return {
    data: data as unknown as Record<string, unknown> | null,
    error,
  };
}

/**
 * `updated_at` volontairement NON modifié : c'est la version que compare le
 * verrou optimiste du formulaire d'édition (même écran). Enregistrer la
 * playlist ne doit pas faire échouer la sauvegarde du reste de la fiche.
 */
export async function writeReviewsPlaylist(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  playlistId: string | null
) {
  return db
    .from('tournaments')
    .update({
      [REVIEWS_PLAYLIST_COLUMN]: playlistId,
    } as unknown as TablesUpdate<'tournaments'>)
    .eq('tenant_id', tenantId)
    .eq('id', tournamentId)
    .select('id')
    .maybeSingle();
}
