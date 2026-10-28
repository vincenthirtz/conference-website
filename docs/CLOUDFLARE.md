# Le site sur Cloudflare (Worker « owwomenscup »)

Décision du 2026-10-28 : le **site** passe de Netlify à Cloudflare Workers
(OpenNext) ; **l'API reste sur Lightsail** (conference-api, inchangée).
Bascule faite le même jour : owwomenscup.fr est servi par le Worker. Netlify
reste déployé deux semaines pour le retour arrière (plus de tâches
planifiées chez lui). L'adresse technique
https://owwomenscup.owwomenscup.workers.dev sert encore aux contrôles de la CI
(noindex).

## Pièces

| Fichier | Rôle |
|---|---|
| `wrangler.jsonc` | Worker, R2 (cache des pages), Durable Object (file ISR), Images, Cron Trigger, variables |
| `open-next.config.ts` | Cache R2 + cache régional « long-lived », file DO, interception du cache |
| `cloudflare/worker.mjs` | Point d'entrée : relais `/api/*`, tâches planifiées, noindex sur *.workers.dev |
| `cloudflare/crons.ts` | Les 28 tâches planifiées (horaires UTC, routes, délais) et leur appel |
| `cloudflare/responses.ts` | Redirections www / http:// et Cache-Control des pages au navigateur |
| `cloudflare/_headers` | En-têtes des fichiers statiques (copié dans `.open-next/assets/` par la CI) |
| `.github/workflows/cloudflare.yml` | Build + déploiement à chaque mise à jour de `work`, secrets, contrôles |
| `scripts/cloudflare-check.mjs` | Contrôles après déploiement (pages, 404, relais, en-têtes, cache, noindex) |

`@opennextjs/cloudflare` et `wrangler` ne sont installés que par la CI
(versions figées dans le workflow) : les builds Netlify n'ont pas à les
installer. `open-next.config.ts` est donc exclu du tsconfig. À la fin de la
migration, ils passent en devDependencies.

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
- `workers_dev: false` dans wrangler.jsonc, et les contrôles de la CI sur
  https://owwomenscup.fr au lieu de l'adresse technique (étape « Adresse
  workers.dev » du workflow).

## Retour arrière

Tant que Netlify déploie encore (deux semaines) :

1. Dans le DNS Cloudflare, repasser le domaine nu et `www` en « DNS only » :
   le trafic revient à Netlify en quelques minutes (TTL 5 min). Les routes
   peuvent rester, elles n'agissent que sur le trafic « proxied ».
2. Tâches planifiées : d'abord `CRONS_ENABLED` à `0` (wrangler.jsonc),
   déployé ; ensuite seulement le revert de 0cda6c4b0, qui rend les fonctions
   planifiées à Netlify — jamais deux exécutions à la fois.

Retour aux serveurs DNS de Netlify : remettre chez OVH
`dns1…dns4.p07.nsone.net` (la zone Netlify DNS est toujours là, inchangée).
Inutile en principe.

## Après deux semaines sans souci

- Netlify en offre gratuite (les autres sites y restent) ; variables du site
  devenues inutiles (dont `CRON_API_BASE_URL`, `API_PROXY_*`).
- Zone Netlify DNS owwomenscup.fr supprimée (plus consultée).
- Suppression de l'essai : Worker `owwomenscup-trial`, bucket
  `owwomenscup-trial-opennext-cache`, branche `trial/cloudflare-opennext`,
  environnement GitHub `cloudflare-trial`, jeton CI
  `ci-github-conference-website-workers-trial` (expire le 2027-01-25).
- `netlify/`, `netlify.toml` et `@netlify/*` retirés ; OpenNext et wrangler en
  devDependencies.
