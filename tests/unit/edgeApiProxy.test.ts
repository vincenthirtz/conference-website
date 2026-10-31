// Relais même-origine /api/* → conference-api : logique pure partagée,
// utilisée par le Worker (cloudflare/worker.mjs).
//
// Les invariants qui comptent :
//   - SANS variables (ou secret absent, ou origine invalide), rien n’est
//     relayé : la requête reste au site.
//   - Un client ne peut jamais forger les en-têtes X-Owwc-* du relais.
//   - Plusieurs Set-Cookie amont reviennent séparés, jamais fusionnés.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  askApiWorker,
  buildDownstreamHeaders,
  buildUpstreamHeaders,
  buildUpstreamUrl,
  DEFAULT_API_PROXY_ORIGIN,
  finalAtApiWorker,
  isNeverProxiedPath,
  isNullBodyStatus,
  matchesProxyPrefix,
  methodHasBody,
  parseProxyPrefixes,
  resolveEdgeProxyConfig,
  servedByApiWorker,
  upstreamUnavailableResponse,
} from '@/utils/edgeApiProxy';

const SECRET = 's3cr3t-edge-value';

const UUID = '33333333-3333-4333-8333-333333333333';

describe('Worker de l’API : qui y part', () => {
  const routes = parseProxyPrefixes(
    '/api/health,/api/leagues,/api/leagues/*,/api/public/v1/*,/api/teams,/api/teams/:id,/api/team/:id/stats'
  );
  const served = (path: string, method = 'GET') =>
    servedByApiWorker(method, path, routes);

  it('les lectures des routes listées', () => {
    expect(served('/api/health')).toBe(true);
    expect(served('/api/health', 'HEAD')).toBe(true);
    expect(served('/api/teams')).toBe(true);
    expect(served(`/api/teams/${UUID}`)).toBe(true);
    expect(served(`/api/teams/${UUID.toUpperCase()}`)).toBe(true);
    expect(served(`/api/team/${UUID}/stats`)).toBe(true);
    expect(served('/api/leagues')).toBe(true);
    expect(served('/api/leagues/saison-2025')).toBe(true);
    expect(served(`/api/public/v1/tournaments/${UUID}/matches`)).toBe(true);
  });

  it('jamais une écriture, même sur une route listée', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) {
      expect(served('/api/teams', method)).toBe(false);
    }
  });

  it('une route exacte ne couvre pas ce qui la prolonge', () => {
    expect(served('/api/teams/leave')).toBe(false);
    expect(served('/api/teams/join-requests')).toBe(false);
    expect(served(`/api/teams/${UUID}/members`)).toBe(false);
    expect(served('/api/health/x')).toBe(false);
    expect(served('/api/healthz')).toBe(false);
    expect(served('/api/teams-privees')).toBe(false);
  });

  it(':id n’accepte qu’un UUID', () => {
    expect(served('/api/teams/une-equipe')).toBe(false);
    expect(served('/api/team/une-equipe/stats')).toBe(false);
    expect(served(`/api/teams/${UUID}x`)).toBe(false);
  });

  it('une route voisine non listée reste au serveur', () => {
    expect(served(`/api/team/${UUID}/maps`)).toBe(false);
    expect(served('/api/admin/me')).toBe(false);
  });

  it('`*` demande un segment de plus', () => {
    expect(served('/api/public/v1')).toBe(false);
  });

  it('ni la casse, ni un encodage, ni un slash final ne font entrer', () => {
    expect(served('/API/health')).toBe(false);
    expect(served('/api/%74eams')).toBe(false);
    expect(served('/api/health/')).toBe(false);
  });

  it('rien avec une liste vide', () => {
    expect(
      servedByApiWorker('GET', '/api/health', parseProxyPrefixes(undefined))
    ).toBe(false);
    expect(
      servedByApiWorker('GET', '/api/health', parseProxyPrefixes(''))
    ).toBe(false);
  });

  it('une inspection du staff (`?as=`) reste au serveur : ce GET écrit au journal', () => {
    const player = ['/api/player/notifications'];
    expect(
      servedByApiWorker('GET', '/api/player/notifications', player, '')
    ).toBe(true);
    expect(
      servedByApiWorker(
        'GET',
        '/api/player/notifications',
        player,
        `?teamId=${UUID}`
      )
    ).toBe(true);
    for (const search of [
      `?as=${UUID}`,
      `?teamId=${UUID}&as=${UUID}`,
      '?as=',
      '?as',
    ]) {
      expect(
        servedByApiWorker('GET', '/api/player/notifications', player, search)
      ).toBe(false);
    }
    // Un autre paramètre qui contient « as » n'est pas une inspection.
    expect(
      servedByApiWorker('GET', '/api/player/notifications', player, '?has=1')
    ).toBe(true);
  });

  it('jamais /api/internal, même si une route le couvre', () => {
    expect(
      servedByApiWorker(
        'GET',
        '/api/internal/revalidate',
        parseProxyPrefixes('/api/internal/*,/api/internal/revalidate')
      )
    ).toBe(false);
  });
});

