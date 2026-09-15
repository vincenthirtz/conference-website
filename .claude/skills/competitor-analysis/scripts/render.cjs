#!/usr/bin/env node
// render.cjs <url-de-base> <dossier-collecte> [--max=40] [--delay=1500] [chemin …]
//
// Rend les pages PUBLIQUES comme un visiteur anonyme (navigateur headless) et
// en extrait le texte visible. Indispensable pour les SPA, dont le HTML brut
// est vide.
//
// Sans chemins en argument : les URLs de sitemap-urls.txt (collect.sh), moins
// les pages d'authentification, d'administration et les overlays techniques.
// Sitemap absent ou maigre (< 5 pages) : les liens internes de l'accueil rendu
// complètent la liste (un seul niveau, pas d'exploration du site entier).
//
// Produit dans <dossier-collecte> :
//   pages/<slug>.txt        texte visible, gabarit commun (menu, pied de page) retiré
//   boilerplate.txt         lignes communes retirées (menu, footer…)
//   shots/<slug>.png        captures des 6 premières pages
//   first-load-requests.txt hôtes tiers contactés au 1er chargement, AVANT toute
//                           interaction (indice RGPD : traceurs sans consentement)
//   render-index.tsv        chemin, statut, taille du texte
//
// Politesse : une page à la fois, pause entre les pages, pas de soumission de
// formulaire, pas de clic sur « accepter les cookies ».
//
// Navigateur : Playwright du repo. Si ses navigateurs ne sont pas installés, le
// script cherche un Chromium déjà en cache (~/Library/Caches/ms-playwright ou
// ~/.cache/ms-playwright), puis Google Chrome (channel « chrome »).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const opts = Object.fromEntries(
  args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('='))
);
const [baseArg, outDir, ...explicit] = args.filter((a) => !a.startsWith('--'));
if (!baseArg || !outDir) {
  console.error('usage: render.cjs <url-de-base> <dossier-collecte> [--max=40] [--delay=1500] [chemin …]');
  process.exit(1);
}
const BASE = baseArg.replace(/\/+$/, '');
const MAX = Number(opts.max ?? 40);
const DELAY = Number(opts.delay ?? 1500);
const EXCLUDE = /\/(login|register|signin|signup|connexion|inscription-compte|forgot|reset|update-password|confirmation|callback|admin|dashboard|account|compte|cart|checkout|panier|twitch\/|twitch-visuals|overlay|embed|api\/)/i;

function findBrowser() {
  if (process.env.CHROMIUM_PATH) return { executablePath: process.env.CHROMIUM_PATH };
  const caches = [
    path.join(os.homedir(), 'Library/Caches/ms-playwright'),
    path.join(os.homedir(), '.cache/ms-playwright'),
  ].filter((d) => fs.existsSync(d));
  for (const dir of caches) {
    const entries = fs.readdirSync(dir).filter((e) => /^chromium/.test(e)).sort().reverse();
    for (const e of entries) {
      const stack = [path.join(dir, e)];
      while (stack.length) {
        const d = stack.pop();
        for (const f of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, f.name);
          if (f.isDirectory() && !/\.app$/.test(f.name)) stack.push(p);
          else if (/^(chrome-headless-shell|chrome|Chromium)$/.test(f.name)) return { executablePath: p };
          else if (f.name === 'Chromium.app') return { executablePath: path.join(p, 'Contents/MacOS/Chromium') };
        }
      }
    }
  }
  return null;
}

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    const found = findBrowser();
    if (found) return chromium.launch(found);
    return chromium.launch({ channel: 'chrome' });
  }
}

const slug = (p) => (p === '/' ? '_accueil' : p.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 80));

