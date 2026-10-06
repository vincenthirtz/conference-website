// features/admin/tournaments/repository/reviewsPlaylist.ts — accès base de la
// playlist YouTube « Reviews » d'un tournoi (`tournaments.reviews_playlist_id`,
// migration tournaments_reviews_playlist.sql).
//
// Lecture à part plutôt qu'une colonne de plus dans le `select` de la fiche :
// sur un environnement où la migration manque, seule cette lecture échoue
// (42703, repli dans le service), pas toute la fiche tournoi.

import type { AdminDb } from '@/utils/admin/serviceContext';

export const REVIEWS_PLAYLIST_COLUMN = 'reviews_playlist_id' as const;

export async function readReviewsPlaylist(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data, error } = await db
    .from('tournaments')
    .select('id, reviews_playlist_id')
    .eq('tenant_id', tenantId)
    .eq('id', tournamentId)
    .maybeSingle();
  return { data, error };
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
    .update({ reviews_playlist_id: playlistId })
    .eq('tenant_id', tenantId)
    .eq('id', tournamentId)
    .select('id')
    .maybeSingle();
}
