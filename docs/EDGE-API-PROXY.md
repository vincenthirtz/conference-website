# Relais même-origine `/api/*` → conference-api (Edge Function)

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
