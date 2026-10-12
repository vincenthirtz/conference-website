// utils/edgeApiProxy.ts
//
// Logique pure du relais même-origine /api/* → conference-api, exécuté par
// l'Edge Function Netlify `netlify/edge-functions/api-proxy.ts`.
//
// POURQUOI UN RELAIS. utils/remoteApi.ts bascule les appels navigateur en
// cross-origin vers api.owwomenscup.fr, mais les familles qui lisent un cookie
// du site (session, tenant actif, états OAuth) ne peuvent pas partir : le
// cookie est posé sur owwomenscup.fr. Le relais garde l'URL sur le site (le
// navigateur envoie ses cookies, reçoit les Set-Cookie sur le bon domaine) et
// fait l'aller-retour vers l'API côté serveur.
//
// CE MODULE TOURNE SOUS DENO (Edge Functions) ET SOUS NODE (vitest) : APIs web
// standard uniquement (Headers, URL), aucun import Node, imports relatifs AVEC
// extension (exigence Deno). Pas de `process.env`, pas de `Netlify.env` : la
// lecture de l'environnement reste dans l'edge function.
//
// VARIABLES ABSENTES = AUCUN CHANGEMENT : `resolveEdgeProxyConfig` renvoie
// `null` et l'edge function rend la main (`context.next()`).

import { sanitizeApiOrigin } from './remoteApi.ts';

export const DEFAULT_API_PROXY_ORIGIN = 'https://api.owwomenscup.fr';

/** En-têtes ajoutés par le relais ; tout `x-owwc-*` venu du client est retiré. */
export const EDGE_SECRET_HEADER = 'X-Owwc-Edge';
export const EDGE_CLIENT_IP_HEADER = 'X-Owwc-Client-Ip';
export const EDGE_HOST_HEADER = 'X-Owwc-Host';
const OWWC_HEADER_PREFIX = 'x-owwc-';

/**
 * Hop-by-hop (RFC 9110 §7.6.1) + `proxy-connection` (non standard, encore
 * envoyé par de vieux clients). Valent pour UNE connexion : jamais relayés.
 */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export type EdgeProxyConfig = {
  /** Origine https de l'API, sans slash final. */
  origin: string;
  /** Préfixes relayés, chacun commençant par `/api/`. */
  prefixes: string[];
  /** Secret partagé avec conference-api (en-tête X-Owwc-Edge). */
  secret: string;
};

/**
 * Préfixes exploitables d'une liste séparée par des virgules. Un préfixe doit
 * commencer par `/api/` et ne contenir ni blanc, ni `?`, ni `#` : on compare
 * des chemins, pas des URL. Les entrées invalides sont ignorées une à une.
 */