describe('Worker de l’API : ce qui part sans retour possible', () => {
  const writes = ['/api/bot/v1/*', '/api/signals/notes'];
  const reads = ['/api/bot/v1/reminders'];
  const final = (method: string, path: string) =>
    finalAtApiWorker(method, path, writes, reads);

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    '%s d’une route listée : au Worker, sans repli',
    (method) => {
      expect(final(method, `/api/bot/v1/matches/${UUID}`)).toBe(true);
    }
  );

  it('une écriture hors liste reste au serveur', () => {
    expect(final('POST', '/api/news')).toBe(false);
    expect(final('POST', '/api/bot')).toBe(false);
    expect(final('POST', '/api/botte/v1/x')).toBe(false);
  });

  it('un GET qui écrit part sans repli, pas les autres lectures', () => {
    expect(final('GET', '/api/bot/v1/reminders')).toBe(true);
    expect(final('HEAD', '/api/bot/v1/reminders')).toBe(true);
    expect(final('GET', '/api/bot/v1/role-sync/snapshot')).toBe(false);
  });

  it('une liste de GET vide ne couvre rien, une écriture non plus sans liste', () => {
    expect(finalAtApiWorker('GET', '/api/bot/v1/reminders', writes, [])).toBe(
      false
    );
    expect(finalAtApiWorker('POST', '/api/signals/notes', [], reads)).toBe(
      false
    );
  });

  it('jamais /api/internal/, quelle que soit la liste', () => {
    expect(
      finalAtApiWorker('POST', '/api/internal/revalidate', ['/api/*'], [])
    ).toBe(false);
  });
});

