// utils/youtube/playlistFeed.ts
//
// Vidéos d'une playlist YouTube, pour l'onglet « Reviews » d'un tournoi.
//
// PAR LE FLUX RSS, PAS PAR LA DATA API — même choix que le miroir de chaîne
// (utils/social/youtubeMirror.ts, dont on réutilise l'analyseur) : le repo n'a
// pas de clé YouTube Data API, et le flux Atom public ne demande ni clé, ni
// quota, ni projet Google Cloud.
//
//   https://www.youtube.com/feeds/videos.xml?playlist_id=PL…
//
// Limite connue : le flux ne rend que les 15 PREMIÈRES vidéos de la playlist.
// La page publique propose donc toujours un lien vers la playlist complète.
//
// Appelé UNIQUEMENT côté serveur (getStaticProps, ISR) : le navigateur de la
// visiteuse ne contacte jamais youtube.com pour lister les vidéos.

import { logger } from '@/utils/logger';
import { parseYoutubeFeed } from '@/utils/social/youtubeMirror';
import {
  isValidPlaylistId,
  isValidVideoId,
  videoThumbnailUrl,
} from './playlist';

const FEED_BASE = 'https://www.youtube.com/feeds/videos.xml';
const FETCH_TIMEOUT_MS = 8_000;

/**
 * Cache ISR de la page Reviews : une heure quand la lecture a réussi (une
 * playlist bouge peu ; le flux lui-même est mis en cache par YouTube), cinq
 * minutes après un échec pour ne pas figer une erreur passagère une heure.
 */
export const REVIEWS_REVALIDATE_OK_S = 3600;
export const REVIEWS_REVALIDATE_FAILURE_S = 300;

export function reviewsRevalidateSeconds(
  status: PlaylistFeedResult['status']
): number {
  return status === 'ok'
    ? REVIEWS_REVALIDATE_OK_S
    : REVIEWS_REVALIDATE_FAILURE_S;
}

export type ReviewVideo = {
  id: string;
  title: string;
  thumbnailUrl: string;
  /** ISO 8601 (mise en ligne). */
  publishedAt: string;
};

export type PlaylistFeedResult =
  | { status: 'ok'; videos: ReviewVideo[] }
  /** Playlist privée, supprimée ou ID erroné : YouTube répond 404. */
  | { status: 'not_found' }
  /** Réseau, délai, 5xx, flux illisible. */
  | { status: 'error' };

/**
 * Normalise le flux en vidéos affichables. Les entrées dont l'ID de vidéo ne
 * respecte pas le format sont écartées : il finit dans une URL d'iframe.
 */
export function parsePlaylistFeed(xml: string): ReviewVideo[] {
  return parseYoutubeFeed(xml)
    .filter((p) => isValidVideoId(p.id))
    .map((p) => ({
      id: p.id,
      title: (p.title ?? p.text ?? '').trim(),
      thumbnailUrl: videoThumbnailUrl(p.id),
      publishedAt: p.publishedAt,
    }));
}

export async function fetchPlaylistVideos(
  playlistId: string,
  fetchImpl: typeof fetch = fetch
): Promise<PlaylistFeedResult> {
  if (!isValidPlaylistId(playlistId)) return { status: 'not_found' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(
      `${FEED_BASE}?${new URLSearchParams({ playlist_id: playlistId })}`,
      { signal: controller.signal }
    );
    if (res.status === 404) return { status: 'not_found' };
    if (!res.ok) {
      logger.warn('[playlistFeed] HTTP %s pour %s', res.status, playlistId);
      return { status: 'error' };
    }
    const xml = await res.text();
    // Un 200 sans <feed> (page de consentement, HTML d'erreur) n'est pas une
    // playlist vide : c'est une lecture ratée.
    if (!/<feed[\s>]/i.test(xml)) return { status: 'error' };
    return { status: 'ok', videos: parsePlaylistFeed(xml) };
  } catch (err) {
    logger.warn(
      '[playlistFeed] lecture échouée: %s',
      err instanceof Error ? err.message : String(err)
    );
    return { status: 'error' };
  } finally {
    clearTimeout(timer);
  }
}
