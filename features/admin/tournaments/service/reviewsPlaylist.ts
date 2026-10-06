// features/admin/tournaments/service/reviewsPlaylist.ts — playlist YouTube
// « Reviews » d'un tournoi (onglet public /tournament/[id]/reviews).
//
// Le staff colle une URL de playlist OU un ID ; on en extrait l'ID et on le
// valide (utils/youtube/playlist.ts) avant toute écriture. Une saisie vide
// retire la playlist (onglet masqué).
//
// Migration absente (colonne inconnue) : la lecture répond `migrated: false`
// et l'écriture un 503 explicite — même posture que les réglages de check-in.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { isMissingColumnError } from '@/utils/tournaments/reviewsPlaylist';
import {
  extractPlaylistId,
  isValidPlaylistId,
  playlistPageUrl,
} from '@/utils/youtube/playlist';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/reviewsPlaylist';
import { fail } from './common';

export type ReviewsPlaylistView = {
  playlistId: string | null;
  playlistUrl: string | null;
  migrated: boolean;
};

function view(playlistId: string | null, migrated = true): ReviewsPlaylistView {
  return {
    playlistId,
    playlistUrl: playlistId ? playlistPageUrl(playlistId) : null,
    migrated,
  };
}

export async function getReviewsPlaylist(
  ctx: ServiceContext,
  tournamentId: string
): Promise<ReviewsPlaylistView> {
  const { data, error } = await repo.readReviewsPlaylist(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (error) {
    if (isMissingColumnError(error)) return view(null, false);
    ctx.logger.error('[reviews-playlist] GET error:', error);
    fail(500, 'Internal server error');
  }
  if (!data) fail(404, 'Tournament not found');
  const raw = data[repo.REVIEWS_PLAYLIST_COLUMN];
  return view(isValidPlaylistId(raw) ? raw : null);
}

/**
 * Normalise la saisie. `null` = retrait ; chaîne = ID valide ; `undefined` =
 * saisie refusée (URL d'un autre site, URL sans `list=`, ID mal formé).
 */
export function normalizePlaylistInput(
  raw: unknown
): string | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== 'string') return undefined;
  if (raw.trim() === '') return null;
  return extractPlaylistId(raw) ?? undefined;
}

export async function updateReviewsPlaylist(
  ctx: ServiceContext,
  tournamentId: string,
  body: Record<string, unknown>
) {
  const playlistId = normalizePlaylistInput(body.playlist);
  if (playlistId === undefined) {
    fail(
      400,
      'Playlist invalide : collez l’URL d’une playlist YouTube (…/playlist?list=…) ou son identifiant.'
    );
  }

  const { data, error } = await repo.writeReviewsPlaylist(
    ctx.db,
    ctx.tenantId,
    tournamentId,
    playlistId
  );
  if (error) {
    if (isMissingColumnError(error)) {
      fail(
        503,
        'Réglage indisponible : la migration tournaments_reviews_playlist n’a pas encore été appliquée.'
      );
    }
    ctx.logger.error('[reviews-playlist] PATCH error:', error);
    fail(500, 'Internal server error');
  }
  if (!data) fail(404, 'Tournament not found');

  return {
    result: { success: true, ...view(playlistId) },
    audit: {
      entity_type: 'tournament',
      entity_id: tournamentId,
      tournament_id: tournamentId,
      payload: {
        kind: 'reviews_playlist_update',
        reviews_playlist_id: playlistId,
      },
    },
  } satisfies Audited<unknown>;
}