describe('API_WORKER_ROUTES de production (wrangler.jsonc)', () => {
  const config = JSON.parse(
    readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, '')
  );
  const routes = parseProxyPrefixes(config.vars.API_WORKER_ROUTES);

  it('liste exactement les lectures publiques choisies', () => {
    for (const path of [
      '/api/news',
      '/api/news/rss',
      '/api/news/comments',
      '/api/teams',
      `/api/teams/${UUID}`,
      `/api/team/${UUID}/stats`,
      `/api/tournaments/${UUID}/prize-pool`,
      `/api/tournament/${UUID}/qr`,
      '/api/players/leaderboard',
      '/api/player/notifications',
      '/api/player/dashboard',
      '/api/player/progression',
      '/api/player/team',
      '/api/player/matches',
      '/api/player/next-match',
      '/api/admin/me',
      '/api/admin/realtime/ticket',
      '/api/admin/diffusion/overlay-presence',
      '/api/site-settings',
      '/api/partners',
      '/api/cast-members',
      '/api/maps/stats',
      '/api/games/overwatch/heroes',
      '/api/scrims',
      '/api/scrims/ladder',
      `/api/scrims/${UUID}`,
      `/api/players/${UUID}/profile`,
      '/api/public/free-players',
      '/api/public/team-openings',
      '/api/public/webhook-events',
      '/api/docs',
      '/api/tcg/hero/v1/freja.svg',
      '/api/twitch-channels',
      '/api/twitch/live',
      '/api/blizzard-news',
      '/api/blizzard-media',
      '/api/patch-notes',
      `/api/tournament/${UUID}/maps`,
      `/api/tournament/${UUID}/pool`,
      '/api/player/agenda.ics',
      '/api/player/agenda/subscription',
      `/api/player/messages/${UUID}`,
      `/api/player/matches/${UUID}`,
      '/api/player/discovery/search',
      `/api/player/predictions/${UUID}`,
      '/api/player/realtime/ticket',
      // Peut créditer une série : la base ne laisse passer qu'un seul crédit (ON CONFLICT).
      '/api/player/tcg/sets',
      '/api/player/tcg/wallet',
      '/api/player/tcg/trades',
      '/api/teams/opening',
      '/api/teams/search-players',
      `/api/teams/matches/${UUID}/lineup`,
      `/api/teams/scrim-plannings/${UUID}/suggest`,
      '/api/overlay/alerts',
      '/api/overlay/day',
      '/api/overlay/donations',
      '/api/overlay/scrim-result',
      '/api/overlay/scrims',
      '/api/overlay/standings',
      `/api/overlay/match/${UUID}`,
      '/api/overlay/match/next',
      '/api/overlay/tcg/un-jeton',
    ]) {
      expect(servedByApiWorker('GET', path, routes)).toBe(true);
    }
  });

  it('le signal de présence des overlays part sans repli', () => {
    const writes = parseProxyPrefixes(config.vars.API_WORKER_WRITE_ROUTES);
    expect(finalAtApiWorker('POST', '/api/overlay/heartbeat', writes, [])).toBe(
      true
    );
  });

  it('les lectures joueuses ne couvrent pas leurs écritures', () => {
    const writes = parseProxyPrefixes(config.vars.API_WORKER_WRITE_ROUTES);
    for (const [method, path] of [
      ['POST', '/api/player/agenda/subscription'],
      ['POST', '/api/player/tcg/trades'],
      ['PUT', '/api/player/team-reviews'],
      ['PUT', '/api/player/team-rhythm'],
      ['POST', '/api/teams/opening'],
      ['POST', `/api/player/messages/${UUID}`],
    ]) {
      expect(servedByApiWorker(method, path, routes)).toBe(false);
      expect(finalAtApiWorker(method, path, writes, [])).toBe(false);
    }
  });

  it('une inspection du staff (?as=) reste au serveur', () => {
    for (const path of ['/api/player/agenda', '/api/player/tcg/wallet']) {
      expect(servedByApiWorker('GET', path, routes, `?as=${UUID}`)).toBe(false);
    }
  });

  it('les écritures des listes publiques et du pool restent au serveur', () => {
    const writes = parseProxyPrefixes(config.vars.API_WORKER_WRITE_ROUTES);
    for (const [method, path] of [
      ['POST', '/api/public/free-players'],
      ['POST', '/api/public/team-openings'],
      ['POST', `/api/tournament/${UUID}/pool`],
      ['DELETE', `/api/tournament/${UUID}/pool`],
      ['POST', `/api/tournament/${UUID}/maps`],
    ]) {
      expect(servedByApiWorker(method, path, routes)).toBe(false);
      expect(finalAtApiWorker(method, path, writes, [])).toBe(false);
    }
  });

  it('une écriture des routes joueuses reste au serveur', () => {
    expect(servedByApiWorker('PATCH', '/api/player/team', routes)).toBe(false);
  });

  it('une écriture du profil staff reste au serveur', () => {
    expect(servedByApiWorker('PATCH', '/api/admin/me', routes)).toBe(false);
  });

  // Audit du 2026-10-31 : un GET qui écrit, une route privée, ou du direct à l'écran.
  it.each([
    `/api/player/matches/${UUID}/report-score`,
    `/api/player/matches/${UUID}/evidence`,
    '/api/player/tcg/booster',
    // Lourd, données personnelles complètes, et limité à 5 par minute.
    '/api/player/data-export',
    '/api/player/delete-account',
    // La Library est fermée, et certains de ses GET écrivent (appartement, duels, paquet).
    '/api/player/library/me',
    '/api/player/library/apartment',
    `/api/player/library/arena/duels/${UUID}`,
    // Des coordonnées, ou un jeton à deviner : leur limite de fréquence s'affaiblit sur le Worker.
    '/api/teams/free-players',
    '/api/teams/invitations/by-token',
    '/api/teams/invite-links/by-token',
    '/api/public/newsletter/confirm',
    '/api/public/free-players/remove',
    '/api/public/team-openings/remove',
    '/api/teams/leave',
    // Des coordonnées, protégées par une limite de fréquence : à revoir avec les limites partagées.
    '/api/team-openings/contact',
    // La génération d'images peut saturer un exemplaire, et couper ce qui tourne à côté.
    `/api/og/player/${UUID}`,
    `/api/cast/${UUID}`,
    '/api/twitch/oauth-callback',
    '/api/twitch/exchange',
    `/api/matches/${UUID}`,
    `/api/matches/${UUID}/games`,
    `/api/matches/${UUID}/drafts/1`,
    // Lisent des mémos à l'antenne : ils attendent la preuve du pont des signaux.
    '/api/overlay/mvp-public',
    `/api/overlay/match/${UUID}/stats`,
    '/api/caster/me',
    '/api/admin/alerts-summary',
    // Exige la double authentification : un Worker qui l'oublierait ne se verrait pas.
    '/api/admin/users/manage',
    `/api/admin/matches/${UUID}`,
    '/api/captcha',
    '/api/internal/revalidate',
  ])('ne couvre jamais %s', (path) => {
    expect(servedByApiWorker('GET', path, routes)).toBe(false);
  });
});

