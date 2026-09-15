#!/usr/bin/env node
// probe-bundle.mjs <dossier-collecte>
//
// Lit les scripts JS téléchargés par collect.sh (dossier assets/) et en tire ce
// que le produit EXPOSE à tout visiteur : routes de l'application, services
// tiers appelés, noms de fonctions serveur, intégrations, jeux, langues.
//
// Règles :
//   - lecture seule de fichiers déjà publics ; aucun appel réseau ;
//   - toute clé ou jeton repéré est MASQUÉ dans la sortie (une clé « anon »
//     publique reste une clé : on ne la recopie pas, on ne s'en sert pas) ;
//   - les compteurs de mots-clés sont des INDICES, jamais des preuves : une
//     chaîne peut être du code mort ou une traduction. Confirmer au rendu.
//
// Sortie : <dossier>/probe.json et un résumé lisible sur stdout.

import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: probe-bundle.mjs <dossier-collecte>');
  process.exit(1);
}
const assetsDir = path.join(dir, 'assets');
const files = fs.existsSync(assetsDir)
  ? fs.readdirSync(assetsDir).filter((f) => /\.(m?js)$/.test(f))
  : [];
if (!files.length) {
  console.error(`aucun script dans ${assetsDir} (lancer collect.sh d'abord)`);
  process.exit(1);
}
const code = files.map((f) => fs.readFileSync(path.join(assetsDir, f), 'utf8')).join('\n;\n');

const uniq = (arr) => [...new Set(arr)].sort();
const count = (re) => (code.match(re) ?? []).length;
const redact = (s) =>
  s
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '‹jwt masqué›')
    .replace(/\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}/g, '‹clé masquée›')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, '‹clé masquée›');

// Routes (React Router `path:"…"`, Vue Router `path: '…'`, liens internes)
const routes = uniq([
  ...[...code.matchAll(/path\s*:\s*["'`](\/[^"'`\s]{0,120})["'`]/g)].map((m) => m[1]),
]).filter((r) => !/^\/\//.test(r));

// Hôtes externes appelés
const hosts = uniq(
  [...code.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?=[/"'`\s?:])/gi)].map((m) => m[1].toLowerCase())
).filter((h) => !/w3\.org|reactjs|github\.com|mozilla|schema\.org|example\.|localhost|jsdelivr|unpkg/.test(h));

const BACKENDS = {
  supabase: /\.supabase\.co\b/,
  firebase: /firebaseio\.com|firebaseapp\.com|googleapis\.com\/identitytoolkit/,
  appwrite: /appwrite\.io/,
  pocketbase: /pocketbase/i,
  aws_amplify: /amplifyapp|cognito-idp/,
};
const INTEGRATIONS = {
  helloasso: /helloasso/i,
  stripe: /js\.stripe\.com|stripe\.com\/v\d|loadStripe/,
  paypal: /paypal\.com|paypalobjects/i,
  lydia: /lydia-app/i,
  discord_oauth: /discord\.com\/(api\/)?oauth2|discord-oauth|discord_oauth/i,
  twitch: /twitch\.tv|api\.twitch|twitch-visuals|twitch_/i,
  youtube: /youtube\.com\/embed|youtu\.be/i,
  riot_api: /riotgames\.com|riot\.txt|update-riot-rank|RGAPI/i,
  opgg: /op\.gg/i,
  battlenet: /battle\.net|blizzard/i,
  steam: /steamcommunity|steampowered/i,
  start_gg: /start\.gg|smash\.gg/i,
  toornament: /toornament/i,
  challonge: /challonge/i,
  leaflet_map: /leaflet|openstreetmap/i,
  google_maps: /maps\.googleapis/i,
  calendly: /calendly/i,
  sentry: /sentry\.io|@sentry/,
  posthog: /posthog/i,
  recaptcha_turnstile: /recaptcha|turnstile|hcaptcha/i,
};
const GAMES = {
  'League of Legends': /league of legends|\blol\b/i,
  Valorant: /valorant/i,
  Overwatch: /overwatch/i,
  'Counter-Strike 2': /counter[- ]?strike|\bcs2\b/i,
  'Rocket League': /rocket league/i,
  'Teamfight Tactics': /teamfight tactics|\btft\b/i,
  'EA FC': /\bfc ?2[4-9]\b|ea sports fc/i,
  'Marvel Rivals': /marvel rivals/i,
  'Rainbow Six': /rainbow six|\br6\b/i,
  'Dota 2': /dota ?2/i,
  Fortnite: /fortnite/i,
  Smash: /smash bros/i,
  '2XKO': /2xko/i,
};
const FEATURES = {
  bracket: /bracket|arbre de tournoi/i,
  suisse: /swiss|suisse/i,
  check_in: /check[- ]?in/i,
  draft_ban: /\bdraft|map[- ]?ban|pick ?ban|veto/i,
  overlays_stream: /overlay|twitch-visuals|obs\b/i,
  pronostics_paris: /pronostic|betting|bet_|odds|cote/i,
  fantasy: /fantasy/i,
  scrims: /scrim/i,
  recrutement: /recruit|recrutement|mercenaire|joueurs-dispo|free ?agent/i,
  classement_elo: /elo|glicko|mmr|leaderboard|classement/i,
  ligues_saisons: /championship|league season|saison|ligue/i,
  billetterie_paiement: /billetterie|checkout|payment|paiement/i,
  cashprize: /cash ?prize|prize ?pool|dotation/i,
  litiges_arbitrage: /dispute|litige|arbitr/i,
  preuves_screenshots: /screenshot|preuve|evidence/i,
  bot_discord: /discord bot|bot discord|slash command/i,
  notifications_push: /web ?push|serviceWorker|pushManager/i,
  messagerie: /conversation|messag/i,
  api_publique: /api publique|public api|developer|webhook/i,
  i18n: /i18n|changeLanguage|useTranslation/i,
  pwa: /manifest\.json|beforeinstallprompt/i,
};

