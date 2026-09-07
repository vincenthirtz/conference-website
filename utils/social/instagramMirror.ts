// utils/social/instagramMirror.ts
//
// Lecture de nos publications Instagram, pour les recopier dans un salon
// Discord. Le curseur, la sélection et la mise en forme sont communs aux
// sources et vivent dans `./feedMirror.ts` ; ici, uniquement la lecture.
//
// AVEC AUTHENTIFICATION, contrairement à Bluesky et YouTube. Instagram ne sert
// aucun flux public : ni RSS, ni endpoint anonyme. La seule lecture supportée
// passe par le jeton du compte connecté — celui-là même qui sert à publier
// (`./instagram.ts`), et dont le scope `instagram_business_basic` couvre déjà
// `/me/media`. Rien de plus à autoriser, donc, mais une conséquence :
// le miroir Instagram s'éteint quand la connexion expire (~60 jours), alors
// que les deux autres continuent. C'est le cron de rafraîchissement qui tient
// cette promesse, pas ce module.
//
// LE `permalink` VIENT D'INSTAGRAM, on ne le fabrique pas. Une URL de post se
// devine mal (`/p/`, `/reel/`, `/tv/` selon le format) et se tromperait sur les
// Reels — qui sont la moitié de ce qu'on publie.

import { logger } from '@/utils/logger';
import type { MirrorPost } from './feedMirror';
import { loadAccount } from './instagram';

const GRAPH_BASE = 'https://graph.instagram.com';
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Une légende Instagram monte à 2 200 caractères, un message Discord s'arrête
 * à 2 000. Sans coupe ICI, le handler du bot tronquerait le message par la
 * fin — c'est-à-dire en emportant le lien, qui est la seule chose que le
 * message doit absolument contenir.
 */
export const MAX_CAPTION = 700;

/**
 * Les champs qu'on lit, et rien d'autre.
 *
 * `media_type` n'est pas décoratif : sur une VIDEO ou un REELS, `media_url`
 * est le fichier vidéo — l'afficher dans une balise image donnerait un cadre
 * vide. C'est `thumbnail_url` qui porte l'image, et il n'existe QUE sur les
 * vidéos.
 */
const MEDIA_FIELDS =
  'id,caption,permalink,timestamp,media_type,media_url,thumbnail_url';

/**
 * `2026-09-07T12:34:56+0000` → `2026-09-07T12:34:56+00:00`.
 *
 * Instagram rend un décalage sans deux-points, forme que la norme ISO 8601
 * accepte mais que `new Date()` n'a jamais été tenue de comprendre. V8 s'en
 * sort aujourd'hui ; s'en remettre à ça ferait dépendre le miroir d'un détail
 * d'implémentation, et le symptôme d'une régression serait un miroir
 * silencieux (date illisible = publication écartée par `selectNew`).
 */
export function normalizeTimestamp(raw: string): string {
  return raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
}

/** Coupe une légende trop longue sur une frontière de mot quand c'est possible. */
export function truncateCaption(caption: string, max = MAX_CAPTION): string {
  const text = caption.trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  // Une coupe au milieu d'un mot se voit ; on ne recule que si le dernier
  // espace est proche de la fin, sinon on perdrait un paragraphe entier.
  const head = lastSpace > max * 0.8 ? cut.slice(0, lastSpace) : cut;
  return `${head.trimEnd()}…`;
}

type MediaItem = {
  id?: string;
  caption?: string | null;
  permalink?: string;
  timestamp?: string;
  media_type?: string;
  media_url?: string | null;
  thumbnail_url?: string | null;
};

/**
 * L'image représentative d'une publication.
 *
 * Ces URLs sont SIGNÉES et expirent : elles servent à faire une copie chez
 * nous tout de suite, pas à être stockées.
 */
function mediaThumbnail(item: MediaItem): string | null {
  if (item.thumbnail_url) return item.thumbnail_url;
  // Un CAROUSEL_ALBUM expose le média de sa première image dans `media_url` :
  // c'est bien une image, on la prend.
  if (item.media_type === 'VIDEO' || item.media_type === 'REELS') return null;
  return item.media_url || null;
}

/**
 * Transforme la réponse Graph en publications exploitables.
 *
 * Une entrée sans permalien ou sans date est écartée plutôt que devinée : sans
 * date, la publication paraîtrait éternellement nouvelle et le cron la
 * reposterait tous les quarts d'heure.
 */
export function parseMedia(raw: unknown): MirrorPost[] {
  const items = (raw as { data?: MediaItem[] })?.data;
  if (!Array.isArray(items)) return [];

  const out: MirrorPost[] = [];
  for (const item of items) {
    if (!item?.permalink || !item.timestamp) continue;
    out.push({
      id: item.id ? String(item.id) : item.permalink,
      url: item.permalink,
      // Une publication sans légende existe (une image seule) : elle se réduit
      // alors à son lien, comme chez les autres sources.
      text: item.caption ? truncateCaption(String(item.caption)) : '',
      publishedAt: normalizeTimestamp(String(item.timestamp)),
      thumbnailUrl: mediaThumbnail(item),
    });
  }
  return out;
}

/**
 * Les dernières publications du compte connecté.
 *
 * Renvoie `null` — et non une liste vide — quand aucun compte n'est connecté :
 * « pas branché » et « rien de neuf » ne se soignent pas pareil, et le rapport
 * du cron doit pouvoir les distinguer.
 */
export async function fetchOwnMedia(
  tenantId: string
): Promise<MirrorPost[] | null> {
  const account = await loadAccount(tenantId, 'instagram');
  if (!account?.accessToken) return null;

  // L'identifiant explicite quand on l'a : le `me` implicite désigne ce que le
  // jeton désigne, ce qui n'est pas la même chose selon le parcours de
  // connexion (cf. l'en-tête de `./instagram.ts`).
  const target = account.externalAccountId || 'me';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${target}/media?${new URLSearchParams({
        fields: MEDIA_FIELDS,
        limit: '20',
        access_token: account.accessToken,
      }).toString()}`,
      { signal: controller.signal }
    );
    if (!res.ok) {
      // Le corps porte le motif Meta (jeton expiré, scope retiré) ; le code
      // HTTP seul ne le dit pas.
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${body.slice(0, 200)}`);
    }
    return parseMedia(await res.json());
  } catch (err) {
    logger.warn(
      '[instagramMirror] lecture des médias échouée: %s',
      err instanceof Error ? err.message : String(err)
    );
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
