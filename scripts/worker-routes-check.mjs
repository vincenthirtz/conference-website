// scripts/worker-routes-check.mjs — le relais vers le Worker de l'API, après un déploiement
// (.github/workflows/cloudflare.yml). Doc : docs/API-WORKER.md. Résumé dans $GITHUB_STEP_SUMMARY.
//
// Lit la configuration de production (wrangler.jsonc) et vérifie sur le vrai site :
//   1. chaque route d'API_WORKER_ROUTES servie par le Worker, même statut que le serveur ;
//   2. chaque route d'API_WORKER_SERVER_ONLY restée au serveur, identifiant non-UUID compris ;
//   3. un faux jeton ou une fausse clé rejoués sur le serveur, sauf ce qui ne se rejoue jamais ;
//   4. les écritures là où elles doivent être, sans en faire aucune : anonymes, ou corps refusé ;
//   5. avec CRON_SECRET : le pont des signaux dans les deux sens, et les mêmes réglages sur le
//      serveur et le Worker (un Worker qui n'exigerait pas la double authentification ne se
//      verrait autrement pas).
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

/** Un démarrage à froid peut tomber sur le repli : une seconde chance avant de conclure. */
async function hitUntil(path, wanted, init) {
  let got = await hit(SITE, path, init);
  if (!wanted(got)) {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    got = await hit(SITE, path, init);
  }
  return got;
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

section('Servi par le Worker, même statut que le serveur');
const reads = [...new Set(list('API_WORKER_ROUTES').map(concrete))];
reportMany(
  'lectures',
  await pool(reads, 6, async (path) => {
    const got = await hitUntil(path, (r) => !r.server);
    const server = await hit(API, path);
    const same = got.status === server.status;
    if (!got.server && same) return null;
    return `${path.replaceAll(UUID, ':id')} : ${got.status} ${got.server ? 'par le serveur' : 'Worker'}, serveur ${server.status}`;
  })
);

section('Reste au serveur');
const serverOnly = list('API_WORKER_SERVER_ONLY');
reportMany(
  'liste de refus',
  await pool(serverOnly, 6, async (route) => {
    const got = await hit(SITE, concrete(route));
    return got.server ? null : `${route} : ${got.status} par le Worker`;
  })
);
// Dans la liste de refus, `:id` couvre n'importe quel segment.
for (const route of serverOnly.filter((r) => r.includes(':id')).slice(0, 3)) {
  const path = route.replaceAll(':id', 'controle-pas-un-uuid');
  const got = await hit(SITE, path);
  report(
    got.server,
    `${path} : ${got.status}, ${got.server ? 'serveur' : 'Worker'}`
  );
}

section('Refus : rejoué sur le serveur, sauf ce qui ne se rejoue jamais');
const fakeBearer = {
  authorization: 'Bearer controle-jeton-volontairement-faux',
};
const fakeKey = { 'x-api-key': 'controle-cle-volontairement-fausse' };
for (const [path, headers] of [
  ['/api/admin/me', fakeBearer],
  ['/api/player/tcg/wallet', fakeBearer],
  ['/api/bot/v1/role-sync/snapshot', fakeKey],
]) {
  const got = await hit(SITE, path, { headers });
  report(
    got.status === 401 && got.server,
    `${path} : ${got.status}, ${got.server ? 'rejoué sur le serveur' : 'pas rejoué'}`
  );
}
for (const path of list('API_WORKER_UNREPLAYABLE_READS')) {
  const got = await hit(SITE, path, { headers: fakeKey });
  report(
    got.status === 401 && !got.server,
    `${path} : ${got.status}, ${got.server ? 'REJOUÉ' : 'Worker, sans repli'}`
  );
}

section('Écritures, sans en faire aucune');
const write = (method) => ({ method, headers: JSON_BODY, body: '{}' });
for (const [method, path, status] of [
  ['POST', '/api/bot/v1/role-sync/presence', 401],
  ['POST', '/api/overlay/heartbeat', 400],
]) {
  const got = await hit(SITE, path, write(method));
  report(
    got.status === status && !got.server,
    `${method} ${path} : ${got.status}, ${got.server ? 'par le serveur' : 'Worker'}`
  );
}
for (const [method, path] of [
  ['PATCH', '/api/admin/me'],
  ['POST', '/api/player/tcg/trades'],
  ['POST', '/api/public/free-players'],
  ['POST', '/api/news'],
]) {
  const got = await hit(SITE, path, write(method));
  report(
    got.server,
    `${method} ${path} : ${got.status}, ${got.server ? 'serveur' : 'par le Worker'}`
  );
}

section('Pont des signaux');
const noteBody = JSON.stringify({
  notes: [{ name: 'deploy.check', atMs: Date.now() }],
});
const toWorker = `${SITE}/api/signals/notes`;
const toServer = `${API}/api/internal/signal-notes`;
const post = (url, headers = {}) =>
  fetch(url, {
    method: 'POST',
    headers: { ...JSON_BODY, ...headers },
    body: noteBody,
    signal: AbortSignal.timeout(30_000),
  }).then((res) => res.status);
report((await post(toWorker)) === 401, 'Worker : refusé sans le secret');
report((await post(toServer)) === 401, 'serveur : refusé sans le secret');

if (SECRET) {
  const bearer = { authorization: `Bearer ${SECRET}` };
  const worker = await post(toWorker, bearer);
  report(worker === 204, `serveur → Worker : ${worker}`);
  const server = await post(toServer, bearer);
  report(server === 204, `Worker → serveur : ${server}`);

  section('Mêmes réglages sur le serveur et le Worker');
  const config = (base) =>
    fetch(`${base}/api/health`, {
      headers: bearer,
      signal: AbortSignal.timeout(30_000),
    })
      .then((res) => res.json())
      .then((body) => body.config ?? null);
  const [onWorker, onTheServer] = await Promise.all([
    config(SITE),
    config(API),
  ]);
  if (!onWorker || !onTheServer) {
    report(false, 'réglages illisibles sur /api/health');
  } else {
    report(
      onWorker.staffMfaEnforced === onTheServer.staffMfaEnforced,
      `double authentification : ${onWorker.staffMfaEnforced ? 'exigée' : 'pas exigée'} sur le Worker, ${onTheServer.staffMfaEnforced ? 'exigée' : 'pas exigée'} sur le serveur`
    );
    report(
      onWorker.staffMfaExemptions === onTheServer.staffMfaExemptions,
      `comptes exemptés : ${onWorker.staffMfaExemptions} sur le Worker, ${onTheServer.staffMfaExemptions} sur le serveur`
    );
    report(onTheServer.signalBridgeToWorker, 'pont branché sur le serveur');
    report(onWorker.signalBridgeToServer, 'pont branché sur le Worker');
  }
} else if (process.env.CI) {
  report(false, 'CRON_SECRET absent : pont et réglages non contrôlés');
} else {
  console.log('CRON_SECRET absent : pont et réglages non contrôlés (hors CI).');
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
