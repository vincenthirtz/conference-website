// scripts/worker-routes-check.mjs — le relais vers le Worker de l'API, après un déploiement
// (.github/workflows/cloudflare.yml). Doc : docs/API-WORKER.md. Résumé dans $GITHUB_STEP_SUMMARY.
//
// Lit la configuration de production (wrangler.jsonc) et vérifie sur le vrai site :
//   1. chaque route de READ_ROUTES servie par le Worker, même statut en appel direct sur
//      api.owwomenscup.fr, et CloudFront nulle part : le serveur est éteint ;
//   2. un faux jeton ou une fausse clé refusés par le Worker, sans serveur derrière ;
//   3. les écritures là où elles doivent être, sans en faire aucune : anonymes, ou corps refusé ;
//   4. avec CRON_SECRET : la double authentification exigée sur le Worker comme le dit
//      wrangler.jsonc (un Worker qui ne l'exigerait pas ne se verrait autrement pas), et aucune
//      note envoyée vers le serveur.
//
// N'écrit rien en base, et n'a besoin d'aucun compte. Dépôt public : n'affiche que des chemins et
// des statuts, jamais un corps ni un secret.
//
// Usage : node scripts/worker-routes-check.mjs

import { appendFileSync, readFileSync } from 'node:fs';

const SITE = 'https://owwomenscup.fr';
const API = 'https://api.owwomenscup.fr';
const UUID = '33333333-3333-4333-8333-333333333333';
const SECRET = process.env.CRON_SECRET?.trim();
const JSON_BODY = { 'content-type': 'application/json' };

const { vars } = JSON.parse(
  readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, '')
);

/**
 * Les lectures de l'API à appeler. Chemins exacts, `:id` = un UUID, `*` en dernier = une
 * route de cette famille. À compléter quand une route publique ou sensible apparaît.
 */
const READ_ROUTES = [
  '/api/health',
  '/api/seasonal-logo',
  '/api/leagues',
  '/api/leagues/*',
  '/api/public/tcg/live',
  '/api/public/openapi',
  '/api/public/v1/*',
  '/api/news',
  '/api/news/rss',
  '/api/news/comments',
  '/api/teams',
  '/api/teams/:id',
  '/api/team/:id/stats',
  '/api/team/:id/maps',
  '/api/tournaments',
  '/api/tournaments/:id/prize-pool',
  '/api/tournaments/:id/mvp-leaderboard',
  '/api/tournament/:id/calendar.ics',
  '/api/tournament/:id/qr',
  '/api/players/leaderboard',
  '/api/player/notifications',
  '/api/player/dashboard',
  '/api/player/progression',
  '/api/player/team',
  '/api/player/matches',
  '/api/player/next-match',
  '/api/admin/*',
  '/api/cast/:id',
  '/api/caster/v1/*',
  '/api/caster/matches/:id',
  '/api/caster/tournaments',
  '/api/caster/tournaments/:id/maps',
  '/api/caster/tournaments/:id/matches',
  '/api/bot/v1/*',
  '/api/site-settings',
  '/api/partners',
  '/api/cast-members',
  '/api/maps/stats',
  '/api/games/*',
  '/api/scrims',
  '/api/scrims/ladder',
  '/api/scrims/:id',
  '/api/players/:id/profile',
  '/api/public/free-players',
  '/api/public/team-openings',
  '/api/public/webhook-events',
  '/api/docs',
  '/api/tcg/*',
  '/api/twitch-channels',
  '/api/twitch/live',
  '/api/blizzard-news',
  '/api/blizzard-media',
  '/api/patch-notes',
  '/api/tournament/:id/maps',
  '/api/tournament/:id/pool',
  '/api/player/agenda.ics',
  '/api/player/agenda',
  '/api/player/agenda/subscription',
  '/api/player/battlenet-status',
  '/api/player/hero-preferences',
  '/api/player/messages',
  '/api/player/messages/:id',
  '/api/player/my-teams',
  '/api/player/network-status',
  '/api/player/scouting',
  '/api/player/team-health',
  '/api/player/team-reviews',
  '/api/player/team-rhythm',
  '/api/player/teams-directory',
  '/api/player/twitch-status',
  '/api/player/update-profile',
  '/api/player/discovery',
  '/api/player/discovery/head-to-head',
  '/api/player/discovery/profile',
  '/api/player/discovery/search',
  '/api/player/follows',
  '/api/player/invitations',
  '/api/player/matches/:id',
  '/api/player/predictions',
  '/api/player/predictions/leaderboard',
  '/api/player/predictions/:id',
  '/api/player/push/prefs',
  '/api/player/realtime/ticket',
  '/api/player/scrims',
  '/api/player/tcg/collection',
  '/api/player/tcg/cosmetics',
  '/api/player/tcg/exclusion',
  '/api/player/tcg/fanart',
  '/api/player/tcg/packs',
  '/api/player/tcg/photo',
  '/api/player/tcg/sets',
  '/api/player/tcg/showcase',
  '/api/player/tcg/wallet',
  '/api/player/tcg/welcome-gift',
  '/api/player/tcg/trades',
  '/api/player/tcg/trades/blocks',
  '/api/player/tcg/trades/cards',
  '/api/player/tcg/trades/partners',
  '/api/player/tcg/trades/settings',
  '/api/teams/join-requests',
  '/api/teams/member-permissions',
  '/api/teams/opening',
  '/api/teams/scrim-requests',
  '/api/teams/scrim-searches',
  '/api/teams/search-players',
  '/api/teams/transfer-requests',
  '/api/teams/invitations',
  '/api/teams/invite-links',
  '/api/teams/matches/:id/lineup',
  '/api/teams/scrim-plannings',
  '/api/teams/scrim-plannings/:id',
  '/api/teams/scrim-plannings/:id/suggest',
  '/api/overlay/alerts',
  '/api/overlay/day',
  '/api/overlay/donations',
  '/api/overlay/scrim-result',
  '/api/overlay/scrims',
  '/api/overlay/standings',
  '/api/overlay/match/:id',
  '/api/overlay/match/next',
  '/api/overlay/tcg/*',
  '/api/overlay/mvp-public',
  '/api/overlay/match/:id/stats',
  '/api/player/data-export',
  '/api/og/*',
  '/api/auth/*',
  '/api/captcha',
  '/api/checkin/*',
  '/api/caster/me',
  '/api/caster/briefing/:id',
  '/api/demandes/*',
  '/api/discord/*',
  '/api/email/unsubscribe',
  '/api/graphql',
  '/api/helloasso/*',
  '/api/invitations/*',
  '/api/onboard/*',
  '/api/public/newsletter/confirm',
  '/api/public/free-players/remove',
  '/api/public/free-players/renew',
  '/api/public/team-openings/remove',
  '/api/partnership-requests',
  '/api/team-openings/contact',
  '/api/teams/free-players',
  '/api/teams/invitations/by-token',
  '/api/teams/invite-links/by-token',
  '/api/twitch/oauth-callback',
  '/api/twitch/broadcaster-callback',
  '/api/matches/:id',
  '/api/matches/:id/games',
  '/api/matches/:id/drafts/*',
  '/api/player/library/*',
];

