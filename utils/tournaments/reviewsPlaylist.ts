// utils/tournaments/reviewsPlaylist.ts
//
// Lecture SERVEUR de la playlist « Reviews » d'un tournoi
// (`tournaments.reviews_playlist_id`, migration
// database/migrations/tournaments_reviews_playlist.sql).
//
// TOLÉRANTE À L'ABSENCE DE LA COLONNE : tant que la migration n'est pas
// appliquée, la lecture échoue (Postgres 42703) et on rend `null` — l'onglet
// Reviews reste simplement masqué, aucune page tournoi ne casse.
//
// Une lecture À PART plutôt qu'une colonne de plus dans le `select` de chaque
// page : ajoutée là, une colonne inconnue ferait échouer toute la requête du
// tournoi, donc toutes les pages publiques du tournoi.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { isValidPlaylistId } from '@/utils/youtube/playlist';

/** Lue à part : une colonne absente (environnement non migré) ne casse que cette lecture. */
const COLUMN: string = 'reviews_playlist_id';

export function isMissingColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  if (e.code === '42703' || e.code === 'PGRST204') return true;
  const msg = (e.message || '').toLowerCase();
  return (
    msg.includes(COLUMN) ||
    (msg.includes('column') && msg.includes('does not exist'))
  );
}

export async function readReviewsPlaylistId(
  tenantId: string,
  tournamentId: string
): Promise<string | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from('tournaments')
      .select(COLUMN)
      .eq('tenant_id', tenantId)
      .eq('id', tournamentId)
      .maybeSingle();
    if (error) {
      if (!isMissingColumnError(error)) {
        logger.warn('[reviewsPlaylist] lecture échouée: %s', error.message);
      }
      return null;
    }
    const value = (data as Record<string, unknown> | null)?.[COLUMN];
    // Une valeur corrompue en base ne doit pas finir dans une URL.
    return isValidPlaylistId(value) ? value : null;
  } catch (err) {
    if (!isMissingColumnError(err)) {
      logger.warn(
        '[reviewsPlaylist] lecture échouée: %s',
        err instanceof Error ? err.message : String(err)
      );
    }
    return null;
  }
}

/** Raccourci des pages publiques : l'onglet Reviews est-il à afficher ? */
export async function hasReviewsPlaylist(
  tenantId: string,
  tournamentId: string
): Promise<boolean> {
  return (await readReviewsPlaylistId(tenantId, tournamentId)) !== null;
}