describe('le bot sur le Worker de l’API (wrangler.jsonc)', () => {
  const config = JSON.parse(
    readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, '')
  );
  const reads = parseProxyPrefixes(config.vars.API_WORKER_ROUTES);
  const writes = parseProxyPrefixes(config.vars.API_WORKER_WRITE_ROUTES);
  const unreplayable = parseProxyPrefixes(
    config.vars.API_WORKER_UNREPLAYABLE_READS
  );
  const final = (method: string, path: string) =>
    finalAtApiWorker(method, path, writes, unreplayable);

  // Audit du 2026-10-31 : le seul GET du bot qui consomme. Rejoué après une panne, il
  // rendrait vide ce que le premier passage a marqué « envoyé » : le rappel serait perdu.
  it('les rappels partent sans repli', () => {
    expect(final('GET', '/api/bot/v1/reminders')).toBe(true);
  });

  it.each([
    '/api/bot/v1/role-sync/snapshot',
    '/api/bot/v1/tenants/all-configs',
    `/api/bot/v1/matches/${UUID}`,
  ])('la lecture %s garde son repli', (path) => {
    expect(final('GET', path)).toBe(false);
    expect(servedByApiWorker('GET', path, reads)).toBe(true);
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])(
    'ses écritures %s partent sans repli : elles ne se rejouent pas',
    (method) => {
      expect(final(method, '/api/bot/v1/role-sync/presence')).toBe(true);
    }
  );

  it('les écritures hors du bot restent au serveur', () => {
    expect(final('POST', '/api/admin/matches')).toBe(false);
    expect(final('PATCH', '/api/admin/me')).toBe(false);
    expect(final('POST', '/api/player/tcg/booster')).toBe(false);
  });

  it('les routes historiques du bot restent au serveur', () => {
    expect(final('POST', '/api/news')).toBe(false);
    expect(final('POST', '/api/support/ticket')).toBe(false);
  });
});

