// utils/social/bluesky.ts
//
// Publication sur Bluesky (AT Protocol).
//
// LE PLUS SIMPLE DES QUATRE, et de loin : aucun palier payant, aucun coût par
// appel, aucune validation, aucun portail développeur. On crée une session avec
// un mot de passe d'application et on écrit un enregistrement. Pas d'OAuth, pas
// de jeton de 60 jours à rafraîchir par cron.
//
// Deux subtilités qui ne se devinent pas :
//
//   1. LES FACETS. Bluesky ne rend AUCUN Markdown et ne détecte pas les liens
//      tout seul : un `https://…` posté tel quel reste du texte mort. Il faut
//      déclarer chaque lien dans `facets`, avec des positions exprimées en
//      OCTETS UTF-8 — pas en caractères JavaScript. Un accent avant l'URL
//      décale donc l'index, et un lien mal indexé souligne le mauvais bout de
//      phrase. D'où `utf8Slice` plus bas.
//
//   2. LA LIMITE EST EN GRAPHÈMES. 300 « caractères » au sens de Bluesky, ce
//      qui n'est ni la longueur JS (les emoji comptent double) ni les octets.
//
// Identifiants (chiffrés dans `integration_secrets`) :
//   bluesky_handle       — womenscup.bsky.social
//   bluesky_app_password — mot de passe d'application, PAS celui du compte
//                          (Réglages › Confidentialité › Mots de passe d'app)

import { logger } from '@/utils/logger';

const SERVICE = 'https://bsky.social';
const FETCH_TIMEOUT_MS = 15_000;

/** Limite officielle, en graphèmes. */
export const BLUESKY_MAX_GRAPHEMES = 300;

/* -------------------------------------------------------------------------- */
/* Longueur et facets — purs, testables                                        */
/* -------------------------------------------------------------------------- */

/**
 * Longueur telle que Bluesky la compte : en graphèmes.
 *
 * `"👩‍💻".length` vaut 5 en JavaScript et 1 pour un humain comme pour Bluesky.
 * Compter en `.length` refuserait des posts parfaitement valides.
 */
export function graphemeLength(text: string): number {
  // Intl.Segmenter est disponible partout où tourne ce code (Node 18+, navigateurs
  // modernes) ; le repli couvre le cas improbable où il manquerait.
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter('fr', { granularity: 'grapheme' });
    let n = 0;
    for (const _ of seg.segment(text)) n += 1;
    return n;
  }
  return Array.from(text).length;
}

/**
 * Une facet enrichit une TRANCHE d'octets du texte. Deux familles ici : le lien
 * (`#link`, qui porte une `uri`) et le hashtag (`#tag`, qui porte un `tag` sans
 * croisillon). Le champ utile dépend donc du `$type`.
 */
export type FacetFeature =
  | { $type: 'app.bsky.richtext.facet#link'; uri: string }
  | { $type: 'app.bsky.richtext.facet#tag'; tag: string };

export type Facet = {
  index: { byteStart: number; byteEnd: number };
  features: FacetFeature[];
};

const encoder = new TextEncoder();

/**
 * Détecte les URLs et produit les `facets` qui les rendent cliquables.
 *
 * Les positions sont en OCTETS UTF-8 : c'est ce qu'exige le protocole, et c'est
 * l'erreur classique — avec des index JavaScript, tout texte accentué avant un
 * lien décale le soulignement.
 */
export function detectLinkFacets(text: string): Facet[] {
  const facets: Facet[] = [];
  // On s'arrête avant la ponctuation finale : « voir owwomenscup.fr. » ne doit
  // pas embarquer le point dans l'URL.
  const pattern = /https?:\/\/[^\s]+/g;

  for (const match of text.matchAll(pattern)) {
    let uri = match[0];
    const trailing = uri.match(/[.,;:!?)\]]+$/);
    if (trailing) uri = uri.slice(0, -trailing[0].length);
    if (!uri) continue;

    const byteStart = encoder.encode(text.slice(0, match.index)).length;
    const byteEnd = byteStart + encoder.encode(uri).length;

    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri }],
    });
  }
  return facets;
}

/**
 * Les hashtags du texte, en facets `#tag`.
 *
 * Sur Bluesky, un `#tag` écrit dans le corps n'est QU'UN TEXTE : il n'est ni
 * cliquable ni indexé tant qu'aucune facet ne le déclare. Poster des hashtags
 * sans cette étape, c'est ajouter des caractères qui ne rapportent aucune
 * portée — exactement ce que les tags sont censés apporter.
 *
 * Les décalages sont en OCTETS UTF-8, comme pour les liens : un accent ou un
 * emoji dans le texte qui précède déplace le tag, et un décalage en unités
 * JavaScript surlignerait à côté.
 */
