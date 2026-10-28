# Le site sur Cloudflare (Worker « owwomenscup »)

Décision du 2026-10-28 : le **site** passe de Netlify à Cloudflare Workers
(OpenNext) ; **l'API reste sur Lightsail** (conference-api, inchangée).
Jusqu'à la bascule du domaine, Netlify sert owwomenscup.fr et le Worker
tourne en parallèle sur https://owwomenscup.owwomenscup.workers.dev
(noindex), avec les vraies données.

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
| `scripts/cloudflare-check.mjs` | Contrôles après déploiement (pages, 404, relais, en-têtes, noindex) |

`@opennextjs/cloudflare` et `wrangler` ne sont installés que par la CI
(versions figées dans le workflow) : les builds Netlify n'ont pas à les
installer. `open-next.config.ts` est donc exclu du tsconfig. À la fin de la
migration, ils passent en devDependencies.

## Ce qui change par rapport à Netlify

- **Relais `/api/*`** : même logique que l'Edge Function
  (`utils/edgeApiProxy.ts`), `/api/internal/*` servi par le Worker.
- **Tâches planifiées** : un seul déclencheur chaque minute, qui appelle
  l'API pour les tâches dues (même appel que `netlify/functions/*-cron.ts`).
  Coupé tant que `CRONS_ENABLED` vaut `0` (wrangler.jsonc) : sinon chaque
  tâche tournerait deux fois.
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

Posés par la CI depuis l'environnement GitHub (seuls les présents) :

| Secret | Sans lui |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | pages qui lisent la base côté serveur en erreur |
| `EDGE_PROXY_SECRET` | relais sans en-têtes X-Owwc-* : l'API voit `api.owwomenscup.fr` comme hôte (OAuth, retours de paiement, requêtes à cookie refusées) et l'IP de Cloudflare. **Indispensable avant la bascule.** |
| `CRON_SECRET` | aucune tâche planifiée ne part |
| `REVALIDATE_SECRET` | l'API ne peut plus faire régénérer les pages (`/api/internal/revalidate` → 404) |

Mêmes valeurs que sur Netlify et sur conference-api. Netlify masque
`EDGE_PROXY_SECRET` et `REVALIDATE_SECRET` : ils ont été repris sur le
serveur de l'API (`/etc/conference-api/*.env`). Les quatre sont posés depuis
le 2026-10-28 ; vérifiés : relais (l'API voit l'hôte du Worker) et
régénération à la demande (`/mentions-legales`).

## Bascule (checklist)

En deux temps : d'abord les serveurs DNS, sans effet visible (le site reste
chez Netlify) ; puis le site, en quelques minutes, un jour calme. Ainsi la
propagation DNS (24-48 h) ne mélange jamais les deux sites.

### Temps 1 — serveurs DNS (sans effet visible)

1. **Zone DNS** owwomenscup.fr chez Cloudflare (créée le 2026-10-28, zone
   `537bf7c4973a06bb276ccd8c2c36a3ac`, « en attente ») : les 14
   enregistrements de Netlify DNS recopiés à l'identique, tous en « DNS only »
   (nuage gris) — MX OVH ×3, DKIM Brevo ×2, `_dmarc`, TXT `brevo-code` et
   TikTok, `ovh-zimbra-…`, `stats` (Freebox), `api` (CloudFront) et sa
   validation ACM, `origin-api`, `bot` — et le domaine nu et `www` en CNAME
   vers `owwomenscup.netlify.app` : le site reste servi par Netlify (le
   domaine nu y gagne l'IPv6 de Netlify, vérifiée). Réponses des deux jeux de
   serveurs comparées nom par nom : identiques.
2. **Serveurs DNS** changés chez OVH (registrar, pas de DNSSEC) :
   `barbara.ns.cloudflare.com` et `tanner.ns.cloudflare.com` (avant :
   `dns1…dns4.p07.nsone.net`). Dès lors, toute modification DNS se fait chez
   Cloudflare, plus dans Netlify DNS.
3. **Zone active** chez Cloudflare (e-mail de Cloudflare) : son certificat
   (domaine nu + `*.owwomenscup.fr`) est émis à ce moment, avant toute
   bascule du site. Le certificat Netlify court jusqu'au 2027-01-07 : le
   temps 2 doit avoir lieu avant son renouvellement (début décembre).

### Temps 2 — le site (un jour calme, jamais un soir de match)

Netlify reste déployé deux semaines pour le retour arrière.

4. **Workers Paid** (5 $/mois) activé sur le compte Cloudflare : l'offre
   gratuite plafonne à 10 ms de calcul et 100 000 appels par jour.
5. **Environnement GitHub `cloudflare-production`** : poser la variable
   `CLOUDFLARE_LIVE=1` et relancer le workflow — elle allume les statistiques
   et la PWA, éteintes avant pour que les contrôles ne comptent pas comme des
   visites.
6. **Domaines personnalisés du Worker** : `owwomenscup.fr` et
   `www.owwomenscup.fr`, à la place des deux CNAME vers Netlify. Effet en
   quelques minutes. La régénération des pages suit seule : l'API la demande
   à `https://owwomenscup.fr/api/internal/revalidate`.
7. **Tâches planifiées**, dans un même commit sur `work` : `CRONS_ENABLED`
   à `1` (wrangler.jsonc) et suppression des fonctions `netlify/functions/*-cron.ts`
   et de leurs blocs dans netlify.toml (le bloc « miroir » de
   `tests/unit/cloudflareCrons.test.ts` part avec).
8. **Contrôles** : pages, connexion (mot de passe, MFA, Discord), admin,
   paiement test, e-mails (MX), régénération d'une page depuis l'API, tâches
   planifiées dans les journaux du Worker (`[crons] ok`).
9. `workers_dev: false` dans wrangler.jsonc (l'adresse technique ne sert plus).

## Retour arrière

Temps 2, tant que Netlify déploie encore : dans le DNS Cloudflare, retirer
les domaines du Worker et recréer `owwomenscup.fr` / `www` en CNAME « DNS
only » vers `owwomenscup.netlify.app` (quelques minutes). Remettre
`CRONS_ENABLED` à `0` et rétablir les fonctions planifiées Netlify (revert du
commit de l'étape 7).

Temps 1 : remettre chez OVH les serveurs `dns1…dns4.p07.nsone.net` (la zone
Netlify DNS est toujours là). Inutile en principe : les deux zones répondent
pareil.

## Après deux semaines sans souci

- Netlify en offre gratuite (les autres sites y restent).
- Suppression de l'essai : Worker `owwomenscup-trial`, bucket
  `owwomenscup-trial-opennext-cache`, branche `trial/cloudflare-opennext`,
  environnement GitHub `cloudflare-trial`, jeton CI
  `ci-github-conference-website-workers-trial` (expire le 2027-01-25).
- `netlify/`, `netlify.toml` et `@netlify/*` retirés ; OpenNext et wrangler en
  devDependencies.
