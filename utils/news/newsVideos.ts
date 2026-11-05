// utils/news/newsVideos.ts
//
// Les vidéos YouTube citées dans une actualité, lues dans son texte.
//
// Le rendu Markdown (renderNewsMarkdown) n'intègre rien, faute de HTML brut :
// un lien YouTube y reste un lien. Les actus relayées depuis Discord annoncent
// pourtant souvent une vidéo (« Revoir le scrim en vidéo : https://… »), que
// personne ne voyait sans quitter le site. La page d'article pose donc un
// lecteur sous le texte pour chacune (components/News/ArticleVideo.tsx).
//
// PUR (ni React ni réseau) : tests/unit/newsVideos.test.ts.

import { parseEmbedUrl } from '@/utils/markdown/teamPublicMarkdown';
import { isValidVideoId } from '@/utils/youtube/playlist';

/** Au-delà, la page deviendrait un mur de lecteurs : les suivantes restent des liens. */
export const MAX_NEWS_VIDEOS = 3;

/** Une URL dans du texte ou du Markdown (`[texte](url)` : la parenthèse la termine). */
const URL_RE = /https?:\/\/[^\s<>()[\]"']+/g;

/** Ponctuation de fin de phrase collée à l'URL (« … : https://youtu.be/ID. »). */
const TRAILING_PUNCTUATION_RE = /[.,;:!?]+$/;

/** Identifiants des vidéos YouTube du texte, dans l'ordre, sans doublon. */
export function extractNewsVideoIds(
  content: string | null | undefined
): string[] {
  if (!content) return [];
  const ids: string[] = [];
  for (const raw of content.match(URL_RE) ?? []) {
    const embed = parseEmbedUrl(raw.replace(TRAILING_PUNCTUATION_RE, ''));
    if (embed?.provider !== 'youtube' || !isValidVideoId(embed.id)) continue;
    if (!ids.includes(embed.id)) ids.push(embed.id);
    if (ids.length === MAX_NEWS_VIDEOS) break;
  }
  return ids;
}
