// netlify/edge-functions/api-proxy.ts
//
// Relais même-origine : owwomenscup.fr/api/<famille>/… → conference-api
// (https://api.owwomenscup.fr, CloudFront → Caddy → Next), pour les familles
// qui dépendent des cookies du site et ne peuvent donc pas passer en
// cross-origin (cf. utils/remoteApi.ts, COOKIE_BOUND_PREFIXES).
//
// DÉCLARATION : `[[edge_functions]]` dans netlify.toml (path = "/api/*"), pas
// `export const config` — voir le commentaire du bloc dans netlify.toml.
//
// Variables (dashboard Netlify, portée « Functions » ; lues au runtime via
// Netlify.env, mais Netlify ne les applique qu'au déploiement SUIVANT — toute
// modification se fait suivre d'un redéploiement) :
//   - API_PROXY_PREFIXES  préfixes relayés, séparés par des virgules, chacun
//                         commençant par /api/ (ex. /api/onboard/)
//   - API_PROXY_ORIGIN    origine https de l'API (défaut https://api.owwomenscup.fr)
//   - EDGE_PROXY_SECRET   secret partagé avec conference-api (X-Owwc-Edge)
// Secret ou préfixes absents, origine invalide, chemin hors préfixe →
// `context.next()` : la requête poursuit vers la fonction serveur Next, à
// l'identique d'avant.
//
// Doc : docs/EDGE-API-PROXY.md. Logique pure et tests : utils/edgeApiProxy.ts,
// tests/unit/edgeApiProxy.test.ts.
//
// Tourne sous Deno : imports relatifs avec extension, aucun module Node.

import {
  buildDownstreamHeaders,
  buildUpstreamHeaders,
  buildUpstreamUrl,
  isNullBodyStatus,
  matchesProxyPrefix,
  methodHasBody,
  resolveEdgeProxyConfig,
  upstreamUnavailableResponse,
} from '../../utils/edgeApiProxy.ts';

// Sous-ensemble du `Context` des Edge Functions effectivement utilisé. Typé
// localement plutôt qu'importé (`@netlify/edge-functions` n'est pas une
// dépendance du dépôt, et un import nu ne se résout pas pareil sous Deno et
// sous le typecheck Node).
type EdgeContext = {
  ip?: string;
  next: () => Promise<Response>;
};

type NetlifyEnv = { env: { get: (key: string) => string | undefined } };

/** `Netlify.env.get`, ou undefined hors runtime Netlify (jamais d'exception). */
function readEnv(key: string): string | undefined {
  try {
    const netlify = (globalThis as { Netlify?: NetlifyEnv }).Netlify;
    return netlify?.env.get(key);
  } catch {
    return undefined;
  }
}

export default async function apiProxy(
  request: Request,
  context: EdgeContext
): Promise<Response> {
  const config = resolveEdgeProxyConfig({
    prefixes: readEnv('API_PROXY_PREFIXES'),
    origin: readEnv('API_PROXY_ORIGIN'),
    secret: readEnv('EDGE_PROXY_SECRET'),
  });
  if (!config) return context.next();

  const url = new URL(request.url);
  if (!matchesProxyPrefix(url.pathname, config.prefixes)) return context.next();

  const headers = buildUpstreamHeaders(request.headers, {
    secret: config.secret,
    clientIp: context.ip,
    host: url.host,
  });

  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    // Les 3xx reviennent tels quels au navigateur (OAuth, retours HelloAsso) :
    // les suivre ici ferait atterrir le navigateur sur la mauvaise page.
    redirect: 'manual',
  };
  if (methodHasBody(request.method) && request.body) {
    // Corps en flux, sans le mettre en mémoire (uploads).
    init.body = request.body;
    init.duplex = 'half';
  }

  let upstream: Response;
  try {
    upstream = await fetch(buildUpstreamUrl(config.origin, url), init);
  } catch (err) {
    console.error('[api-proxy] upstream fetch failed', {
      path: url.pathname,
      error: err instanceof Error ? err.message : String(err),
    });
    return upstreamUnavailableResponse();
  }

  return new Response(
    isNullBodyStatus(upstream.status) ? null : upstream.body,
    {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: buildDownstreamHeaders(upstream.headers),
    }
  );
}