/** Une famille large : une route qui existe, pas seulement un chemin inconnu. */
const WIDE = {
  '/api/admin/*': '/api/admin/me',
  '/api/bot/v1/*': '/api/bot/v1/role-sync/snapshot',
  '/api/tcg/*': '/api/tcg/hero/v1/freja.svg',
  '/api/games/*': '/api/games/overwatch/heroes',
  '/api/public/v1/*': '/api/public/v1/tournaments',
  '/api/leagues/*': '/api/leagues/controle-inexistant',
  '/api/overlay/tcg/*': '/api/overlay/tcg/controle-inexistant',
  '/api/caster/v1/*': '/api/caster/v1/tournaments',
  '/api/auth/*': '/api/auth/battlenet/available',
  '/api/demandes/*': '/api/demandes/join',
};
const concrete = (route) =>
  (WIDE[route] ?? route).replaceAll(':id', UUID).replace(/\/\*$/, '/x');

const onServer = (res) =>
  /cloudfront/i.test(res.headers.get('via') ?? '') ||
  res.headers.has('x-amz-cf-pop');

async function hit(base, path, init = {}) {
  const res = await fetch(base + path, {
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
    ...init,
  });
  await res.arrayBuffer();
  return { status: res.status, server: onServer(res) };
}

async function pool(items, size, fn) {
  const out = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

const md = [];
let bad = 0;
function section(title) {
  console.log(`--- ${title}`);
  md.push('', `## ${title}`, '');
}
function report(ok, line) {
  if (!ok) bad += 1;
  console.log(`${ok ? 'OK   ' : 'ECART'} ${line}`);
  md.push(`- ${ok ? '✅' : '❌'} ${line}`);
}
function reportMany(label, lines) {
  const wrong = lines.filter(Boolean);
  if (wrong.length === 0) {
    report(true, `${label} : ${lines.length} sur ${lines.length}`);
    return;
  }
  for (const line of wrong) report(false, line);
}

section('Servi par le Worker, même statut en appel direct');
const reads = [...new Set(READ_ROUTES.map(concrete))];
reportMany(
  'lectures',
  await pool(reads, 6, async (path) => {
    const relayed = await hit(SITE, path);
    const direct = await hit(API, path);
    if (!relayed.server && !direct.server && relayed.status === direct.status) {
      return null;
    }
    return `${path.replaceAll(UUID, ':id')} : relais ${relayed.status}${relayed.server ? ' par le serveur' : ''}, direct ${direct.status}${direct.server ? ' par le serveur' : ''}`;
  })
);

section('Refus par le Worker, sans serveur derrière');
const fakeBearer = {
  authorization: 'Bearer controle-jeton-volontairement-faux',
};
const fakeKey = { 'x-api-key': 'controle-cle-volontairement-fausse' };
for (const [path, headers] of [
  ['/api/admin/me', fakeBearer],
  ['/api/admin/users/manage', fakeBearer],
  ['/api/player/tcg/wallet', fakeBearer],
  ['/api/bot/v1/role-sync/snapshot', fakeKey],
  // Une inspection du staff, longtemps gardée au serveur.
  [`/api/admin/teams?as=${UUID}`, fakeBearer],
]) {
  const got = await hit(SITE, path, { headers });
  report(
    got.status === 401 && !got.server,
    `${path.replaceAll(UUID, ':id')} : ${got.status}, ${got.server ? 'par le serveur' : 'Worker'}`
  );
}

section('Écritures, sans en faire aucune');
const write = (method, headers = {}) => ({
  method,
  headers: { ...JSON_BODY, ...headers },
  body: '{}',
});
// Anonymes, ou un corps refusé avant toute écriture.
const WRITE_SAMPLES = [
  ['POST', '/api/bot/v1/role-sync/presence'],
  ['POST', '/api/overlay/heartbeat'],
  ['POST', '/api/player/tcg/trades'],
  ['PUT', '/api/player/team-reviews'],
  ['POST', '/api/player/agenda/subscription'],
  ['POST', '/api/teams/leave'],
  ['POST', '/api/demandes/join'],
  ['POST', `/api/tournament/${UUID}/pool`],
  ['PATCH', '/api/admin/me'],
  ['POST', '/api/admin/news'],
  ['PUT', `/api/admin/matches/${UUID}`],
  ['POST', '/api/public/free-players'],
  ['POST', '/api/public/newsletter/subscribe'],
  ['POST', '/api/contact'],
  ['POST', '/api/news'],
  ['POST', '/api/support/ticket'],
  ['POST', '/api/auth/register'],
  ['POST', '/api/auth/forgot-password'],
  ['POST', '/api/webhooks/twitch/alerts'],
  ['POST', '/api/helloasso/webhook'],
];
for (const [method, path] of WRITE_SAMPLES) {
  const got = await hit(SITE, path, write(method));
  report(
    !got.server && got.status < 500,
    `${method} ${path.replaceAll(UUID, ':id')} : ${got.status}, ${got.server ? 'serveur' : 'Worker'}`
  );
}

section('CSRF d’une écriture à cookie');
// Sans Bearer : l'origine est comparée à l'hôte de la visiteuse, qui doit survivre au relais.
const sameOrigin = await hit(
  SITE,
  '/api/admin/news',
  write('POST', { origin: SITE })
);
report(
  sameOrigin.status === 401,
  `origine du site : ${sameOrigin.status}, attendu 401`
);
const otherOrigin = await hit(
  SITE,
  '/api/admin/news',
  write('POST', { origin: 'https://controle.invalid' })
);
report(
  otherOrigin.status === 403,
  `autre origine : ${otherOrigin.status}, attendu 403`
);

if (SECRET) {
  section('Réglages sur le Worker');
  const config = await fetch(`${SITE}/api/health`, {
    headers: { authorization: `Bearer ${SECRET}` },
    signal: AbortSignal.timeout(30_000),
  })
    .then((res) => res.json())
    .then((body) => body.config ?? null);
  if (!config) {
    report(false, 'réglages illisibles sur /api/health');
  } else {
    const wanted = vars.STAFF_MFA_ENFORCED === 'true';
    report(
      config.staffMfaEnforced === wanted,
      `double authentification : ${config.staffMfaEnforced ? 'exigée' : 'pas exigée'} sur le Worker, ${wanted ? 'exigée' : 'pas exigée'} dans wrangler.jsonc`
    );
    report(!config.signalBridgeToServer, 'aucune note envoyée vers le serveur');
    console.log(`comptes exemptés : ${config.staffMfaExemptions}`);
  }
} else if (process.env.CI) {
  report(false, 'CRON_SECRET absent : réglages non contrôlés');
} else {
  console.log('CRON_SECRET absent : réglages non contrôlés (hors CI).');
}

md.push(
  '',
  bad === 0 ? '**Tout est conforme.**' : `**${bad} contrôle(s) en écart.**`,
  ''
);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    ['# Relais vers le Worker de l’API', ...md].join('\n')
  );
}
console.log(bad === 0 ? 'Tout est conforme.' : `${bad} contrôle(s) en écart.`);
process.exit(bad === 0 ? 0 : 1);
