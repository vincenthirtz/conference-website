// cloudflare/worker.mjs — point d'entrée du Worker « owwomenscup »
// (wrangler.jsonc), autour du Worker généré par OpenNext
// (`.open-next/worker.js`, produit par `opennextjs-cloudflare build`).
// Doc : docs/CLOUDFLARE.md.
//
// En .mjs plutôt qu'en .ts : tsconfig inclut tous les .ts, et le typecheck
// de `next build` tourne avant que `.open-next/` existe. Wrangler (esbuild)
// le bundle avec ses imports .ts.
//
// 1) RELAIS /api/* → conference-api, comme l'Edge Function Netlify
//    (netlify/edge-functions/api-proxy.ts), avec la même logique pure
//    (utils/edgeApiProxy.ts). `/api/internal/*` n'est jamais relayé : OpenNext
//    le sert ici (régénération ISR demandée par l'API).
//    EDGE_PROXY_SECRET (secret du Worker) est INDISPENSABLE en production :
//    sans lui, le relais part sans les en-têtes X-Owwc-*, et Caddy traite le
//    Worker comme un visiteur ordinaire — Host = api.owwomenscup.fr (URL de
//    retour OAuth/HelloAsso, csrfCheck des requêtes à cookie), IP = sortie
//    Cloudflare (limites de débit partagées). Toléré tant que le Worker n'est
//    servi que sur *.workers.dev.
//
// 2) TÂCHES PLANIFIÉES : un Cron Trigger chaque minute → cloudflare/crons.ts.
//    Rien ne part sans `CRONS_ENABLED=1` (wrangler.jsonc) ET CRON_SECRET.
//
// 3) PAGE 404 : notre page pour un `notFound` de getStaticProps, qu'OpenNext
//    laisse en texte brut (cf. isBareNotFound).
//
// 4) *.workers.dev : `X-Robots-Tag: noindex, nofollow` sur les pages, pour
//    que l'adresse technique ne soit jamais indexée à côté du vrai domaine.
//
// 5) CE QUE NETLIFY FAISAIT SEUL (cloudflare/responses.ts) : www et http://
//    → 301 vers https://owwomenscup.fr ; Cache-Control « toujours
//    redemander » au navigateur pour les pages ISR et leurs `/_next/data`.

import handler from '../.open-next/worker.js';
import {
  buildDownstreamHeaders,
  buildUpstreamHeaders,
  buildUpstreamUrl,
  EDGE_CLIENT_IP_HEADER,
  EDGE_HOST_HEADER,
  EDGE_SECRET_HEADER,
  isNullBodyStatus,
  matchesProxyPrefix,
  methodHasBody,
  resolveEdgeProxyConfig,
  upstreamUnavailableResponse,
} from '../utils/edgeApiProxy.ts';
import { dueCronJobs, resolveCronApiBaseUrl, runCronJob } from './crons.ts';
import { browserCacheControl, canonicalRedirect } from './responses.ts';

// File de régénération ISR (liée dans wrangler.jsonc).
export { DOQueueHandler } from '../.open-next/worker.js';

// `resolveEdgeProxyConfig` désactive tout sans secret ; ici le relais part
// quand même, en retirant ensuite les en-têtes X-Owwc-* (cf. en-tête).
const NO_SECRET_PLACEHOLDER = 'sans-secret';

let warnedNoSecret = false;

async function relay(request, url, config, trusted) {
  const headers = buildUpstreamHeaders(request.headers, {
    secret: config.secret,
    clientIp: request.headers.get('cf-connecting-ip') ?? undefined,
    host: url.host,
  });
  if (!trusted) {
    headers.delete(EDGE_SECRET_HEADER);
    headers.delete(EDGE_CLIENT_IP_HEADER);
    headers.delete(EDGE_HOST_HEADER);
    if (!warnedNoSecret) {
      warnedNoSecret = true;
      console.warn(
        '[relais] EDGE_PROXY_SECRET absent : relais sans en-têtes X-Owwc-*'
      );
    }
  }

  // 3xx non suivies (OAuth, retours HelloAsso) ; corps en flux (workerd n'a
  // pas besoin de `duplex`).
  const init = { method: request.method, headers, redirect: 'manual' };
  if (methodHasBody(request.method) && request.body) init.body = request.body;

  let upstream;
  try {
    upstream = await fetch(buildUpstreamUrl(config.origin, url), init);
  } catch (err) {
    console.error('[relais] amont injoignable', {
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

// Un getStaticProps qui renvoie `notFound` (tournoi supprimé…) : Next, en
// « minimal mode » comme sous OpenNext, répond par le texte brut « This page
// could not be found », sans Content-Type, et laisse la plateforme servir la
// page 404 (next/dist/server/route-modules/pages/pages-handler.js, render404
// sans routerServerContext). Netlify le fait, OpenNext non : on sert la nôtre.
function isBareNotFound(request, url, response) {
  return (
    response.status === 404 &&
    (request.method === 'GET' || request.method === 'HEAD') &&
    !response.headers.has('content-type') &&
    !url.pathname.startsWith('/_next/')
  );
}

async function notFoundPage(request, env, ctx) {
  const page = await handler.fetch(
    new Request(new URL('/404', request.url), {
      method: request.method,
      headers: request.headers,
    }),
    env,
    ctx
  );
  const headers = new Headers(page.headers);
  headers.set(
    'cache-control',
    'private, no-cache, no-store, max-age=0, must-revalidate'
  );
  return new Response(page.body, { status: 404, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const canonical = canonicalRedirect(url);
    if (canonical) return Response.redirect(canonical, 301);

    const secret = env.EDGE_PROXY_SECRET || '';
    const config = resolveEdgeProxyConfig({
      prefixes: env.API_PROXY_PREFIXES,
      origin: env.API_PROXY_ORIGIN,
      secret: secret || NO_SECRET_PLACEHOLDER,
    });
    if (config && matchesProxyPrefix(url.pathname, config.prefixes)) {
      return relay(request, url, config, Boolean(secret));
    }

    let response = await handler.fetch(request, env, ctx);
    if (isBareNotFound(request, url, response)) {
      await response.body?.cancel();
      response = await notFoundPage(request, env, ctx);
    }
    const cacheControl = browserCacheControl(
      response.headers.get('cache-control')
    );
    const noindex = url.hostname.endsWith('.workers.dev');
    if (!cacheControl && !noindex) return response;
    const out = new Response(response.body, response);
    if (cacheControl) out.headers.set('cache-control', cacheControl);
    if (noindex) out.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return out;
  },

  async scheduled(controller, env, ctx) {
    if (env.CRONS_ENABLED !== '1') return;
    if (!env.CRON_SECRET) {
      console.error(
        '[crons] CRONS_ENABLED=1 mais CRON_SECRET absent : rien n’est lancé'
      );
      return;
    }
    const jobs = dueCronJobs(new Date(controller.scheduledTime));
    if (!jobs.length) return;
    const baseUrl = resolveCronApiBaseUrl(env.CRON_API_BASE_URL);
    ctx.waitUntil(
      Promise.all(
        jobs.map(async (job) => {
          const result = await runCronJob(job, {
            baseUrl,
            secret: env.CRON_SECRET,
          });
          if (result.ok) console.log('[crons] ok', result.name, result.status);
          else console.error('[crons] échec', result);
        })
      )
    );
  },
};