(async () => {
  let paths = explicit;
  if (!paths.length) {
    const sm = path.join(outDir, 'sitemap-urls.txt');
    const urls = fs.existsSync(sm) ? fs.readFileSync(sm, 'utf8').split('\n').filter(Boolean) : [];
    paths = urls
      .map((u) => { try { return new URL(u).pathname; } catch { return null; } })
      .filter((p) => p && !EXCLUDE.test(p));
    if (!paths.includes('/')) paths.unshift('/');
  }
  // Pages commerciales d'abord : avec --max, ce sont elles qu'on veut à coup sûr.
  const PRIORITY = [
    /^\/$/,
    /tarif|pricing|prix|offre|offer|plans?\b|abonnement|subscription/i,
    /fonctionnalit|feature|produit|product|presentation|decouvrir|about|a-propos|pourquoi|why/i,
    /organisat|organizer|orga\b|club|asso|entreprise|business|partenaire|partner|client|temoign|testimonial|chiffres|stats/i,
    /tournoi|tournament|competition|championship|league|ligue|event|evenement/i,
  ];
  const rank = (p) => {
    const i = PRIORITY.findIndex((re) => re.test(p));
    return i === -1 ? PRIORITY.length : i;
  };
  const order = (list) =>
    [...new Set(list)]
      .sort((a, b) => rank(a) - rank(b) || a.split('/').length - b.split('/').length || a.localeCompare(b))
      .slice(0, MAX);
  const discover = !explicit.length && paths.length < 5;
  paths = order(paths);
  fs.mkdirSync(path.join(outDir, 'pages'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'shots'), { recursive: true });

  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'fr-FR' });
  const baseHost = new URL(BASE).hostname.replace(/^www\./, '');
  const texts = {};
  const index = [];

  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    const page = await context.newPage();
    const thirdParty = new Set();
    if (i === 0) {
      page.on('request', (req) => {
        try {
          const h = new URL(req.url()).hostname;
          if (!h.endsWith(baseHost)) thirdParty.add(h);
        } catch {}
      });
    }
    let status = 'ok';
    try {
      const resp = await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 45_000 });
      status = String(resp?.status() ?? '?');
      await page.waitForTimeout(2500);
      texts[p] = await page.evaluate(() => document.body.innerText);
      if (i === 0 && discover) {
        const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href));
        const found = links
          .map((h) => { try { return new URL(h); } catch { return null; } })
          .filter((u) => u && u.hostname.replace(/^www\./, '') === baseHost && !/\.(pdf|png|jpe?g|svg|zip)$/i.test(u.pathname))
          .map((u) => u.pathname.replace(/\/+$/, '') || '/')
          .filter((q) => !EXCLUDE.test(q));
        const before = paths.length;
        paths = [paths[0], ...order([...paths.slice(1), ...found].filter((q) => q !== paths[0]))].slice(0, MAX);
        console.log(`   sitemap maigre : ${paths.length - before} page(s) ajoutée(s) depuis les liens de l'accueil`);
      }
      if (i < 6) await page.screenshot({ path: path.join(outDir, 'shots', `${slug(p)}.png`) });
      if (i === 0) {
        const hasConsent = /cookie|consentement|accepter|tout refuser|paramétrer/i.test(texts[p].slice(0, 5000));
        fs.writeFileSync(
          path.join(outDir, 'first-load-requests.txt'),
          `# Hôtes tiers contactés au 1er chargement de ${p}, sans aucune interaction\n` +
            `# Bandeau de consentement visible dans le texte : ${hasConsent ? 'oui' : 'non détecté'}\n` +
            [...thirdParty].sort().join('\n') + '\n'
        );
      }
    } catch (e) {
      status = `erreur: ${e.message.split('\n')[0].slice(0, 80)}`;
      texts[p] = '';
    }
    index.push([p, status, (texts[p] ?? '').length]);
    console.log(`${String(i + 1).padStart(2)}/${paths.length} ${p} → ${status}, ${(texts[p] ?? '').length} car.`);
    await page.close();
    await new Promise((r) => setTimeout(r, DELAY));
  }
  await browser.close();

  // Gabarit commun : une ligne présente sur ≥ 60 % des pages rendues est du menu ou du pied de page.
  const rendered = Object.values(texts).filter((t) => t.length > 200);
  const freq = new Map();
  for (const t of rendered) for (const l of new Set(t.split('\n').map((x) => x.trim()).filter(Boolean))) freq.set(l, (freq.get(l) ?? 0) + 1);
  const boiler = new Set([...freq].filter(([, n]) => rendered.length >= 3 && n / rendered.length >= 0.6).map(([l]) => l));
  fs.writeFileSync(path.join(outDir, 'boilerplate.txt'), [...boiler].join('\n') + '\n');
  for (const [p, t] of Object.entries(texts)) {
    const clean = t.split('\n').filter((l) => !boiler.has(l.trim())).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    fs.writeFileSync(path.join(outDir, 'pages', `${slug(p)}.txt`), clean + '\n');
  }
  fs.writeFileSync(path.join(outDir, 'render-index.tsv'), index.map((r) => r.join('\t')).join('\n') + '\n');
  const empty = index.filter(([, , n]) => n < 250).map(([p]) => p);
  console.log(`✓ ${index.length} page(s) rendue(s), ${boiler.size} ligne(s) de gabarit retirée(s)`);
  if (empty.length) console.log(`  quasi vides (page protégée, 404 ou chargement lent) : ${empty.join(', ')}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
