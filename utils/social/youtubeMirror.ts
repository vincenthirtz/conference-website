// utils/social/youtubeMirror.ts
//
// Lecture des dernières vidéos d'une chaîne YouTube, pour les recopier dans un
// salon Discord.
//
// PAR LE FLUX RSS, PAS PAR LA DATA API. La Data API v3 exige une clé, impose un
// quota journalier (une recherche coûte 100 des 10 000 unités quotidiennes), et
// demande un projet Google Cloud. Le flux Atom de la chaîne ne demande rien :
// pas de clé, pas de quota, pas de compte. Pour « les dernières vidéos », c'est
// exactement l'outil, et c'est le seul des deux qui reste gratuit sans limite.
//
//   https://www.youtube.com/feeds/videos.xml?channel_id=UC...
//
// L'identifiant de chaîne (UC…) n'est PAS le handle : `@owwomenscup` ne
// fonctionne pas dans cette URL. Il se résout une fois et se range dans
// `site_settings.youtube_channel_id`.
//
// ANALYSE MAISON PLUTÔT QU'UNE DÉPENDANCE XML. Ce flux a une forme fixe, publiée
// par YouTube, et on n'en lit que quatre champs. Ajouter un analyseur XML au
// projet pour ça coûterait plus cher à maintenir que ces trente lignes — mais
// les entités doivent être décodées, sinon un titre contenant « & » ou une
// apostrophe arrive avec son `&amp;` dans Discord.

import { logger } from '@/utils/logger';
import type { MirrorPost } from './feedMirror';

const FEED_BASE = 'https://www.youtube.com/feeds/videos.xml';
const FETCH_TIMEOUT_MS = 15_000;

/** Clé `site_settings` portant l'identifiant de chaîne (UC…). */
export const YOUTUBE_CHANNEL_KEY = 'youtube_channel_id';

/** Décode les entités XML que YouTube échappe dans les titres. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // `&amp;` en DERNIER : le décoder avant transformerait « &amp;lt; » en
    // « < », alors que le texte d'origine disait « &lt; ».
    .replace(/&amp;/g, '&');
}

function tag(block: string, name: string): string | null {
  const m = block.match(
    new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')
  );
  return m ? decodeEntities(m[1].trim()) : null;
}

/**
 * Transforme le flux Atom en publications exploitables.
 *
 * Les entrées sans identifiant ou sans date sont écartées plutôt que devinées :
 * une date absente ferait passer la vidéo pour éternellement nouvelle, et le
 * cron la reposterait tous les quarts d'heure.
 */
export function parseYoutubeFeed(xml: string): MirrorPost[] {
  const out: MirrorPost[] = [];
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];

  for (const entry of entries) {
    const videoId = tag(entry, 'yt:videoId');
    const title = tag(entry, 'title');
    // `published` est la mise en ligne ; `updated` bouge à chaque changement de
    // titre ou de description. Se fier à `updated` republierait une vidéo de
    // l'an dernier parce que quelqu'un a corrigé une faute.
    const published = tag(entry, 'published');
    if (!videoId || !published) continue;

    out.push({
      id: videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      text: title ?? '',
      publishedAt: published,
    });
  }
  return out;
}

export async function fetchChannelVideos(
  channelId: string
): Promise<MirrorPost[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${FEED_BASE}?${new URLSearchParams({ channel_id: channelId })}`,
      { signal: controller.signal }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseYoutubeFeed(await res.text());
  } catch (err) {
    logger.warn(
      '[youtubeMirror] lecture du flux échouée: %s',
      err instanceof Error ? err.message : String(err)
    );
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
