# Le site sur Cloudflare (Worker « owwomenscup »)

Décision du 2026-10-28 : le **site** passe de Netlify à Cloudflare Workers
(OpenNext) ; **l'API reste sur Lightsail** (conference-api, inchangée).
Bascule faite le même jour : owwomenscup.fr est servi par le Worker. Le
2026-10-29, la migration est déclarée finie : Netlify ne construit plus le
site et son code a quitté le dépôt. L'adresse technique *.workers.dev est
coupée (`workers_dev: false`) : la CI contrôle directement
https://owwomenscup.fr.

## Pièces

| Fichier | Rôle |
|---|---|
| `wrangler.jsonc` | Worker, R2 (cache des pages), Durable Object (file ISR), Images, Cron Trigger, variables |
| `open-next.config.ts` | Cache R2 + cache régional « long-lived », file DO, interception du cache |
| `cloudflare/worker.mjs` | Point d'entrée : relais `/api/*`, tâches planifiées, redirections, cache des pages |
| `cloudflare/crons.ts` | Les 28 tâches planifiées (horaires UTC, routes, délais) et leur appel |
| `cloudflare/responses.ts` | Redirections www / http:// et Cache-Control des pages au navigateur |
| `cloudflare/_headers` | En-têtes des fichiers statiques (copié dans `.open-next/assets/` par la CI) |
| `.github/workflows/cloudflare.yml` | Build + déploiement à chaque mise à jour de `work`, secrets, contrôles |
| `scripts/cloudflare-check.mjs` | Contrôles après déploiement (pages, 404, relais, en-têtes, cache, noindex) |

`@opennextjs/cloudflare` et `wrangler` sont des devDependencies en version
exacte, et tout leur arbre est figé par package-lock.json : un déploiement
ne résout aucune version. Il en résolvait avant (`npm install --no-save` dans
la CI), et le 2026-10-28 un paquet publié cinq minutes plus tôt, encore
indisponible, a fait échouer un déploiement. Pour les monter : `npm install
-D --save-exact --before=<il y a 2 jours> @opennextjs/cloudflare@<x>
wrangler@<y>`, pour ne verrouiller que des versions publiées depuis au moins
deux jours.

## Ce qui change par rapport à Netlify

- **Relais `/api/*`** : même logique que l'Edge Function
  (`utils/edgeApiProxy.ts`), `/api/internal/*` servi par le Worker.
- **Tâches planifiées** : un seul déclencheur chaque minute, qui appelle
  l'API pour les tâches dues (`cloudflare/crons.ts`, seule source depuis la
  bascule). `CRONS_ENABLED` à `0` (wrangler.jsonc) les coupe toutes.
- **En-têtes** : ceux de netlify.toml sont repris dans `cloudflare/_headers`,
  sauf `X-Frame-Options: ALLOW-FROM …` (ignoré par les navigateurs ;
  l'encadrement est réglé par la CSP de `proxy.ts`).
- **Page 404** : pour un `notFound` de getStaticProps (tournoi supprimé…),
  Next sous OpenNext répond un texte brut « This page could not be found » ;
  `cloudflare/worker.mjs` sert alors notre page 404 (statut 404).
- **Redirections** : Netlify renvoyait `www.owwomenscup.fr` et `http://` vers
  `https://owwomenscup.fr` (301) ; le Worker le fait lui-même.
- **Cache des pages au navigateur** : pour une page ISR, Next écrit
  `s-maxage=…, stale-while-revalidate=…` ; tel quel, Chrome resservirait la
  page ou ses `/_next/data` périmées jusqu'à 30 jours. Le Worker remplace
  l'en-tête par `public, max-age=0, must-revalidate`, comme Netlify.
- **Fonction Telegram de la VM Freebox** : supprimée (2026-10-28).
- **`renderToStaticMarkup` et `renderToString` n'existent pas en production** :
  OpenNext remplace par un module vide le fichier de React qui les contient
  (`shim-react`), alors qu'ils marchent au build et dans les tests. Tous les articles
  `/news/<slug>` ont répondu 500 du 2026-10-28 au 2026-10-31. Dans le code servi, passer
  par `renderToReadableStream` (`utils/news/renderNewsMarkdown.tsx`) ; un test le vérifie,
  et `scripts/cloudflare-check.mjs` ouvre désormais un vrai article.

## Secrets du Worker

Posés par la CI depuis l'environnement GitHub `cloudflare-production` (seuls
les présents) :

| Secret | Sans lui |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | pages qui lisent la base côté serveur en erreur |
| `EDGE_PROXY_SECRET` | relais sans en-têtes X-Owwc-* : l'API voit `api.owwomenscup.fr` comme hôte (OAuth, retours de paiement, requêtes à cookie refusées) et l'IP de Cloudflare |
| `CRON_SECRET` | aucune tâche planifiée ne part |
| `REVALIDATE_SECRET` | l'API ne peut plus faire régénérer les pages (`/api/internal/revalidate` → 404) |

