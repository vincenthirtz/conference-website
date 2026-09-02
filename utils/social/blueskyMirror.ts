// utils/social/blueskyMirror.ts
//
// Recopie les posts du compte Bluesky de l'association dans un salon Discord.
//
// POURQUOI CÔTÉ SITE ET PAS DANS LE BOT. Un miroir a besoin de mémoire : sans
// elle, chaque redémarrage du bot reposterait tout le fil. Le site a déjà une
// base, une table clé/valeur (`site_settings`) et le tuyau outbox → bot. Le bot
// n'a rien de tout ça — il aurait fallu lui inventer un état persistant pour
// une seule fonctionnalité.
//
// LECTURE SANS AUTHENTIFICATION. `public.api.bsky.app` sert le fil d'un compte
// sans jeton : le miroir fonctionne donc même si les identifiants de
// publication ne sont pas configurés. C'est voulu — voir les posts arriver dans
// Discord n'a pas à dépendre de notre capacité à en écrire.
//
// LE CURSEUR EST UNE DATE, PAS UN COMPTEUR. On retient l'horodatage du dernier
// post recopié et on ne prend que ce qui est strictement postérieur. Un `uri`
// unique ne suffirait pas : si trois posts arrivent entre deux passages, il
// faut tous les prendre, dans l'ordre.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

const PUBLIC_API = 'https://public.api.bsky.app/xrpc';
const FETCH_TIMEOUT_MS = 15_000;

/** Clés `site_settings` du miroir. */
export const MIRROR_CURSOR_KEY = 'bluesky_mirror_last_post_at';
export const MIRROR_CHANNEL_KEY = 'bluesky_mirror_channel_id';

/**
 * Au tout premier passage, il n'y a pas de curseur. On ne recopie alors QUE les
 * posts récents : sans cette borne, l'activation du miroir déverserait tout
 * l'historique du compte dans le salon d'un coup.
 */
const FIRST_RUN_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Filet de sécurité : un passage ne poste jamais plus que ça. */
export const MAX_PER_RUN = 5;

export type MirrorPost = {
  uri: string;
  /** Lien web lisible, celui qu'on met dans Discord. */
  url: string;
  text: string;
  createdAt: string;
  imageUrl: string | null;
};

/* -------------------------------------------------------------------------- */
/* Lecture du fil                                                              */
/* -------------------------------------------------------------------------- */

/** `at://did:plc:xxx/app.bsky.feed.post/3kabc` → lien bsky.app. */
export function postUrl(uri: string, handle: string): string {
  const rkey = uri.split('/').pop() ?? '';
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

type FeedItem = {
  post?: {
    uri?: string;
    author?: { handle?: string };
    record?: { text?: string; createdAt?: string; reply?: unknown };
    embed?: { images?: Array<{ fullsize?: string; thumb?: string }> };
    reason?: unknown;
  };
  reason?: unknown;
};

/**
 * Convertit la réponse de l'API en posts exploitables.
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
    const image =
      post.embed?.images?.[0]?.fullsize ??
      post.embed?.images?.[0]?.thumb ??
      null;

    out.push({
      uri: post.uri,
      url: postUrl(post.uri, handle),
      text: post.record.text ?? '',
      createdAt,
      imageUrl: image,
    });
  }
  return out;
}

/** Les posts strictement postérieurs au curseur, du plus ancien au plus récent. */
export function selectNew(
  posts: MirrorPost[],
  since: Date,
  max = MAX_PER_RUN
): MirrorPost[] {
  return posts
    .filter((p) => {
      const at = new Date(p.createdAt).getTime();
      return Number.isFinite(at) && at > since.getTime();
    })
    // L'API rend le plus récent en premier ; un salon se lit dans l'autre sens.
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
    .slice(-max);
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

/* -------------------------------------------------------------------------- */
/* Curseur                                                                     */
/* -------------------------------------------------------------------------- */

async function readSetting(
  tenantId: string,
  key: string
): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('site_settings')
    .select('value')
    .eq('tenant_id', tenantId)
    .eq('key', key)
    .maybeSingle();
  if (error) {
    logger.warn('[blueskyMirror] lecture %s impossible: %s', key, error.message);
    return null;
  }
  return (data as { value?: string } | null)?.value ?? null;
}

export async function readCursor(tenantId: string): Promise<Date> {
  const raw = await readSetting(tenantId, MIRROR_CURSOR_KEY);
  const parsed = raw ? new Date(raw) : null;
  if (parsed && Number.isFinite(parsed.getTime())) return parsed;
  return new Date(Date.now() - FIRST_RUN_WINDOW_MS);
}

export async function readChannelId(tenantId: string): Promise<string | null> {
  return readSetting(tenantId, MIRROR_CHANNEL_KEY);
}

export async function writeCursor(
  tenantId: string,
  at: string
): Promise<void> {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin.from('site_settings').upsert(
    {
      tenant_id: tenantId,
      key: MIRROR_CURSOR_KEY,
      value: at,
      description:
        'Horodatage du dernier post Bluesky recopié dans Discord. Reculer cette valeur rejoue les posts postérieurs.',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,key' }
  );
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/* Mise en forme                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Le message posté dans Discord.
 *
 * On met le LIEN en dernier et sur sa propre ligne : Discord en tire un aperçu
 * (titre, extrait, image) sous le message, et l'aperçu fait le travail de mise
 * en valeur. Recopier l'image nous-mêmes ferait doublon avec cet aperçu.
 */
export function buildMirrorMessage(post: MirrorPost): string {
  const text = post.text.trim();
  return text ? `${text}\n\n${post.url}` : post.url;
}
