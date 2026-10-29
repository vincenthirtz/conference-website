// utils/storage/mediaUrl.ts
//
// L'ADRESSE PUBLIQUE D'UN FICHIER, et le chemin d'une adresse. PUR : aucun
// import serveur, aucun réseau. Synchronisé côté site, où les pages et le SSR
// en ont besoin — c'est pour ça qu'il est séparé de `mediaStore.ts`, qui écrit.
//
// DEUX HÉBERGEMENTS, LES MÊMES CLÉS. Les fichiers publics (logos, cartes TCG,
// actualités, vignettes des réseaux, alertes de stream, règlements) vivent
// dans le bucket Supabase `teams-images` et, après la bascule, dans le bucket
// R2 `owwomenscup-media` servi par `media.owwomenscup.fr`. Les clés
// (`tcg/…`, `social/…`, `team-<uuid>/…`) sont identiques des deux côtés :
// passer d'une adresse à l'autre revient à remplacer le préfixe
// (conference-website, docs/R2-MEDIA.md).
//
// L'ADRESSE SUIT `NEXT_PUBLIC_MEDIA_BASE_URL`. Posée (origine https, sans `/`
// final) : `${base}/${clé}`. Absente : l'adresse Supabase, CARACTÈRE POUR
// CARACTÈRE celle que rendait `storage.from('teams-images').getPublicUrl()`
// (même normalisation de l'URL du projet, même `encodeURI` sur le tout) — sans
// la variable, rien ne change. ⚠️ Une `NEXT_PUBLIC_*` est FIGÉE AU BUILD par
// Next, code serveur compris : la changer demande de reconstruire l'image.
//
// LA LECTURE D'UNE ADRESSE reconnaît les DEUX hébergements, quelle que soit la
// configuration : une base qui contient encore des liens Supabase après la
// bascule (historiques), ou déjà des liens `media.` après un retour arrière,
// doit être comprise dans les deux cas.

/** Bucket public Supabase des médias (avant R2, et en retour arrière). */
export const MEDIA_SUPABASE_BUCKET = 'teams-images';

/** Hôte public du bucket R2 des médias (zone Cloudflare owwomenscup.fr). */
export const MEDIA_PUBLIC_HOST = 'media.owwomenscup.fr';

/** Chemin public d'un objet du bucket média sur n'importe quel projet Supabase. */
const SUPABASE_MEDIA_PATH = `/storage/v1/object/public/${MEDIA_SUPABASE_BUCKET}/`;

/**
 * La base publique configurée, normalisée (`https://hôte[/préfixe]`, sans `/`
 * final), ou `null` si la variable est absente ou inexploitable.
 *
 * Une valeur qui n'est pas une adresse https nue (protocole, identifiants,
 * requête, ancre) est IGNORÉE plutôt que recopiée dans chaque lien :
 * `mediaStore.ts` le journalise côté serveur.
 */
export function mediaBaseUrl(): string | null {
  // Lecture LITTÉRALE : c'est la forme que Next sait remplacer au build.
  return normalizeMediaBaseUrl(process.env.NEXT_PUBLIC_MEDIA_BASE_URL);
}

export function normalizeMediaBaseUrl(
  raw: string | null | undefined
): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return null;
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/**
 * Le préfixe que `getPublicUrl` donne au bucket média sur le projet configuré
 * (`NEXT_PUBLIC_SUPABASE_URL`), ou `null` sans projet.
 *
 * Même construction que supabase-js : `new URL('storage/v1', url + '/')`
 * (createClient), relu par `new URL()` et privé de son `/` final
 * (StorageClient), puis `/object/public/<bucket>/`.
 */
function supabaseMediaPrefix(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    const project = new URL(raw.endsWith('/') ? raw : `${raw}/`);
    const storage = new URL('storage/v1', project).href.replace(/\/$/, '');
    return `${storage}/object/public/${MEDIA_SUPABASE_BUCKET}/`;
  } catch {
    return null;
  }
}

/**
 * L'adresse publique d'une clé du bucket média.
 *
 * Sans base ni projet Supabase configurés (tests unitaires), l'adresse est
 * RELATIVE (`/storage/v1/object/public/teams-images/<clé>`) : en production
 * le cas n'existe pas — le client Supabase refuse de démarrer sans URL.
 */
export function mediaPublicUrl(path: string): string {
  // Comme `_getFinalPath` de storage-js : les `/` de tête ne comptent pas.
  const key = path.replace(/^\/+/, '');
  const base = mediaBaseUrl();
  if (base) return encodeURI(`${base}/${key}`);
  const prefix = supabaseMediaPrefix() ?? SUPABASE_MEDIA_PATH;
  return encodeURI(`${prefix}${key}`);
}

/**
 * La clé d'un objet du bucket média désignée par `url`, ou `null` si l'URL
 * n'en désigne pas une.
 *
 * Reconnues : la base configurée, le bucket média du projet Supabase
 * configuré, celui de TOUT projet `*.supabase.co` (https), et
 * `https://media.owwomenscup.fr/…`. La requête et l'ancre sont ignorées
 * (`?t=…` de rafraîchissement). Une clé vide, absolue, ou qui contient un
 * segment vide, `.` ou `..` (même encodé), un `\` ou un caractère de contrôle
 * est refusée : on ne rend jamais un chemin qui sortirait du bucket.
 */
export function mediaPathFromUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const value = url.trim();
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  const encodedKey = encodedKeyOf(parsed);
  return encodedKey === null ? null : safeKey(encodedKey);
}

/** Vrai si `url` désigne un objet du bucket média (l'un ou l'autre hôte). */
export function isMediaUrl(url: string | null | undefined): boolean {
  return mediaPathFromUrl(url) !== null;
}

function encodedKeyOf(url: URL): string | null {
  // 1. Les préfixes CONFIGURÉS d'abord : ils sont exacts (hôte et chemin), et
  //    couvrent un projet Supabase hors `*.supabase.co` (local, domaine perso).
  const base = mediaBaseUrl();
  for (const prefix of [base ? `${base}/` : null, supabaseMediaPrefix()]) {
    if (!prefix) continue;
    const p = new URL(prefix);
    if (url.origin === p.origin && url.pathname.startsWith(p.pathname)) {
      return url.pathname.slice(p.pathname.length);
    }
  }

  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();

  // 2. Tout projet Supabase : un lien enregistré peut venir d'un autre projet
  //    (copie de base, ancien environnement) ; le chemin public suffit.
  if (host.endsWith('.supabase.co')) {
    return url.pathname.startsWith(SUPABASE_MEDIA_PATH)
      ? url.pathname.slice(SUPABASE_MEDIA_PATH.length)
      : null;
  }

  // 3. Le domaine média R2, même quand la base n'est pas (ou plus) configurée.
  if (host === MEDIA_PUBLIC_HOST) return url.pathname.slice(1);

  return null;
}

function safeKey(encodedKey: string): string | null {
  let key: string;
  try {
    key = decodeURIComponent(encodedKey);
  } catch {
    return null;
  }
  if (!key || key.startsWith('/') || key.includes('\\')) return null;
  for (let i = 0; i < key.length; i++) {
    const code = key.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return null;
  }
  const segments = key.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return null;
  return key;
}
