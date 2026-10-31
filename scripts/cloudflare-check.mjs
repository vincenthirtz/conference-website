// scripts/cloudflare-check.mjs — contrôle du site servi par le Worker
// Cloudflare après un déploiement (.github/workflows/cloudflare.yml).
// Doc : docs/CLOUDFLARE.md. Écrit un résumé dans $GITHUB_STEP_SUMMARY.
//
// 1. Pages, au navigateur : CSP à nonce posée par proxy.ts (nouvelle à chaque
//    requête), JS démarré (hydratation), aucun script inline, <title> rendu,
//    aucune violation CSP ni erreur JS. Inclut la 404 d'un tournoi inexistant
//    (getStaticProps → notFound), qui doit être LA NÔTRE, pas celle de Next.
//    Et un vrai article, généré dans le Worker (`fallback: 'blocking'`).
// 2. Relais /api/* : une route publique et une route admin sans session
//    relayées vers l'API (réponse CloudFront), /api/internal servi sur place.
// 3. En-têtes des fichiers statiques (cloudflare/_headers) ; Cache-Control
//    des pages ISR au navigateur ; sur owwomenscup.fr, redirections www et
//    http:// (cloudflare/responses.ts), et le logo par défaut des équipes
//    (adresse complète de notre domaine) accepté par l'optimiseur d'images.
// 4. *.workers.dev : X-Robots-Tag noindex.
//
// Usage : node scripts/cloudflare-check.mjs <url-du-worker>

import { appendFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? '').replace(/\/+$/, '');
if (!base) {
  console.error('Usage : node scripts/cloudflare-check.mjs <url-du-worker>');
  process.exit(2);
}

const MISSING_TOURNAMENT = '/tournament/controle-cloudflare-inexistant';
const PAGES = [
  '/',
  '/mentions-legales',
  '/tcg',
  '/palmares',
  '/organisateurs',
  '/login',
  '/admin',
  '/overlay/day',
  '/overlay/match/next?tournament=x&source=maps',
  '/tournament/ow-womens-cup-2026',
  '/team/chocomates',
  MISSING_TOURNAMENT,
  '/404-nexiste-pas',
];
const NEXT_DEFAULT_404 = 'This page could not be found';

const md = [];
let bad = 0;
const check = (ok, label, detail = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

async function waitForWorker() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`${base}/mentions-legales`);
      if (r.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('Worker injoignable après 2 min 30');
}

async function pageHeaders(path) {
  const r1 = await fetch(base + path, { redirect: 'manual' });
  const csp = r1.headers.get('content-security-policy') ?? '';
  const html = r1.status < 300 || r1.status === 404 ? await r1.text() : '';
  const r2 = await fetch(base + path, { redirect: 'manual' });
  await r2.arrayBuffer();
  const nonce = (h) => (h.match(/'nonce-([^']+)'/) ?? [])[1];
  const n1 = nonce(csp);
  const n2 = nonce(r2.headers.get('content-security-policy') ?? '');
  return {
    status: r1.status,
    csp: Boolean(csp),
    nonceRotates: Boolean(n1 && n2 && n1 !== n2),
    // Next écrit `<title data-next-head="">`. Une redirection n'a pas de titre.
    title:
      r1.status >= 300 && r1.status < 400
        ? true
        : /<title[^>]*>[^<]+<\/title>/.test(html),
    nextDefault404: html.includes(NEXT_DEFAULT_404),
    robots: r1.headers.get('x-robots-tag') ?? '',
  };
}

await waitForWorker();

// Un vrai article : aucune page de la liste ne passait par ce chemin, et tous ont
// répondu 500 pendant trois jours sans que ce contrôle le voie (2026-10-28 → 31).
const newsResponse = await fetch(`${base}/api/news?limit=1`);
const newsSlug = newsResponse.ok
  ? (await newsResponse.json()).items?.[0]?.slug
  : null;
check(
  Boolean(newsSlug),
  'un article à contrôler',
  newsSlug ?? `/api/news → ${newsResponse.status}`
);
if (newsSlug) PAGES.push(`/news/${newsSlug}`);