export function parseProxyPrefixes(raw: string | undefined): string[] {
  return (raw || '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.startsWith('/api/') && !/[\s?#]/.test(p));
}

/**
 * Valeur sûre pour un en-tête HTTP (pas de CR/LF/NUL, ASCII imprimable), sinon
 * ''. `Headers.set` lèverait sur une valeur invalide : mieux vaut désactiver
 * le relais qu'échouer sur chaque requête.
 */
function headerSafe(raw: string | undefined): string {
  const v = (raw || '').trim();
  return /^[\x21-\x7e]+$/.test(v) ? v : '';
}

/**
 * Config à partir des valeurs brutes de l'environnement. `null` — donc relais
 * inactif — dès que le secret manque, qu'aucun préfixe exploitable ne reste,
 * ou que l'origine fournie n'est pas une origine https stricte. Une origine
 * ABSENTE prend la valeur par défaut ; une origine INVALIDE désactive tout
 * (on ne devine pas ce que l'opérateur voulait dire).
 */
export function resolveEdgeProxyConfig(raw: {
  prefixes: string | undefined;
  origin: string | undefined;
  secret: string | undefined;
}): EdgeProxyConfig | null {
  const secret = headerSafe(raw.secret);
  if (!secret) return null;
  const prefixes = parseProxyPrefixes(raw.prefixes);
  if (!prefixes.length) return null;
  const originRaw = (raw.origin || '').trim();
  const origin = sanitizeApiOrigin(originRaw || DEFAULT_API_PROXY_ORIGIN);
  if (!origin) return null;
  return { origin, prefixes, secret };
}

/** Le chemin (déjà normalisé par `URL`) relève-t-il d'un préfixe relayé ? */
export function matchesProxyPrefix(
  pathname: string,
  prefixes: readonly string[]
): boolean {
  return prefixes.some((p) => pathname.startsWith(p));
}

/** URL amont : origine de l'API + chemin + query, sans le fragment. */
export function buildUpstreamUrl(origin: string, requestUrl: URL): string {
  return origin + requestUrl.pathname + requestUrl.search;
}

/**
 * Noms à ne pas relayer : hop-by-hop, plus ceux que l'en-tête `Connection`
 * déclare propres à la connexion (RFC 9110 §7.6.1).
 */
function connectionScoped(headers: Headers): Set<string> {
  const names = new Set(HOP_BY_HOP);
  for (const token of (headers.get('connection') || '').split(',')) {
    const name = token.trim().toLowerCase();
    if (name) names.add(name);
  }
  return names;
}

/**
 * En-têtes de la requête amont. Copie tout sauf hop-by-hop, `host` (fetch le
 * pose d'après l'URL amont) et `x-owwc-*` (un client ne doit jamais pouvoir
 * se faire passer pour le relais), puis :
 *   - `accept-encoding: identity` : la réponse amont arrive non compressée,
 *     son corps est relayé tel quel et `content-encoding`/`content-length`
 *     restent cohérents quoi que fasse le fetch du runtime (celui de Deno
 *     peut décompresser de lui-même un corps gzip/br, en laissant ou non
 *     les en-têtes d'origine). Le CDN Netlify recompresse vers le
 *     navigateur.
 *   - les trois en-têtes du relais.
 */
export function buildUpstreamHeaders(
  incoming: Headers,
  meta: { secret: string; clientIp: string | undefined; host: string }
): Headers {
  const skip = connectionScoped(incoming);
  skip.add('host');
  const out = new Headers();
  for (const [name, value] of incoming) {
    const lower = name.toLowerCase();
    if (skip.has(lower) || lower.startsWith(OWWC_HEADER_PREFIX)) continue;
    out.append(name, value);
  }
  out.set('accept-encoding', 'identity');
  out.set(EDGE_SECRET_HEADER, meta.secret);
  const ip = headerSafe(meta.clientIp);
  if (ip) out.set(EDGE_CLIENT_IP_HEADER, ip);
  const host = headerSafe(meta.host);
  if (host) out.set(EDGE_HOST_HEADER, host);
  return out;
}

/**
 * En-têtes de la réponse renvoyée au navigateur. Tout est conservé (dont
 * `Cache-Control` amont) sauf le hop-by-hop. Les `Set-Cookie` sont recopiés
 * UN PAR UN via `getSetCookie()` : les fusionner en une seule valeur séparée
 * par des virgules casserait les dates `Expires=Wed, 21 Oct…`.
 *
 * Si l'amont compresse malgré `accept-encoding: identity`, `content-length`
 * est retiré : selon le runtime, le corps peut avoir été décompressé en route
 * et la longueur annoncée ne correspondrait plus.
 */
export function buildDownstreamHeaders(upstream: Headers): Headers {
  const skip = connectionScoped(upstream);
  skip.add('set-cookie');
  const encoding = (upstream.get('content-encoding') || '').toLowerCase();
  if (encoding && encoding !== 'identity') skip.add('content-length');
  const out = new Headers();
  for (const [name, value] of upstream) {
    if (skip.has(name.toLowerCase())) continue;
    out.append(name, value);
  }
  const cookies =
    typeof upstream.getSetCookie === 'function'
      ? upstream.getSetCookie()
      : [upstream.get('set-cookie')].filter((c): c is string => !!c);
  for (const cookie of cookies) out.append('set-cookie', cookie);
  return out;
}

/** Méthodes sans corps de requête : pas de flux, pas de `duplex`. */
export function methodHasBody(method: string): boolean {
  const m = method.toUpperCase();
  return m !== 'GET' && m !== 'HEAD';
}

/** Statuts dont la réponse ne peut pas porter de corps (Fetch spec). */
export function isNullBodyStatus(status: number): boolean {
  return status === 101 || status === 204 || status === 205 || status === 304;
}

/** Réponse quand l'API est injoignable (erreur réseau, DNS, TLS…). */
export function upstreamUnavailableResponse(): Response {
  return new Response(JSON.stringify({ error: 'Upstream unavailable' }), {
    status: 502,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
