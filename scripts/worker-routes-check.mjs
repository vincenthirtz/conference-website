// scripts/worker-routes-check.mjs — le relais vers le Worker de l'API, après un déploiement
// (.github/workflows/cloudflare.yml). Doc : docs/API-WORKER.md. Résumé dans $GITHUB_STEP_SUMMARY.
//
// Lit la configuration de production (wrangler.jsonc) et vérifie sur le vrai site :
//   1. chaque route d'API_WORKER_ROUTES servie par le Worker, même statut en appel direct sur
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
const list = (name) =>
  (vars[name] ?? '')
    .split(',')
    .map((route) => route.trim())
    .filter(Boolean);

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
const reads = [...new Set(list('API_WORKER_ROUTES').map(concrete))];
reportMany(
  'lectures',
  await pool(reads, 6, async (path) => {
    const relayed = await hit(SITE, path);
    const direct = await hit(API, path);
    if (
      !relayed.server &&
      !direct.server &&
      relayed.status === direct.status
    ) {
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
    report(
      !config.signalBridgeToServer,
      'aucune note envoyée vers le serveur'
    );
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
