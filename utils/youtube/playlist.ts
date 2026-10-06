// utils/youtube/playlist.ts
//
// Identifiants YouTube d'une playlist « Reviews » de tournoi : extraction depuis
// ce que le staff colle (URL complète, URL courte, ou ID nu) et validation.
//
// Module PUR (aucun accès réseau, aucune dépendance serveur) : partagé par la
// route admin qui enregistre la playlist, la page publique qui l'affiche et la
// façade de lecture côté navigateur.

/**
 * ID de playlist : alphabet base64url, 10 à 64 caractères. Les playlists
 * publiques font d'ordinaire 34 caractères (`PL` + 32), mais les listes
 * spéciales (`UU…`, `FL…`, `OLAK5uy_…`) varient : on borne large plutôt que de
 * refuser une vraie playlist.
 */
export const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{10,64}$/;

/** ID de vidéo : 11 caractères base64url, format stable depuis 2005. */
export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Hôtes YouTube dont on accepte une URL collée. */
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
]);

export function isValidPlaylistId(value: unknown): value is string {
  return typeof value === 'string' && PLAYLIST_ID_RE.test(value);
}

export function isValidVideoId(value: unknown): value is string {
  return typeof value === 'string' && VIDEO_ID_RE.test(value);
}

/**
 * Extrait l'ID de playlist d'une saisie libre.
 *
 *   « https://www.youtube.com/playlist?list=PLxxxx »      → PLxxxx
 *   « https://youtu.be/abcdefghijk?list=PLxxxx »          → PLxxxx
 *   « https://www.youtube.com/watch?v=…&list=PLxxxx »     → PLxxxx
 *   « PLxxxx »                                            → PLxxxx
 *
 * Renvoie `null` si rien de valide n'en sort (URL d'un autre site, URL YouTube
 * sans `list=`, ID au mauvais format). Jamais de « réparation » : un ID tronqué
 * reste refusé s'il passe sous la longueur minimale.
 */
export function extractPlaylistId(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  if (isValidPlaylistId(raw)) return raw;

  let url: URL;
  try {
    // Saisie sans schéma (« youtube.com/playlist?list=… ») : on l'ajoute.
    url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
    );
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;

  const list = url.searchParams.get('list');
  return isValidPlaylistId(list) ? list : null;
}

/** Page YouTube de la playlist (lien « voir sur YouTube »). */
export function playlistPageUrl(playlistId: string): string {
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
}

/** Page YouTube d'une vidéo dans le contexte de la playlist. */
export function videoWatchUrl(videoId: string, playlistId?: string): string {
  const params = new URLSearchParams({ v: videoId });
  if (playlistId) params.set('list', playlistId);
  return `https://www.youtube.com/watch?${params}`;
}

/**
 * Lecteur intégré, domaine « nocookie » : YouTube n'y dépose pas de cookie
 * avant la lecture. N'est de toute façon chargé qu'APRÈS un clic explicite
 * (façade), cf. components/tournament/reviews/ReviewVideoCard.tsx.
 */
export function nocookieEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0`;
}

/** Miniature servie par YouTube pour toute vidéo publique (sans signature). */
export function videoThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}
