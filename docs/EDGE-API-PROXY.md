# Relais même-origine `/api/*` → conference-api (Edge Function)

> **Depuis le 2026-10-28, le relais est fait par le Worker Cloudflare**
> ([cloudflare/worker.mjs](../cloudflare/worker.mjs), même logique
> `utils/edgeApiProxy.ts`, voir [CLOUDFLARE.md](CLOUDFLARE.md)). L’Edge
> Function Netlify décrite ci-dessous a été retirée le 2026-10-29 ; ce
> document garde l’historique de la bascule et le contrat du relais.
>
> **Depuis le 2026-10-31**, les lectures (GET, HEAD) des routes de
> `API_WORKER_ROUTES` (wrangler.jsonc : chemins exacts, `:id` = un UUID, `*` en
> dernier = tout ce qui suit) partent vers le Worker de l’API par sa liaison
> `API_WORKER`, avec repli sur le serveur si le Worker lève, répond 5xx ou tarde
> plus de 8 s. Une telle réponse se reconnaît à l’absence d’en-têtes CloudFront.
> Voir [API-WORKER.md](API-WORKER.md), phase 2.

Les familles d'API qui lisent un cookie du site (session `sb-*`, tenant actif,
états OAuth) ne peuvent pas passer en cross-origin vers `api.owwomenscup.fr` :
le navigateur n'y envoie pas les cookies de `owwomenscup.fr`. Le relais garde
l'URL sur le site et fait l'aller-retour côté serveur.

- Code : [netlify/edge-functions/api-proxy.ts](../netlify/edge-functions/api-proxy.ts)
- Logique pure + tests : [utils/edgeApiProxy.ts](../utils/edgeApiProxy.ts),
  `tests/unit/edgeApiProxy.test.ts`
- Déclaration : `[[edge_functions]]` dans `netlify.toml`, `path = "/api/*"`
- Bascule cross-origin (familles sans cookie) : `utils/remoteApi.ts`, à part.

## Variables (Netlify, portée « Functions »)

| Variable | Rôle | Absente |
|---|---|---|
| `API_PROXY_PREFIXES` | Préfixes relayés, séparés par des virgules, chacun commençant par `/api/` (ex. `/api/onboard/`) | relais inactif |
| `API_PROXY_ORIGIN` | Origine https stricte de l'API, sans chemin | `https://api.owwomenscup.fr` |
| `EDGE_PROXY_SECRET` | Secret partagé avec conference-api, envoyé en `X-Owwc-Edge` | relais inactif |

Préfixes ou secret absents, origine invalide (http, chemin…) ou chemin hors
préfixe : `context.next()`, la fonction serveur Next répond comme avant.
Toute modification de variable se fait suivre d'un redéploiement.

Secret : `openssl rand -hex 32`, la même valeur côté conference-api.

## Ce que fait le relais

- Même méthode, même chemin + query, corps en flux (`duplex: 'half'`).
- En-têtes de la requête recopiés, sauf hop-by-hop et `host`. Tout `X-Owwc-*`
  venu du client est supprimé, puis le relais ajoute `X-Owwc-Edge` (secret),
  `X-Owwc-Client-Ip` (`context.ip`) et `X-Owwc-Host` (host demandé).
- `accept-encoding: identity` vers l'amont : corps relayé sans
  décompression/recompression, en-têtes cohérents ; le CDN Netlify compresse
  vers le navigateur. Si l'amont compresse quand même, `content-length` est
  retiré.
- Réponse renvoyée telle quelle : statut, corps en flux, en-têtes (dont
  `Cache-Control`), chaque `Set-Cookie` séparément (`getSetCookie()`), 3xx non
  suivies (`redirect: 'manual'`). Aucun cache côté relais.
- Erreur réseau amont : `502 {"error":"Upstream unavailable"}`.

**Côté conference-api (prérequis)** : n'accorder foi à `X-Owwc-Client-Ip` et
`X-Owwc-Host` que si `X-Owwc-Edge` correspond au secret (comparaison en temps
constant). Sans ça, n'importe qui appelant l'API en direct choisit son IP pour
le rate limit. Les redirections et URL absolues construites depuis le host
doivent utiliser `X-Owwc-Host`, pas `Host` (qui vaut `api.owwomenscup.fr`).

## Régénération ISR depuis conference-api

Les handlers appellent la régénération à la demande des pages publiques
(news, matchs, fiches joueuses — dont le retrait de photo TCG, RGPD, qui doit
disparaître en secondes). Sur conference-api, `res.revalidate` ne régénère
rien d'utile : les pages sont servies par Netlify. Tout passe donc par
[utils/revalidate.ts](../utils/revalidate.ts) (`revalidatePaths`) :