describe('Worker de l’API : repli sur le serveur', () => {
  const url = 'https://api.owwomenscup.fr/api/health';
  const init = { method: 'GET' };
  const ask = (
    fetch: (url: string, init: RequestInit) => Promise<Response>,
    timeoutMs?: number
  ) => {
    const reasons: string[] = [];
    return askApiWorker(
      { fetch },
      url,
      init,
      (reason) => reasons.push(reason),
      timeoutMs
    ).then((response) => ({ response, reasons }));
  };

  it('rend sa réponse telle quelle, sans trace', async () => {
    const answer = new Response('ok', { status: 200 });
    const { response, reasons } = await ask(async (calledUrl, calledInit) => {
      expect(calledUrl).toBe(url);
      expect(calledInit).toBe(init);
      return answer;
    });
    expect(response).toBe(answer);
    expect(reasons).toEqual([]);
  });

  it('un 401 anonyme est une vraie réponse', async () => {
    const { response, reasons } = await ask(
      async () => new Response(null, { status: 401 })
    );
    expect(response?.status).toBe(401);
    expect(reasons).toEqual([]);
  });

  it('un 403 anonyme est une vraie réponse', async () => {
    const { response, reasons } = await ask(
      async () => new Response(null, { status: 403 })
    );
    expect(response?.status).toBe(403);
    expect(reasons).toEqual([]);
  });

  describe.each([401, 403])('un %i à une requête identifiée', (status) => {
    it.each(['authorization', 'cookie', 'x-api-key'])(
      'avec %s repart vers le serveur, qui tranche',
      async (name) => {
        const fallbacks: Array<[string, number | undefined]> = [];
        const response = await askApiWorker(
          { fetch: async () => new Response('non', { status }) },
          url,
          { method: 'GET', headers: new Headers({ [name]: 'x' }) },
          (reason, refused) => fallbacks.push([reason, refused])
        );
        expect(response).toBeNull();
        expect(fallbacks).toEqual([[`statut ${status}`, status]]);
      }
    );
  });

  it('les autres réponses à une requête identifiée sont de vraies réponses', async () => {
    for (const status of [404, 429]) {
      const reasons: string[] = [];
      const response = await askApiWorker(
        { fetch: async () => new Response('non', { status }) },
        url,
        { method: 'GET', headers: new Headers({ authorization: 'x' }) },
        (reason) => reasons.push(reason)
      );
      expect(response?.status).toBe(status);
      expect(reasons).toEqual([]);
    }
  });

  it('rend aussi ses 4xx et ses redirections : ce sont des réponses', async () => {
    for (const status of [301, 304, 400, 404, 429]) {
      const { response, reasons } = await ask(
        async () => new Response(null, { status })
      );
      expect(response?.status).toBe(status);
      expect(reasons).toEqual([]);
    }
  });

  it('une 5xx : repli, corps refermé, trace', async () => {
    let cancelled = false;
    const body = new ReadableStream({
      cancel() {
        cancelled = true;
      },
    });
    const { response, reasons } = await ask(
      async () => new Response(body, { status: 503 })
    );
    expect(response).toBeNull();
    expect(cancelled).toBe(true);
    expect(reasons).toEqual(['statut 503']);
  });

  it('une exception : repli et trace', async () => {
    const { response, reasons } = await ask(async () => {
      throw new Error('liaison coupée');
    });
    expect(response).toBeNull();
    expect(reasons).toEqual(['liaison coupée']);
  });

  it('aucune réponse à temps : repli et trace', async () => {
    const { response, reasons } = await ask(
      () => new Promise<Response>(() => {}),
      5
    );
    expect(response).toBeNull();
    expect(reasons).toEqual(['délai de 5 ms']);
  });
});

describe('parseProxyPrefixes', () => {
  it('garde les préfixes /api/ valides, ignore le reste', () => {
    expect(
      parseProxyPrefixes(
        ' /api/onboard/ , /api/twitch/,api/x/, /pages/, /api/a b/, /api/q?x, '
      )
    ).toEqual(['/api/onboard/', '/api/twitch/']);
  });
  it('vide sans valeur', () => {
    expect(parseProxyPrefixes(undefined)).toEqual([]);
    expect(parseProxyPrefixes(' , ')).toEqual([]);
  });
});