const edgeFunctions = uniq([
  ...[...code.matchAll(/functions\.invoke\(\s*["'`]([a-z0-9_-]+)["'`]/gi)].map((m) => m[1]),
  ...[...code.matchAll(/invoke\(\s*["'`]([a-z][a-z0-9]*-[a-z0-9-]+)["'`]/g)].map((m) => m[1]),
]);
const tables = uniq([...code.matchAll(/\.from\(\s*["'`]([a-z_][a-z0-9_]{2,40})["'`]\s*\)/g)].map((m) => m[1]));
const languages = uniq(
  [...code.matchAll(/["'`](fr|en|es|de|it|pt|nl|pl|ar|ja|ko|zh)["'`]\s*:\s*\{/g)].map((m) => m[1])
);
const supabaseRefs = uniq([...code.matchAll(/https:\/\/([a-z0-9]{20})\.supabase\.co/g)].map((m) => m[1]));

const pick = (map) =>
  Object.fromEntries(
    Object.entries(map)
      .map(([k, re]) => [k, count(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
  );

const result = {
  bundle: {
    files: files.map((f) => ({ file: f, bytes: fs.statSync(path.join(assetsDir, f)).size })),
    totalBytes: files.reduce((s, f) => s + fs.statSync(path.join(assetsDir, f)).size, 0),
  },
  routes,
  routeGroups: Object.entries(
    routes.reduce((acc, r) => {
      const g = r.split('/')[1] || '/';
      acc[g] = (acc[g] ?? 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]),
  hosts,
  backends: Object.keys(BACKENDS).filter((k) => BACKENDS[k].test(code)),
  supabaseProjects: supabaseRefs.length, // nombre seulement, jamais les identifiants ni les clés
  edgeFunctions,
  tablesReferenced: tables,
  integrations: pick(INTEGRATIONS),
  games: pick(GAMES),
  featureSignals: pick(FEATURES),
  languages,
  secretsSeen: {
    jwtLike: count(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g),
    note: 'valeurs jamais recopiées ; une clé anon Supabase est normale côté client, sa sécurité dépend des RLS',
  },
};

fs.writeFileSync(path.join(dir, 'probe.json'), redact(JSON.stringify(result, null, 2)));

const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} Mo`;
console.log(`Bundle : ${result.bundle.files.length} fichier(s), ${mb(result.bundle.totalBytes)}`);
console.log(`Backend : ${result.backends.join(', ') || 'non identifié'}${result.edgeFunctions.length ? ` — fonctions serveur : ${result.edgeFunctions.join(', ')}` : ''}`);
console.log(`Routes : ${routes.length} (groupes : ${result.routeGroups.slice(0, 12).map(([g, n]) => `${g}×${n}`).join(', ')})`);
console.log(`Tables lues côté client : ${tables.length ? tables.slice(0, 40).join(', ') : '—'}`);
console.log(`Intégrations : ${Object.entries(result.integrations).map(([k, n]) => `${k}(${n})`).join(', ') || '—'}`);
console.log(`Jeux : ${Object.entries(result.games).map(([k, n]) => `${k}(${n})`).join(', ') || '—'}`);
console.log(`Indices de fonctionnalités : ${Object.entries(result.featureSignals).map(([k, n]) => `${k}(${n})`).join(', ')}`);
console.log(`Langues déclarées : ${languages.join(', ') || '—'}`);
console.log(`→ détail : ${path.join(dir, 'probe.json')}`);
