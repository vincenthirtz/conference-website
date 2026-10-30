// cloudflare/responses.ts
//
// Ce que Netlify faisait sans le dire, et que le Worker doit refaire lui-même
// (cf. cloudflare/worker.mjs) :
//
// - `canonicalRedirect` : www.owwomenscup.fr et http:// → 301 vers
//   https://owwomenscup.fr, chemin et paramètres gardés (domaine principal du
//   site Netlify). Seulement pour nos deux noms : *.workers.dev et
//   `wrangler dev` (http://localhost) ne sont pas redirigés.
//
// - `browserCacheControl` : pour une page ISR, Next écrit
//   `s-maxage=…, stale-while-revalidate=…`, destiné à un cache partagé.
//   Rien ne met en cache les réponses du Worker devant lui ; le navigateur,
//   lui, ignore `s-maxage` mais applique `stale-while-revalidate` : Chrome
//   resservirait une page (ou ses données `/_next/data`) périmée jusqu'à 30
//   jours en la rafraîchissant en douce. Netlify remplace l'en-tête par
//   `public, max-age=0, must-revalidate` (toujours redemander) : idem ici.
//
// - `selfImageRewrite` : une image de NOTRE domaine écrite en adresse complète
//   (le logo par défaut des équipes, `teams.logo_url`, qui doit être absolu
//   pour les embeds Discord) passe par `/_next/image`, qui la refuse en 400 :
//   `owwomenscup.fr` n'est pas dans `images.remotePatterns`. L'y déclarer ferait
//   chercher l'image par le Worker sur son propre domaine, donc à l'origine
//   derrière les routes (l'ancien site Netlify). On la ramène à son chemin :
//   c'est un fichier de `public/`, servi directement.
//
// APIs web standard uniquement : ce module tourne dans le Worker et sous
// vitest.

export const CANONICAL_HOST = 'owwomenscup.fr';
const WWW_HOST = `www.${CANONICAL_HOST}`;

/** URL de redirection (301), ou `null` si la requête est déjà canonique. */
export function canonicalRedirect(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (
    host === WWW_HOST ||
    (host === CANONICAL_HOST && url.protocol === 'http:')
  ) {
    return `https://${CANONICAL_HOST}${url.pathname}${url.search}`;
  }
  return null;
}

/**
 * Adresse à donner à l'optimiseur quand il reçoit une image de notre domaine
 * en adresse complète, ou `null` si la requête ne change pas.
 */
export function selfImageRewrite(url: URL): string | null {
  if (url.pathname !== '/_next/image') return null;
  const raw = url.searchParams.get('url');
  if (!raw) return null;
  let src: URL;
  try {
    src = new URL(raw);
  } catch {
    return null; // déjà un chemin relatif
  }
  const host = src.host.toLowerCase();
  if (src.protocol !== 'https:') return null;
  if (host !== CANONICAL_HOST && host !== WWW_HOST) return null;
  // `//ailleurs.example` deviendrait une adresse externe une fois relative.
  if (src.pathname.startsWith('//')) return null;
  const next = new URL(url);
  next.searchParams.set('url', `${src.pathname}${src.search}`);
  return next.toString();
}

export const BROWSER_REVALIDATE = 'public, max-age=0, must-revalidate';

/**
 * Cache-Control à renvoyer au navigateur, ou `null` pour garder l'en-tête
 * tel quel (absent, privé, ou sans directive de cache partagé).
 */
export function browserCacheControl(value: string | null): string | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (!/\bs-maxage\s*=/.test(v)) return null;
  if (/\b(private|no-store)\b/.test(v)) return null;
  return BROWSER_REVALIDATE;
}