describe('resolveEdgeProxyConfig', () => {
  const base = {
    prefixes: '/api/onboard/',
    origin: undefined,
    secret: SECRET,
  };

  it('origine par défaut quand API_PROXY_ORIGIN est absente', () => {
    expect(resolveEdgeProxyConfig(base)).toEqual({
      origin: DEFAULT_API_PROXY_ORIGIN,
      prefixes: ['/api/onboard/'],
      secret: SECRET,
    });
    expect(resolveEdgeProxyConfig({ ...base, origin: '  ' })?.origin).toBe(
      DEFAULT_API_PROXY_ORIGIN
    );
  });

  it('accepte une origine https et retire le slash final', () => {
    expect(
      resolveEdgeProxyConfig({ ...base, origin: 'https://api.example.fr/' })
        ?.origin
    ).toBe('https://api.example.fr');
  });

  it.each([
    ['secret absent', { ...base, secret: undefined }],
    ['secret vide', { ...base, secret: '   ' }],
    ['secret avec saut de ligne', { ...base, secret: 'a\r\nX-Evil: 1' }],
    ['préfixes absents', { ...base, prefixes: undefined }],
    ['préfixes invalides', { ...base, prefixes: '/pages/, api/' }],
    ['origine http', { ...base, origin: 'http://api.owwomenscup.fr' }],
    ['origine avec chemin', { ...base, origin: 'https://api.x.fr/api' }],
  ])('null : %s', (_label, raw) => {
    expect(resolveEdgeProxyConfig(raw)).toBeNull();
  });
});

describe('matchesProxyPrefix', () => {
  const prefixes = ['/api/onboard/', '/api/auth/'];
  it.each([
    ['/api/onboard/step', true],
    ['/api/auth/discord/callback', true],
    ['/api/onboard', false],
    ['/api/admin/teams', false],
    ['/api/onboardx/step', false],
    ['/onboard/api/onboard/', false],
  ])('%s → %s', (path, expected) => {
    expect(matchesProxyPrefix(path, prefixes)).toBe(expected);
  });
});

describe('/api/internal/* jamais relayé', () => {
  it.each([
    '/api/internal/revalidate',
    '/api/internal',
    '/api/internal/autre',
    '/api/%69nternal/revalidate',
    '/API/Internal/revalidate',
  ])('%s exclu même avec le préfixe /api/', (path) => {
    expect(isNeverProxiedPath(path)).toBe(true);
    expect(matchesProxyPrefix(path, ['/api/'])).toBe(false);
    expect(matchesProxyPrefix(path, ['/api/internal/'])).toBe(false);
  });
  it.each(['/api/internals/x', '/api/onboard/internal', '/api/internalx'])(
    '%s reste relayable',
    (path) => {
      expect(isNeverProxiedPath(path)).toBe(false);
      expect(matchesProxyPrefix(path, ['/api/'])).toBe(true);
    }
  );
});

describe('buildUpstreamUrl', () => {
  it('chemin + query, sans fragment', () => {
    const url = new URL('https://owwomenscup.fr/api/auth/cb?code=1&s=2#frag');
    expect(buildUpstreamUrl(DEFAULT_API_PROXY_ORIGIN, url)).toBe(
      'https://api.owwomenscup.fr/api/auth/cb?code=1&s=2'
    );
  });
});