| Variable | Où | Rôle |
|---|---|---|
| `REVALIDATE_REMOTE_URL` | **conference-api UNIQUEMENT** : `https://owwomenscup.fr/api/internal/revalidate` | URL https stricte de la route de régénération du site |
| `REVALIDATE_SECRET` | **les deux côtés**, même valeur (`openssl rand -hex 32`) | En-tête `x-revalidate-secret`, comparé en temps constant |

- Les deux posées (conference-api) → un `POST {"paths": [...]}` vers le site
  (timeout 8 s, lots de 50 chemins). Échec journalisé, la requête n'échoue pas.
- Sinon (site Netlify, local) → `res.revalidate(path)` par chemin, comme avant.
  **Ne jamais poser `REVALIDATE_REMOTE_URL` côté Netlify.**
- Route réceptrice : [pages/api/internal/revalidate.ts](../pages/api/internal/revalidate.ts).
  `REVALIDATE_SECRET` absent côté site → 404 ; secret faux → 401 ; chemins
  validés (≤ 50, commencent par `/`, sans `//` ni schéma). Réponse
  `{ revalidated, failed }`.
- **`/api/internal/*` n'est JAMAIS relayé**, même avec `API_PROXY_PREFIXES=/api/`
  (`isNeverProxiedPath` dans `utils/edgeApiProxy.ts`) : relayée, la demande
  reviendrait à l'API.

Vérification après bascule : retirer une photo TCG de test et constater sa
disparition de `/player/<id>` en quelques secondes ; en cas d'échec, chercher
`revalidatePlayerCard` dans les logs de conference-api.

## Ordre de bascule recommandé

Une famille à la fois, en vérifiant chaque étape en prod avant la suivante :

1. `/api/onboard/` — canari, faible enjeu
2. `/api/twitch/`
3. `/api/auth/` — OAuth : URI de redirection, cookies d'état
4. `/api/helloasso/` — paiements : webhooks et retours
5. `/api/admin/` — le plus large, cookie de tenant sur chaque route

## Retour arrière

Vider `API_PROXY_PREFIXES` (ou retirer une famille de la liste) dans Netlify,
puis redéployer. Le code reste en place, inerte.

## État (2026-10-13) et deploy previews

- **Production : `API_PROXY_PREFIXES=/api/`** depuis le 2026-10-12 — tout
  `owwomenscup.fr/api/*` est servi par conference-api. Les handlers de
  `pages/api` restent construits et déployés sur Netlify mais n'y répondent
  plus (l'Edge Function passe avant).
- **Deploy previews : préfixe factice** (`/api/__preview-sans-relais__/`) —
  le relais rend la main et c'est le `pages/api` de la PR qui répond. Une PR
  qui touche un handler est donc encore testable dans sa preview.
- Les previews utilisent **la même base Supabase que la prod** (mêmes
  `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` dans tous les
  contextes Netlify) : relayer une preview vers `api.owwomenscup.fr` ne change
  rien à ce qu'elle peut écrire, seulement QUEL code répond.

**Décision 4d, appliquée le 2026-10-13 avec la bascule 4e** — `pages/api` a
quitté le site (il ne reste que `pages/api/internal/*`) ; les previews sont
elles aussi en relais complet : `API_PROXY_PREFIXES=/api/` dans le contexte
`deploy-preview`, origine `https://api.owwomenscup.fr` par défaut. Conséquence
assumée : un changement de handler n'est exercé que par les tests unitaires et
le typecheck de conference-api, pas par une preview du site. Les alternatives
(relais des seules lectures `/api/public/`, qui imposait de garder `pages/api` ;
un conteneur API par preview, sans place sur l'instance) ont été écartées.

## À vérifier sur deploy preview

Un appel relayé se reconnaît aux en-têtes CloudFront de la réponse
(`via: … cloudfront`, `x-amz-cf-pop`).

- [ ] **Set-Cookie multiples** : une réponse qui en pose plusieurs (connexion,
      callback OAuth) les livre tous, séparés, avec leurs attributs.
- [ ] **Compression** : réponse JSON volumineuse lisible, `content-encoding` vu
      par le navigateur cohérent avec le corps.
- [ ] **Taille des uploads** : un upload réel (images, imports) passe en entier
      — corps en flux, `content-length` relayé.
- [ ] **Routes > 40 s** : les Edge Functions doivent renvoyer le premier octet
      en moins de 40 s, sinon 502. Lister les routes lentes (imports, exports,
      générations) des familles basculées avant de les relayer.
- [ ] **Ordre d'exécution vs fonctions Next** : avec la variable, la route est
      servie par l'API (en-têtes CloudFront) ; sans, par Next, réponse
      identique à avant. Le middleware Next (`proxy.ts`) exclut `/api` de son
      matcher, il n'entre pas en jeu.
- [ ] Quota : toute requête `/api/*` déclenche une invocation d'Edge Function,
      même quand le relais rend la main. Surveiller le compteur dans Netlify.
