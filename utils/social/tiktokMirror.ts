// utils/social/tiktokMirror.ts
//
// Lecture de nos dernières vidéos TikTok, pour les recopier dans un salon
// Discord. Le curseur, la sélection et la mise en forme sont communs aux
// sources et vivent dans `./feedMirror.ts` ; ici, uniquement la lecture.
//
// AVEC AUTHENTIFICATION, comme Instagram et pour la même raison : TikTok
// n'expose aucun flux public. Tout l'OAuth est dans `./tiktok.ts` ; ce module
// ne fait qu'appeler `/v2/video/list/` avec un jeton frais.
//
// LE `share_url` VIENT DE TIKTOK, on ne le fabrique pas. Une URL de vidéo
// s'écrit `https://www.tiktok.com/@compte/video/<id>` — devinable, mais elle
// dépend du handle, que nos scopes ne nous donnent PAS (`username` demanderait
// `user.info.profile`). Le champ officiel évite ce détour.
//
// LE TITRE PLUTÔT QUE LA DESCRIPTION quand les deux existent : sur TikTok, la
// description est la légende affichée sous la vidéo (celle qui porte les
// hashtags) et le titre est souvent vide. On prend donc la description en
// premier — c'est ce qu'un humain reconnaît — et le titre en secours.

import { logger } from '@/utils/logger';
import type { MirrorPost } from './feedMirror';
import {
  API_BASE,
  ensureAccessToken,
  hasTiktokError,
  tiktokError,
} from './tiktok';

const FETCH_TIMEOUT_MS = 15_000;

/**
 * Champs demandés. `create_time` et `share_url` sont indispensables.
 *
 * `cover_image_url` a une durée de vie de SIX HEURES (TikTok le documente) :
 * elle sert à faire une copie chez nous au moment où on la lit, jamais à être
 * stockée telle quelle. Cf. `./socialFeed.ts`.
 */
const VIDEO_FIELDS =
  'id,title,video_description,create_time,share_url,cover_image_url';

/** Maximum accepté par l'API (défaut : 10). */
const MAX_COUNT = 20;

/**
 * Une description TikTok monte à 150 caractères — largement sous la limite
 * Discord. La borne est là par principe, pas par nécessité : si TikTok
 * l'allonge un jour, le message ne se fera pas tronquer par la fin, donc sur
 * son lien.
 */
export const MAX_TEXT = 700;

type VideoItem = {
  id?: string | number;
  title?: string | null;
  video_description?: string | null;
  create_time?: number | string;
  share_url?: string;
  cover_image_url?: string | null;
};

/**
 * `create_time` est un epoch UNIX EN SECONDES.
 *
 * Le lire en millisecondes daterait chaque vidéo de janvier 1970 : elles
 * seraient toutes antérieures au curseur, et le miroir resterait muet sans la
 * moindre erreur. C'est le genre de panne qu'on ne trouve qu'en la cherchant.
 */
export function timestampFromCreateTime(value: unknown): string | null {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

/**
 * Transforme la réponse `/v2/video/list/` en publications exploitables.
 *
 * Une entrée sans lien ou sans date est écartée plutôt que devinée : sans date,
 * la vidéo paraîtrait éternellement nouvelle et le cron la reposterait tous les
 * quarts d'heure.
 */
export function parseVideos(raw: unknown): MirrorPost[] {
  const videos = (raw as { data?: { videos?: VideoItem[] } })?.data?.videos;
  if (!Array.isArray(videos)) return [];

  const out: MirrorPost[] = [];
  for (const video of videos) {
    if (!video?.share_url) continue;
    const publishedAt = timestampFromCreateTime(video.create_time);
    if (!publishedAt) continue;

    const caption = (video.video_description || video.title || '').trim();
    out.push({
      id: video.id ? String(video.id) : video.share_url,
      url: video.share_url,
      text:
        caption.length > MAX_TEXT
          ? `${caption.slice(0, MAX_TEXT - 1)}…`
          : caption,
      publishedAt,
      thumbnailUrl: video.cover_image_url || null,
    });
  }
  return out;
}

/**
 * Les dernières vidéos du compte connecté.
 *
 * Renvoie `null` — et non une liste vide — quand aucun compte n'est connecté :
 * « pas branché » et « rien de neuf » ne se soignent pas pareil, et le rapport
 * du cron doit pouvoir les distinguer.
 */
export async function fetchOwnVideos(
  tenantId: string
): Promise<MirrorPost[] | null> {
  const auth = await ensureAccessToken(tenantId);
  if (!auth) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${API_BASE}/video/list/?${new URLSearchParams({
        fields: VIDEO_FIELDS,
      }).toString()}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ max_count: MAX_COUNT }),
        signal: controller.signal,
      }
    );
    const body = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    // Statut 200 ne veut pas dire succès chez TikTok : le verdict est dans
    // `error.code` (cf. `./tiktok.ts`).
    if (!res.ok || hasTiktokError(body)) {
      throw new Error(tiktokError(body));
    }
    return parseVideos(body);
  } catch (err) {
    logger.warn(
      '[tiktokMirror] lecture des vidéos échouée: %s',
      err instanceof Error ? err.message : String(err)
    );
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
