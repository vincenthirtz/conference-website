// utils/social/blueskyMirror.ts
//
// Lecture du fil Bluesky de l'association, pour le recopier dans un salon
// Discord. Le curseur, la sélection et la mise en forme sont communs aux
// sources et vivent dans `./feedMirror.ts` ; ici, uniquement la lecture.
//
// SANS AUTHENTIFICATION. `public.api.bsky.app` sert le fil d'un compte sans
// jeton : le miroir fonctionne donc même si les identifiants de publication ne
// sont pas configurés. C'est voulu — voir les posts arriver dans Discord n'a
// pas à dépendre de notre capacité à en écrire.

import type { MirrorPost } from './feedMirror';

const PUBLIC_API = 'https://public.api.bsky.app/xrpc';
const FETCH_TIMEOUT_MS = 15_000;

/** `at://did:plc:xxx/app.bsky.feed.post/3kabc` → lien bsky.app. */
export function postUrl(uri: string, handle: string): string {
  const rkey = uri.split('/').pop() ?? '';
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

type EmbedView = {
  $type?: string;
  images?: Array<{ thumb?: string }>;
  thumbnail?: string;
  external?: { thumb?: string };
  media?: EmbedView;
};

type FeedItem = {
  post?: {
    uri?: string;
    author?: { handle?: string };
    record?: { text?: string; createdAt?: string; reply?: unknown };
    embed?: EmbedView;
  };
  reason?: unknown;
};

/**
 * La vignette d'un post, quel que soit le type d'embed.
 *
 * Bluesky en a quatre formes et rien n'oblige à les traiter toutes — mais un
 * post de l'association sans image est l'exception, pas la règle, et les
 * quatre cas tiennent en huit lignes. `recordWithMedia` (une citation AVEC une
 * image) est récursif : l'image est sous `media`, pas à la racine.
 */
export function embedThumbnail(embed: EmbedView | undefined): string | null {
  if (!embed) return null;
  const fromImages = embed.images?.[0]?.thumb;
  if (fromImages) return fromImages;
  if (embed.thumbnail) return embed.thumbnail; // video#view
  if (embed.external?.thumb) return embed.external.thumb;
  return embedThumbnail(embed.media);
}

/**
 * Convertit la réponse de l'API en publications exploitables.
 *
 * On écarte les reposts (`reason` présent) : recopier ce que le compte
 * repartage remplirait le salon de contenus qui ne sont pas de nous. Les
 * réponses sont déjà écartées par `filter=posts_no_replies` côté API, et
 * re-vérifiées ici — un changement d'API ne doit pas ouvrir la vanne.
 */
export function parseFeed(raw: unknown, fallbackHandle: string): MirrorPost[] {
  const feed = (raw as { feed?: FeedItem[] })?.feed;
  if (!Array.isArray(feed)) return [];

  const out: MirrorPost[] = [];
  for (const item of feed) {
    if (item.reason) continue; // repost
    const post = item.post;
    if (!post?.uri || !post.record) continue;
    if (post.record.reply) continue;

    const createdAt = post.record.createdAt;
    if (!createdAt) continue;

    const handle = post.author?.handle || fallbackHandle;
    out.push({
      id: post.uri,
      url: postUrl(post.uri, handle),
      text: post.record.text ?? '',
      publishedAt: createdAt,
      thumbnailUrl: embedThumbnail(post.embed),
    });
  }
  return out;
}

export async function fetchAuthorFeed(handle: string): Promise<MirrorPost[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url =
      `${PUBLIC_API}/app.bsky.feed.getAuthorFeed?` +
      new URLSearchParams({
        actor: handle,
        limit: '20',
        filter: 'posts_no_replies',
      }).toString();
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseFeed(await res.json(), handle);
  } finally {
    clearTimeout(timer);
  }
}