// 1. Pages
md.push(
  '## Pages',
  '',
  '| Page | HTTP | CSP + nonce | `<title>` | JS démarré | Inline | Violations CSP | Erreurs JS |',
  '|---|---|---|---|---|---|---|---|'
);
const browser = await chromium.launch();
let robotsHeader = '';
for (const path of PAGES) {
  const h = await pageHeaders(path);
  if (path === '/') robotsHeader = h.robots;
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const cspViolations = [];
  const errs = [];
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text()))
      cspViolations.push(m.text().slice(0, 160));
  });
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  let status = 0;
  try {
    const r = await page.goto(base + path, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    status = r ? r.status() : 0;
  } catch (e) {
    errs.push(`navigation : ${String(e.message).split('\n')[0]}`);
  }
  await page.waitForTimeout(4000);
  const s = await page
    .evaluate(() => ({
      router: !!(window.next && window.next.router),
      inline: [...document.querySelectorAll('script:not([src])')].filter(
        (x) => !x.type || x.type === 'text/javascript'
      ).length,
    }))
    .catch(() => ({ router: false, inline: -1 }));
  await page.close();
  const expect404 = path === MISSING_TOURNAMENT || path === '/404-nexiste-pas';
  const statusOk = expect404 ? status === 404 : status === 200;
  const ok =
    statusOk &&
    h.csp &&
    h.nonceRotates &&
    h.title &&
    !h.nextDefault404 &&
    s.router &&
    s.inline === 0 &&
    cspViolations.length === 0 &&
    errs.length === 0;
  check(
    ok,
    `${path} → ${status}`,
    ok
      ? ''
      : `CSP ${h.csp} | nonce ${h.nonceRotates} | title ${h.title} | 404 Next par défaut ${h.nextDefault404} | hydraté ${s.router} | inline ${s.inline} | ${[...cspViolations, ...errs].slice(0, 2).join(' / ')}`
  );
  md.push(
    `| ${ok ? '✅' : '❌'} \`${path}\` | ${status} | ${h.csp && h.nonceRotates ? 'oui' : 'NON'} | ${h.title ? 'oui' : 'NON'} | ${s.router ? 'oui' : 'NON'} | ${s.inline} | ${cspViolations.length} | ${errs.length}${h.nextDefault404 ? ' (404 de Next !)' : ''} |`
  );
}
await browser.close();

// 2. Relais /api/*
md.push(
  '',
  '## Relais /api/*',
  '',
  '| Chemin | HTTP | Servi par | Attendu |',
  '|---|---|---|---|'
);
for (const c of [
  { path: '/api/captcha', relayed: true, status: 200 },
  { path: '/api/admin/me', relayed: true, status: 401 },
  { path: '/api/internal/revalidate', relayed: false },
]) {
  const r = await fetch(base + c.path, { redirect: 'manual' });
  await r.arrayBuffer();
  const viaApi =
    /cloudfront/i.test(r.headers.get('via') ?? '') ||
    r.headers.has('x-amz-cf-pop');
  const ok =
    viaApi === c.relayed && (c.status === undefined || r.status === c.status);
  check(
    ok,
    `${c.path} → ${r.status}`,
    viaApi ? 'servi par l’API' : 'servi par le Worker'
  );
  md.push(
    `| ${ok ? '✅' : '❌'} \`${c.path}\` | ${r.status} | ${viaApi ? 'API (CloudFront)' : 'Worker'} | ${c.relayed ? 'API' : 'Worker'}${c.status ? `, ${c.status}` : ''} |`
  );
}