describe('buildUpstreamHeaders', () => {
  const meta = {
    secret: SECRET,
    clientIp: '203.0.113.7',
    host: 'owwomenscup.fr',
  };

  it('copie les en-têtes métier, retire hop-by-hop et host', () => {
    const out = buildUpstreamHeaders(
      new Headers({
        cookie: 'sb-a=1; tenant=x',
        authorization: 'Bearer t',
        'content-type': 'application/json',
        host: 'owwomenscup.fr',
        connection: 'keep-alive, X-Custom-Hop',
        'keep-alive': 'timeout=5',
        'x-custom-hop': 'drop-me',
        te: 'trailers',
        upgrade: 'h2c',
        'proxy-authorization': 'Basic x',
        'transfer-encoding': 'chunked',
      }),
      meta
    );
    expect(out.get('cookie')).toBe('sb-a=1; tenant=x');
    expect(out.get('authorization')).toBe('Bearer t');
    expect(out.get('content-type')).toBe('application/json');
    for (const name of [
      'host',
      'connection',
      'keep-alive',
      'x-custom-hop',
      'te',
      'upgrade',
      'proxy-authorization',
      'transfer-encoding',
    ]) {
      expect(out.has(name), name).toBe(false);
    }
  });

  it('remplace tout X-Owwc-* client par les valeurs du relais', () => {
    const out = buildUpstreamHeaders(
      new Headers({
        'X-Owwc-Edge': 'forged',
        'x-owwc-client-ip': '1.1.1.1',
        'X-OWWC-Host': 'evil.example',
        'x-owwc-other': 'nope',
      }),
      meta
    );
    expect(out.get('x-owwc-edge')).toBe(SECRET);
    expect(out.get('x-owwc-client-ip')).toBe('203.0.113.7');
    expect(out.get('x-owwc-host')).toBe('owwomenscup.fr');
    expect(out.has('x-owwc-other')).toBe(false);
  });

  it('force accept-encoding: identity', () => {
    const out = buildUpstreamHeaders(
      new Headers({ 'accept-encoding': 'gzip, br' }),
      meta
    );
    expect(out.get('accept-encoding')).toBe('identity');
  });

  it("omet l'IP client si absente ou invalide", () => {
    expect(
      buildUpstreamHeaders(new Headers(), { ...meta, clientIp: undefined }).has(
        'x-owwc-client-ip'
      )
    ).toBe(false);
    expect(
      buildUpstreamHeaders(new Headers(), { ...meta, clientIp: 'a\nb' }).has(
        'x-owwc-client-ip'
      )
    ).toBe(false);
  });
});

describe('buildDownstreamHeaders', () => {
  it('garde chaque Set-Cookie séparé (dates Expires avec virgule)', () => {
    const upstream = new Headers();
    upstream.append(
      'set-cookie',
      'sb-access=a; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT; HttpOnly'
    );
    upstream.append('set-cookie', 'tenant=b; Path=/; SameSite=Lax');
    upstream.append('set-cookie', 'oauth_state=; Max-Age=0');
    const out = buildDownstreamHeaders(upstream);
    expect(out.getSetCookie()).toEqual([
      'sb-access=a; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT; HttpOnly',
      'tenant=b; Path=/; SameSite=Lax',
      'oauth_state=; Max-Age=0',
    ]);
  });

  it('conserve Cache-Control, Location, content-length ; retire hop-by-hop', () => {
    const out = buildDownstreamHeaders(
      new Headers({
        'cache-control': 'private, no-store',
        location: 'https://discord.com/oauth2/authorize?x=1',
        'content-type': 'application/json',
        'content-length': '42',
        connection: 'close',
        'transfer-encoding': 'chunked',
        'keep-alive': 'timeout=5',
      })
    );
    expect(out.get('cache-control')).toBe('private, no-store');
    expect(out.get('location')).toBe(
      'https://discord.com/oauth2/authorize?x=1'
    );
    expect(out.get('content-length')).toBe('42');
    expect(out.has('connection')).toBe(false);
    expect(out.has('transfer-encoding')).toBe(false);
    expect(out.has('keep-alive')).toBe(false);
  });

  it("retire content-length si l'amont a compressé malgré identity", () => {
    const out = buildDownstreamHeaders(
      new Headers({ 'content-encoding': 'gzip', 'content-length': '10' })
    );
    expect(out.get('content-encoding')).toBe('gzip');
    expect(out.has('content-length')).toBe(false);
  });
});

describe('petits prédicats', () => {
  it('methodHasBody', () => {
    expect(methodHasBody('GET')).toBe(false);
    expect(methodHasBody('head')).toBe(false);
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(methodHasBody(m), m).toBe(true);
    }
  });
  it('isNullBodyStatus', () => {
    expect([101, 204, 205, 304].every(isNullBodyStatus)).toBe(true);
    expect([200, 302, 404, 502].some(isNullBodyStatus)).toBe(false);
  });
  it('upstreamUnavailableResponse', async () => {
    const res = upstreamUnavailableResponse();
    expect(res.status).toBe(502);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'Upstream unavailable' });
  });
});