Mêmes valeurs que sur conference-api (`/etc/conference-api/*.env` sur le
serveur de l'API). La variable `CLOUDFLARE_LIVE=1` du même environnement
allume les statistiques et la PWA au build.

## DNS et domaine

- **Zone** owwomenscup.fr chez Cloudflare (zone
  `537bf7c4973a06bb276ccd8c2c36a3ac`), serveurs `barbara.ns.cloudflare.com`
  et `tanner.ns.cloudflare.com` chez OVH (registrar, pas de DNSSEC) depuis le
  2026-10-28. Toute modification DNS se fait chez Cloudflare, plus dans
  Netlify DNS.
- Tous les enregistrements sont en « DNS only » (nuage gris) — MX OVH ×3,
  DKIM Brevo ×2, `_dmarc`, TXT `brevo-code` et TikTok, `ovh-zimbra-…`,
  `stats` (Freebox), `api` (CloudFront) et sa validation ACM, `origin-api`,
  `bot` — **sauf** le domaine nu et `www` : CNAME vers
  `owwomenscup.netlify.app`, **proxied**. La cible n'est jamais contactée :
  deux **routes Worker** (`owwomenscup.fr/*`, `www.owwomenscup.fr/*` →
  `owwomenscup`) prennent toutes les requêtes.
- Routes plutôt que domaines personnalisés : un domaine personnalisé ne se
  crée pas sur un nom qui a déjà un CNAME. Il aurait fallu supprimer le CNAME
  d'abord, et le trou, mis en cache négatif par les résolveurs (jusqu'à
  30 min), aurait rendu le site injoignable pour certains. Passer un
  enregistrement en « proxied » est instantané et réversible. Les routes ont
  été créées dans le tableau de bord, pas dans wrangler.jsonc : le jeton de la
  CI n'a aucun droit sur la zone.
- Réglages de zone changés : masquage des e-mails **coupé** (il injecte un
  script que la CSP bloquerait), contrôle d'intégrité du navigateur
  **coupé** (comme chez Netlify ; overlays OBS, outils), TLS 1.2 minimum.
  Certificat universel (Let's Encrypt, domaine nu + `*.owwomenscup.fr`).

## Bascule du 2026-10-28 (faite)

1. Zone Cloudflare créée, enregistrements recopiés de Netlify DNS, réponses
   des deux jeux de serveurs comparées nom par nom : identiques.
2. Serveurs DNS changés chez OVH ; zone active, certificat émis. Le site
   restait servi par Netlify (CNAME « DNS only ») : changement invisible.
3. Workers Paid (5 $/mois) activé.
4. `CLOUDFLARE_LIVE=1` : statistiques et PWA allumées sur le Worker.
5. Routes Worker créées, puis le domaine nu et `www` passés en « proxied » :
   owwomenscup.fr servi par le Worker, `www` et `http://` redirigés.
6. Tâches planifiées : fonctions Netlify retirées (0cda6c4b0), puis, une fois
   ce déploiement Netlify en ligne, `CRONS_ENABLED=1` : jamais deux
   exécutions à la fois.

Reste à faire :

- Connexion vérifiée par le propriétaire (mot de passe, MFA, Discord), admin,
  paiement test, régénération d'une page depuis l'API.

## Retour arrière (secours seulement)

Il n'est plus prévu. Le site Netlify « owwomenscup » existe encore, figé sur
sa dernière version (8c6efac72, constructions coupées), comme la zone Netlify
DNS : en cas de panne grave du Worker, repasser dans le DNS Cloudflare le
domaine nu et `www` en « DNS only » renvoie le trafic vers
`owwomenscup.netlify.app` en quelques minutes. Deux réserves : l'équipe
Netlify est en offre gratuite (300 crédits par mois, puis TOUS les sites
Netlify en pause) — la repasser en Pro avant ; et les tâches planifiées
restent dans le Worker (aucune chez Netlify).

## Ménage du 2026-10-29

Fait :

- Constructions Netlify du site coupées ; `netlify/`, `netlify.toml` et
  `@netlify/functions` retirés ; en-têtes `Netlify-Vary` retirés de
  `next.config.js` (sans objet hors du CDN Netlify).
- Essai supprimé : Worker `owwomenscup-trial`, bucket
  `owwomenscup-trial-opennext-cache`, branche `trial/cloudflare-opennext`,
  environnement GitHub `cloudflare-trial`.
- Mentions légales : hébergeur Cloudflare, Inc.

Gardé volontairement :

- Le jeton CI `ci-github-conference-website-workers-trial` : c'est le secret
  `CLOUDFLARE_API_TOKEN` du dépôt, utilisé par le déploiement de production.
  **Il expire le 2027-01-25** : en créer un nouveau (mêmes droits : Workers
  Scripts Write, R2 Write, Account Settings Read, Workers Tail Read) et
  remplacer le secret avant cette date.
- Le site Netlify et la zone Netlify DNS owwomenscup.fr (secours ci-dessus).

L'équipe Netlify passe en offre gratuite le 2026-10-31 (fin de la période
Pro en cours, demandé par la propriétaire). Variables du site Netlify devenues inutiles
(`CRON_API_BASE_URL`, `API_PROXY_*`, `EDGE_PROXY_SECRET`…) : sans effet
tant que les constructions sont coupées.