export function detectTagFacets(text: string): Facet[] {
  const facets: Facet[] = [];
  // Un tag commence en début de texte ou après une espace : `C#` dans une
  // phrase n'est pas un tag, et `#` seul non plus.
  const pattern = /(^|\s)(#[\p{L}\p{N}_]{2,60})(?![\p{L}\p{N}_])/gu;

  for (const match of text.matchAll(pattern)) {
    const lead = match[1] ?? '';
    const tag = match[2];
    const start = (match.index ?? 0) + lead.length;
    const byteStart = encoder.encode(text.slice(0, start)).length;
    const byteEnd = byteStart + encoder.encode(tag).length;
    facets.push({
      index: { byteStart, byteEnd },
      // La valeur est déclarée SANS le croisillon : c'est le contrat du lexique.
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: tag.slice(1) }],
    });
  }
  return facets;
}

/* -------------------------------------------------------------------------- */
/* Appels réseau                                                               */
/* -------------------------------------------------------------------------- */

async function call(
  path: string,
  init: RequestInit
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${SERVICE}/xrpc/${path}`, {
      ...init,
      signal: controller.signal,
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      body = { raw: text };
    }
    if (!res.ok) {
      const message =
        (typeof body.message === 'string' && body.message) ||
        (typeof body.error === 'string' && body.error) ||
        `HTTP ${res.status}`;
      throw new Error(message);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export type BlueskySession = { did: string; accessJwt: string };

/**
 * Ouvre une session. Les sessions Bluesky sont bon marché et courtes : on en
 * crée une par publication plutôt que d'en persister une — pas de jeton à
 * stocker, donc pas de jeton à faire expirer en silence.
 */
export async function createSession(
  identifier: string,
  appPassword: string
): Promise<BlueskySession> {
  const body = await call('com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password: appPassword }),
  });
  const did = String(body.did ?? '');
  const accessJwt = String(body.accessJwt ?? '');
  if (!did || !accessJwt) throw new Error('Session sans identifiant ni jeton.');
  return { did, accessJwt };
}

/** Téléverse une image et renvoie le blob à référencer dans le post. */
async function uploadImage(
  session: BlueskySession,
  imageUrl: string
): Promise<{ blob: unknown; mimeType: string } | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`image inaccessible (HTTP ${res.status})`);
    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    const bytes = new Uint8Array(await res.arrayBuffer());

    // Bluesky plafonne à 1 Mo par image. Au-delà, on publie SANS visuel plutôt
    // que d'échouer : le texte porte l'information, l'image l'illustre.
    if (bytes.byteLength > 1_000_000) {
      logger.warn(
        '[bluesky] image de %d octets ignorée (limite 1 Mo)',
        bytes.byteLength
      );
      return null;
    }

    const body = await call('com.atproto.repo.uploadBlob', {
      method: 'POST',
      headers: {
        'Content-Type': mimeType,
        Authorization: `Bearer ${session.accessJwt}`,
      },
      body: bytes,
    });
    return { blob: body.blob, mimeType };
  } catch (err) {
    logger.warn(
      '[bluesky] upload image échoué, publication sans visuel : %s',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

export type BlueskyPostResult = { uri: string; permalink: string | null };

/** Publie un post. L'image est facultative — Bluesky accepte le texte seul. */
export async function publishPost(params: {
  handle: string;
  appPassword: string;
  text: string;
  imageUrl?: string | null;
  altText?: string;
}): Promise<BlueskyPostResult> {
  const session = await createSession(params.handle, params.appPassword);

  const record: Record<string, unknown> = {
    $type: 'app.bsky.feed.post',
    text: params.text,
    createdAt: new Date().toISOString(),
    langs: ['fr'],
  };

  // Liens ET hashtags : deux familles de facets sur le même texte. Elles ne
  // se chevauchent pas (un tag ne vit pas dans une URL), l'ordre est libre.
  const facets = [
    ...detectLinkFacets(params.text),
    ...detectTagFacets(params.text),
  ];
  if (facets.length > 0) record.facets = facets;

  if (params.imageUrl) {
    const uploaded = await uploadImage(session, params.imageUrl);
    if (uploaded) {
      record.embed = {
        $type: 'app.bsky.embed.images',
        images: [
          {
            image: uploaded.blob,
            // Le texte alternatif est obligatoire côté accessibilité Bluesky :
            // un alt vide passe, mais prive les lecteurs d'écran.
            alt: params.altText || params.text.slice(0, 300),
          },
        ],
      };
    }
  }

  const body = await call('com.atproto.repo.createRecord', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({
      repo: session.did,
      collection: 'app.bsky.feed.post',
      record,
    }),
  });

  const uri = String(body.uri ?? '');
  // `at://did:plc:xxx/app.bsky.feed.post/3kabc` → lien web lisible.
  const rkey = uri.split('/').pop();
  const permalink = rkey
    ? `https://bsky.app/profile/${params.handle}/post/${rkey}`
    : null;

  return { uri, permalink };
}