// 3. Fichiers statiques
md.push(
  '',
  '## Fichiers statiques',
  '',
  '| Fichier | Cache-Control | Attendu |',
  '|---|---|---|'
);
const home = await (await fetch(`${base}/`)).text();
const chunk = home.match(/\/_next\/static\/[^"']+\.js/)?.[0];
for (const c of [
  {
    path: chunk ?? '/_next/static/introuvable.js',
    want: /immutable/,
    label: 'immutable',
  },
  { path: '/turbopack-bootstrap.js', want: /immutable/, label: 'immutable' },
  {
    path: '/sw.js',
    want: /no-cache/,
    label: 'no-cache + Service-Worker-Allowed',
    swa: true,
  },
]) {
  const r = await fetch(base + c.path);
  await r.arrayBuffer();
  const cc = r.headers.get('cache-control') ?? '';
  const ok =
    r.status === 200 &&
    c.want.test(cc) &&
    (!c.swa || r.headers.get('service-worker-allowed') === '/');
  check(ok, `${c.path} → ${r.status}`, cc);
  md.push(`| ${ok ? '✅' : '❌'} \`${c.path}\` | \`${cc}\` | ${c.label} |`);
}

// 3 bis. Cache des pages au navigateur (cloudflare/responses.ts) : une page ISR
// et ses données `/_next/data` doivent dire « toujours redemander », comme
// sur Netlify — jamais `stale-while-revalidate`.
md.push(
  '',
  '## Cache des pages (navigateur)',
  '',
  '| Chemin | Cache-Control | Attendu |',
  '|---|---|---|'
);
const buildId = home.match(/"buildId":"([^"]+)"/)?.[1] ?? 'introuvable';
for (const path of [
  '/tournament/ow-womens-cup-2026',
  `/_next/data/${buildId}/tcg.json`,
]) {
  const r = await fetch(base + path);
  await r.arrayBuffer();
  const cc = r.headers.get('cache-control') ?? '';
  const ok =
    r.status === 200 &&
    /max-age=0/.test(cc) &&
    /must-revalidate/.test(cc) &&
    !/stale-while-revalidate/.test(cc);
  check(ok, `${path} → ${r.status}`, cc);
  md.push(
    `| ${ok ? '✅' : '❌'} \`${path}\` | \`${cc}\` | max-age=0, must-revalidate |`
  );
}

// 3 ter. Redirections du domaine (seulement une fois le domaine sur le Worker).
if (new URL(base).hostname === 'owwomenscup.fr') {
  md.push('', '## Redirections du domaine', '');
  for (const [from, to] of [
    ['https://www.owwomenscup.fr/tcg?x=1', 'https://owwomenscup.fr/tcg?x=1'],
    ['http://owwomenscup.fr/tcg', 'https://owwomenscup.fr/tcg'],
  ]) {
    const r = await fetch(from, { redirect: 'manual' });
    await r.arrayBuffer();
    const ok = r.status === 301 && r.headers.get('location') === to;
    check(ok, `${from} → ${r.status}`, r.headers.get('location') ?? '');
    md.push(
      `- ${ok ? '✅' : '❌'} \`${from}\` → ${r.status} \`${r.headers.get('location') ?? ''}\``
    );
  }

  // Le logo par défaut des équipes (utils/teams/defaultTeamLogo.ts) : une
  // adresse complète de notre domaine, que l'optimiseur refusait en 400.
  const logo = 'https://owwomenscup.fr/img/logos/2026-logo.png';
  const logoPath = `/_next/image?url=${encodeURIComponent(logo)}&w=64&q=75`;
  const logoRes = await fetch(base + logoPath);
  await logoRes.arrayBuffer();
  const logoType = logoRes.headers.get('content-type') ?? '';
  const logoOk = logoRes.status === 200 && logoType.startsWith('image/');
  check(logoOk, `logo par défaut optimisé → ${logoRes.status}`, logoType);
  md.push(
    `- ${logoOk ? '✅' : '❌'} logo par défaut par l'optimiseur → ${logoRes.status} \`${logoType}\``
  );
}

// 4. Indexation de l'adresse technique
if (new URL(base).hostname.endsWith('.workers.dev')) {
  const ok = /noindex/.test(robotsHeader);
  check(ok, 'X-Robots-Tag sur *.workers.dev', robotsHeader || 'absent');
  md.push(
    '',
    `**X-Robots-Tag (workers.dev)** : ${ok ? '✅' : '❌'} \`${robotsHeader || 'absent'}\``
  );
}

md.push(
  '',
  bad === 0 ? '**Tout est conforme.**' : `**${bad} contrôle(s) en écart.**`,
  ''
);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    [`# Contrôles — ${base}`, '', ...md].join('\n')
  );
}
process.exit(bad === 0 ? 0 : 1);
