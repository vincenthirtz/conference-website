# Public API Contract — écriture + GraphQL

> Surface **publique authentifiée** de l'API (feature "API publique élargie").
> Distincte de :
>
> - l'API publique **read-only anonyme** (`/api/public/v1/*` en `GET`, CORS `*`,
>   cf. `utils/publicApi.ts`) — voir « Quel espace répond ? » ci-dessous : ces
>   lectures ignorent le token, et le ciblage d'un autre espace y est en
>   attente (cache CDN) ;
> - l'API **bot** (`/api/bot/v1/*`, clé per-tenant + acteur Discord, cf.
>   `docs/BOT_API_CONTRACT.md`).
>
> Cette surface-ci sert les **orgas tierces** qui automatisent (scripts de
> résultats, overlays, intégrations). Auth par **token scopé découplé du bot**.

## 0. Quel espace répond ?

L'API sert plusieurs espaces, et une réponse qui se trompe d'espace n'échoue
pas : elle est **valide et fausse**. D'où deux règles, selon la surface.

> **Source de vérité** : la spec OpenAPI (`docs/openapi/`), servie par
> `GET /api/public/openapi` et rendue sur `/developpeurs/reference` — son
> introduction (`x-public-description` de `docs/openapi/root.yaml`) porte les
> règles transverses, le schéma `PublicApiErrorCode` le catalogue des codes.
> Cette page résume et renvoie ; en cas d'écart, la spec fait foi.

**Écriture REST et GraphQL avec token** : le **token** détermine l'espace,
point. Aucun paramètre ni en-tête ne peut le déplacer.

**GraphQL sans token, ou avec un token refusé** (inconnu, révoqué, expiré, mal
formé) : espace historique (`DEFAULT_TENANT_ID`), **sans erreur**.

**Lectures REST** (`GET /api/public/v1/*`) : elles **ignorent** l'en-tête
`Authorization`. Sur owwomenscup.fr, elles servent l'espace historique.

<!-- EN ATTENTE : ciblage de l'espace sur les lectures REST, bloqué par le cache CDN — ne pas publier en l'état -->

Le code sait résoudre un autre espace pour ces lectures
(`resolveTenantIdForPublicRequestAsync`), mais le cache CDN de production
neutralise ce ciblage (section « Cache CDN » ci-dessous) : il **n'est pas
documenté comme disponible**. Aujourd'hui, la voie pour lire les données d'un
autre espace est `POST /api/graphql` avec le token de cet espace.

NB : un espace n'a **pas** de site public — il dispose du bot, du back-office
et de l'API.

### Cache CDN (production)

Les lectures REST posent `Cache-Control: public, s-maxage=N` (30 à 3600 s
selon l'endpoint). Sur Netlify, la clé de cache CDN ne varie que sur
`__nextDataReq` et `_rsc` : **tous les autres paramètres de query sont
ignorés**. Pendant N secondes, une URL sert la première réponse mise en cache,
quels que soient ses paramètres. Conséquence : filtres, pagination et
`?format=` sont non fiables aujourd'hui ; chaque paramètre concerné le dit
dans la spec. Même piège que celui documenté dans `utils/og/matchPoster.tsx`.

## 1. Authentification

En-tête sur toute requête d'écriture (et les mutations GraphQL) :

```
Authorization: Bearer pk_live_<64 hex>
```

- **Où il sert aujourd'hui** : `POST /api/public/v1/matches/{id}/result` et
  `POST /api/graphql` (où il fixe l'espace des requêtes et autorise la
  mutation). Les `GET /api/public/v1/*` l'ignorent.
- Émission, **deux chemins qui ne visent pas le même espace** (module commun
  `utils/apiTokens/mintTenantApiToken.ts`, corps
  `lib/apiContracts/admin/apiTokens.ts`) :
  - `/admin/api-tokens` → `POST /api/admin/api-tokens` émet pour l'espace
    **ACTIF du sélecteur** de l'émetteur, que l'écran ne nomme pas (cause
    d'une clé déjà émise sur le mauvais espace) ;
  - `POST /api/admin/tenants/{id}/api-tokens` (owner de la plateforme) émet
    pour l'espace désigné dans l'URL.
- Affiché **une seule fois** à la création — seul son `token_prefix`
  (`pk_live_a1b2c3…`) reste visible ensuite.
- Stockage : `tenant_api_tokens` (sha256 du token, jamais le clair ; RLS
  service-role only). Lookup inbound = sha256(header) → row non révoquée et non
  expirée, relue à chaque requête (révocation effective immédiatement).
- Le **tenant est autoritaire** : déterminé par le token, pas par un header.
- Révocation : soft (`revoked_at`). Expiration : optionnelle
  (`expires_in_days` à l'émission → `expires_at`). Révoqué, expiré, inconnu ou
  mal formé → `401 UNAUTHORIZED` en REST, **sans distinction** ; en GraphQL, le
  token est simplement ignoré (requête anonyme, espace historique).
- Bearer ⇒ résistant au CSRF (le navigateur n'attache pas `Authorization`
  cross-origin automatiquement).

### Scopes

Format `resource:action`. Source de vérité applicative : `utils/apiScopes.ts`
(pas de CHECK DB — ajouter un scope ne coûte pas de migration).

| Ressource     | Actions         |
| ------------- | --------------- |
| `tournaments` | `read`, `write` |
| `matches`     | `read`, `write` |
| `teams`       | `read`, `write` |
| `players`     | `read`, `write` |

Un endpoint déclare le scope qu'il exige. Scope absent du token → `403
INSUFFICIENT_SCOPE`. Pas d'implication : `matches:write` n'implique pas
`matches:read`.

**État réel** : seule `matches:write` est exigée (écriture REST et mutation
GraphQL). **Aucune route ne contrôle une portée `:read`** — les `GET` REST
ignorent le token, les requêtes GraphQL ne vérifient aucune portée.

### Gate PLAN (entitlement facturé)

Les clés API sont un **produit payant**. Indépendamment des scopes, l'accès
dépend du **plan effectif** du tenant propriétaire du token (cf.
`utils/billing/planFeatures.ts`, gate `utils/billing/apiPlanGate.ts`) :

| Accès                                                | Capacité requise | Plans qui l'ouvrent                        |
| ---------------------------------------------------- | ---------------- | ------------------------------------------ |
| Lecture (GET/HEAD, mutations `:read`)                | `apiRead`        | `regie`, `circuit`, `editor`, `foundation` |
| Écriture (POST/PUT/PATCH/DELETE, mutations `:write`) | `apiWrite`       | `circuit`, `editor`, `foundation`          |

- **État réel** : seules les **écritures** passent par ce gate (REST
  `withPublicWrite`, mutation GraphQL). Aucune lecture ne l'évalue : la ligne
  `apiRead` ci-dessus n'est vérifiée par aucune route aujourd'hui.
- Le plan est chargé au moment où le token résout le tenant
  (`resolveApiTokenFromHeader`) et porté par `PublicApiToken.plan`.
- Capacité manquante → `403 { "error": "plan_required", "message": "…",
"requiredCapability": "apiRead" | "apiWrite" }` (REST) — **`plan_required` est
  la valeur de `error`, il n'y a pas de champ `code`** ; en GraphQL,
  `extensions.code = FORBIDDEN`, `extensions.reason = plan_required`.
- Ordre REST : le gate plan est évalué AVANT la portée (un token sans le bon
  plan reçoit `plan_required`, pas `INSUFFICIENT_SCOPE`).
- Un plan payant **expiré / `past_due`** retombe sur `discovery` (ni `apiRead`
  ni `apiWrite`) → `403`. `foundation` a tout, n'est jamais gated.
- **Exemption partenaire (`comp`)** : une clé dont la colonne
  `tenant_api_tokens.comp` vaut `true` **bypasse entièrement** ce gate (accès
  gratuit lecture + écriture, quel que soit le plan du tenant, y compris
  `discovery` / expiré). Réservé à l'opérateur plateforme : activer `comp` via
  l'admin API exige le rôle `owner` (`403 FORBIDDEN_COMP` sinon). Migration :
  `database/migrations/add_comp_to_tenant_api_tokens.sql`.
- Périmètre : ce gate ne concerne QUE l'auth par `tenant_api_tokens`. L'API bot
  (`/api/bot/v1/*`, `BOT_API_KEY` + `x-tenant-id`), les endpoints publics
  anonymes et l'admin staff ne sont PAS touchés.

### Quota & rate-limit durables (par plan)

Sur la surface **authentifiée** (écritures REST + mutations GraphQL), un
compteur **durable partagé** (Postgres, pas d'in-memory) applique par tenant :

| Plan                   | Rate-limit / min | Quota mensuel |
| ---------------------- | ---------------- | ------------- |
| `foundation`, `editor` | illimité         | illimité      |
| `circuit`              | 120              | 500 000       |
| `regie`                | 60               | 100 000       |
| `discovery`            | — (bloqué au gate plan) | —      |

- Dépassement minute → `429 RATE_LIMITED` ; dépassement mois → `429
  QUOTA_EXCEEDED`. Headers : `Retry-After`, `X-RateLimit-Scope`,
  `X-RateLimit-Limit` (+ `X-RateLimit-Remaining` sur succès).
- Implémentation : table `api_usage_counters` + RPC `consume_api_usage`
  (migration `add_api_usage_counters.sql`), consommée par
  `utils/billing/apiQuota.ts`. Plans illimités = **aucune écriture DB**.
- **Fail-open** : si le compteur est indisponible (DB KO), on ne bloque pas.
- **`comp`** (exemption partenaire) : non compté.
- Les limites numériques vivent dans `utils/billing/planFeatures.ts`
  (`apiRateLimitPerMin`, `apiMonthlyQuota`). Le quota `regie` n'est jamais
  consommé en pratique : `regie` n'a pas `apiWrite`, et seules les écritures
  sont comptées.
- Avant le quota, l'écriture REST applique aussi 30 requêtes/min par IP et
  15/min par token (`ACTOR_RATE_LIMIT`), en mémoire par instance.
- **Lectures REST** `/api/public/v1/*` : 120 requêtes/min par IP et par
  endpoint, en deux passes (limiteur en mémoire dont le 429 n'a **pas** de
  `code`, puis compteur durable `RATE_LIMITED`, fail-open).
- **GraphQL** : aucune limite de débit applicative (requêtes comme mutation,
  hors quota de plan de la mutation).

## 2. Enveloppe & codes d'erreur (REST)

Succès : `{ "data": … }`. Erreur : `{ "error": "message", "code": "CODE" }`
(`fields` en plus sur `INVALID_BODY` / `INVALID_QUERY`).

**Catalogue complet et sens de chaque code : schéma `PublicApiErrorCode` de la
spec** (gardé par `tests/unit/apiErrorCodeCatalog.test.ts`). Résumé :

| HTTP | code                                             | quand                                                                          |
| ---- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| 401  | `UNAUTHORIZED`                                   | token absent / mal formé / inconnu / révoqué / expiré (non distingués)         |
| 403  | `INSUFFICIENT_SCOPE`                             | token valide, scope manquant                                                   |
| 403  | _(aucun)_                                        | plan insuffisant : `{ "error": "plan_required", "message", "requiredCapability" }`, sans `code` |
| 405  | `METHOD_NOT_ALLOWED`                             | méthode non autorisée (+ header `Allow`)                                       |
| 429  | _(aucun)_ / `RATE_LIMITED` / `ACTOR_RATE_LIMIT`  | limiteur IP en mémoire (sans `code`) / compteur durable ou débit du plan / par token |
| 429  | `QUOTA_EXCEEDED`                                 | quota mensuel du plan dépassé (compteur durable) ; header `Retry-After`        |
| 503  | `MAINTENANCE_MODE`                               | écritures gelées (maintenance)                                                 |
| 400  | `INVALID_BODY` / `INVALID_QUERY` / `BAD_REQUEST` | validation                                                                     |
| 404  | `NOT_FOUND`                                      | ressource inconnue dans le tenant                                              |
| 409  | `CONFLICT`                                       | conflit d'état (ex. match déjà clôturé)                                        |
| 500  | `INTERNAL`                                       | erreur serveur (aussi 503 `INTERNAL` si la base est indisponible)              |

Formulaires du site (`free-players`, `team-openings` et leurs routes de
retrait) : `CAPTCHA`, `VALIDATION`, `INVALID_TOKEN` — hors intégration.

### Idempotency

Les écritures honorent `Idempotency-Key: <clé ≤200 chars>`. Une réponse 2xx est
mise en cache 5 min (table `bot_idempotency`, clés préfixées `pub:`, scopées par
tenant) et **rejouée** (`Idempotency-Replay: true`) pour la même clé **et le même
body**. Un body différent avec la même clé n'est PAS rejoué (recalcul normal).

Middleware : `utils/publicWriteApi.ts` → `withPublicWrite(handler, opts)`.

## 3. Endpoints REST d'écriture

### `POST /api/public/v1/matches/{id}/result` — scope `matches:write`

Pose le score final d'un match (autorité directe, pas de consensus capitaine).
Réutilise le cœur `applyMatchScore()` (status `finished`, propagation bracket,
notifications). Idempotent.

Body :

```json
{ "team1Score": 2, "team2Score": 1 }
```

Réponse `200` :

```json
{
  "data": {
    "matchId": "…",
    "status": "finished",
    "team1Score": 2,
    "team2Score": 1,
    "winnerTeamId": "…"
  }
}
```

Erreurs notables : `404` match inconnu (dans l'espace du token), `400`
bye/équipes manquantes, `409` match déjà clôturé
(`finished`/`walkover`/`cancelled`). Toutes les réponses, avec exemples et
l'ordre exact des contrôles : fragment
`docs/openapi/paths/api/public/v1/matches/[id]/result.yaml`. Pas de CORS
(appel serveur à serveur) ; `Cache-Control: no-store`.

> _Endpoint pilote (Lot 3). Les suivants (création tournoi, patch équipe, …)
> suivront le même moule._

## 4. GraphQL — `POST /api/graphql`

Servi par graphql-yoga (`pages/api/graphql.ts`). GraphiQL + introspection en
**dev uniquement** (désactivés en prod). Garde de **profondeur max = 8**
(anti-DoS). Erreurs masquées par défaut (pas de fuite de stack). **Absent des
chemins de la spec OpenAPI** : décrit dans son introduction publique (section
« GraphQL »), dont `tests/unit/apiErrorCodeCatalog.test.ts` vérifie qu'elle
cite chaque code `extensions.code` émis.

- **Espace** (`utils/graphql/context.ts`) : celui du token s'il est valide ;
  sinon — pas de token, ou token inconnu / révoqué / expiré / mal formé —
  `DEFAULT_TENANT_ID`, **sans erreur**. Aucun `?tenant=`, aucun domaine.
  C'est aujourd'hui la seule voie pour lire les données d'un autre espace.
- **Queries** : anonymes autorisées. Le token n'y sert qu'à fixer l'espace :
  ni plan, ni portée, ni quota ne sont contrôlés.
- **Mutations** : exigent un token scopé (`Authorization: Bearer …`) ; ordre :
  token → plan → portée → quota → validation du score → match. Pas de mode
  maintenance, pas d'idempotence (différences avec l'écriture REST).
- **Limite de débit** : aucune au niveau applicatif (le commentaire du handler
  renvoie à l'infra).
- **Cache** : aucun en-tête de cache public posé ; utiliser `POST`.

### Schéma (extrait)

```graphql
type Query {
  tournaments(
    status: String
    game: String
    limit: Int = 50
    offset: Int = 0
  ): TournamentList!
  tournament(idOrSlug: String!): TournamentDetail # id OU slug
  match(id: ID!): MatchDetail
  team(idOrSlug: String!): Team
}

type Mutation {
  # scope requis : matches:write
  reportMatchResult(
    matchId: ID!
    team1Score: Int!
    team2Score: Int!
  ): MatchResultPayload!
}
```

- Les champs sont en `snake_case` (miroir 1:1 des projections REST read — les
  resolvers réutilisent `utils/public/read*`, jointures faites une fois → pas de
  N+1).
- `TournamentDetail.matches` est résolu paresseusement (seulement si demandé).
- Codes d'erreur mutation (extensions `code`) : `UNAUTHENTICATED`, `FORBIDDEN`
  (plan : `reason: plan_required` + `requiredCapability` ; ou portée),
  `RATE_LIMITED` / `QUOTA_EXCEEDED` (avec `retryAfterSec`, `limit`),
  `BAD_USER_INPUT`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_SERVER_ERROR`.
- Visibilité : mêmes lecteurs que le REST — tournois `published` / `running` /
  `completed`, matchs `pending` / `ongoing` / `finished` seulement (un
  `walkover`, `disputed`, `postponed` ou `cancelled` n'apparaît pas).

### Exemple

```bash
curl -X POST https://<host>/api/graphql \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer pk_live_…' \
  -d '{"query":"mutation($m:ID!){reportMatchResult(matchId:$m,team1Score:2,team2Score:1){status winnerTeamId}}","variables":{"m":"…"}}'
```

## 5. Portail développeur & spec machine-readable

- **Spec publique JSON/YAML** : `GET /api/public/openapi` (anonyme, CORS `*`,
  `?format=yaml` — non fiable aujourd'hui, cf. « Cache CDN »). Dérivée de la
  spec complète (fragments `docs/openapi/`) filtrée aux paths
  `/api/public/*` + composants transitivement référencés (aucune fuite
  bot/admin). Son `info.description` vient de `x-public-description`
  (`docs/openapi/root.yaml`). Générateur pur : `utils/openapi/publicSpec.ts`
  (`filterPublicSpec` / `buildPublicSpec`), couvert par
  `tests/unit/openapiPublicSpec.test.ts`.
- **Référence rendue** : `/developpeurs/reference` — SSR pur généré depuis la
  même spec (pas de swagger-ui/redoc : incompatible CSP à nonce + React 19).
  Rend l'introduction (« Guide »), les schémas de sécurité, les endpoints
  (badge déprécié, en-têtes et exemples de réponse) et le catalogue des codes.
  Gardes : `openapiContractDrift` (endpoints, méthodes, auth),
  `openapiPublicExamples` (chaque exemple v1 validé contre le zod du handler),
  `apiErrorCodeCatalog` (codes émis ↔ catalogue). Le reste des textes est
  rédigé à la main.
- **Clés API** : émises depuis `/admin/api-tokens` (espace actif) ou
  `/api/admin/tenants/{id}/api-tokens` (espace nommé, owner plateforme) —
  voir §1. La page `/developpeurs` redirige vers `/organisateurs`, dont la
  section « Développeurs » pointe vers la référence ; le namespace i18n
  `developpeursPage` (ancien guide) n'est plus rendu par aucune page.

### Changements de contrat

- **2026-09-15 — `tenant_id` retiré des ligues publiques.**
  `GET /api/public/v1/leagues`, `GET /api/public/v1/leagues/{slug}` (objet
  `league`) et `GET /api/leagues*` renvoyaient l'identifiant interne de
  l'espace, sans usage pour un partenaire : l'espace est déjà déterminé par le
  domaine appelé. Schéma `PublicLeague` (= `League` sans `tenant_id`) ; la
  lecture projette ses colonnes explicitement (`PUBLIC_LEAGUE_COLUMNS` +
  `toPublicLeague`), si bien qu'une colonne ajoutée à la table ne sort plus
  sans décision. L'admin (`/api/admin/leagues`) garde `League` complet.
- **2026-09-15 — réponses de l'API v1 décrites exactement.** Schémas générés
  depuis zod et vérifiés contre les types des handlers : plusieurs champs
  réellement renvoyés apparaissent enfin dans la spec (profil : `twitch`,
  `unrated`, `rank` nullable ; ligue : `scrims`, `scrimsCounted`). Aucun
  changement de réponse.

## 6. Webhooks sortants (outbound)

Un tenant abonne une URL et reçoit nos events en **POST signé** — le pendant
« push » de l'API (qui, elle, est « pull »).

- **Gestion** : `/admin/webhooks` (staff `admin`+). API : `GET`/`POST
  /api/admin/webhooks`, `PATCH`/`DELETE /api/admin/webhooks/{id}`, `GET
  /api/admin/webhooks/{id}/deliveries`. Le **secret de signature** est renvoyé
  **une seule fois** à la création (stocké en clair, service_role only, car le
  dispatcher doit signer).
- **Events exposables** (liste blanche `WEBHOOK_EVENT_TYPES`, `utils/webhooks.ts`)
  — sous-ensemble PUBLIC : `match.scheduled/starting/finished/disputed/
  dispute.resolved/forfeit`, `tournament.finalized`, `registration.new`,
  `news.published`, `checkin.opened`. Les events Discord internes ne sont
  **jamais** exposés (même via `'*'`). **`match.forfeit` n'est émis par aucun
  code aujourd'hui** (le forfait émet `team.forfeit`, interne) : un abonnement
  à cet event ne reçoit rien.
- **Catalogue public** : `GET /api/public/webhook-events` (anonyme, CORS `*`,
  edge-caché `s-maxage=3600`) renvoie
  `{ data: { events: [{ type, description }], signature: { header, algo, format } } }`
  — dérivé de la même liste blanche `WEBHOOK_EVENT_TYPES`, sans dupliquer la copie
  côté client. Handler : `pages/api/public/webhook-events.ts`.
- **Livraison** : le cron `webhook-dispatcher-cron` (chaque minute) lit
  `bot_event_outbox` en **read-only** (3ᵉ sink après web-push / email — ne touche
  pas `.status`, propriété du bot), fan-out vers les abonnements actifs, tracking
  + idempotence dans `webhook_deliveries` (`UNIQUE(subscription_id,
  outbox_event_id)`). Handler : `pages/api/cron/webhook-dispatch.ts`.
- **Signature** : en-tête `X-Webhook-Signature: sha256=<hmac hex>` = HMAC-SHA256
  du corps brut avec le secret d'abonnement. Autres en-têtes : `X-Webhook-Event`,
  `X-Webhook-Id`, `X-Tenant-Id`. Le corps EST l'enveloppe outbox
  `{ id, event, tenantId, timestamp, data }`.
- **Retry** : chaque (event, abonnement) est re-tentée à chaque tick jusqu'à
  `WEBHOOK_MAX_ATTEMPTS` (5). Un endpoint qui échoue
  `WEBHOOK_MAX_CONSECUTIVE_FAILURES` (15) fois d'affilée est **auto-désactivé** ;
  un succès remet le compteur à 0. Succès = réponse 2xx en moins de 8 s
  (`DELIVERY_TIMEOUT_MS`) ; seuls les events des dernières 24 h
  (`WEBHOOK_WINDOW_HOURS`, 200 par passage au plus) sont examinés.
- La forme de `data` par event n'est pas encore décrite côté partenaire.
- Tables : `webhook_subscriptions` / `webhook_deliveries` (migration
  `create_webhook_subscriptions_and_deliveries.sql`), RLS service_role only.

## 7. À maintenir en sync (anti-dérive)

Toute évolution de cette surface DOIT mettre à jour, ensemble :

- les handlers (`pages/api/public/v1/*` write, `pages/api/graphql.ts`, schéma) ;
- ce document ;
- le fragment OpenAPI de la route, `docs/openapi/paths/api/…` au même
  emplacement que le handler (le contract-drift `tests/unit/openapiContractDrift.test.ts`
  échoue sinon) — la spec publique en dérive automatiquement ;
- le picker de scopes admin (dérivé de `utils/apiScopes.ts` — automatique) ;
- (à ajouter) un test de non-régression du SDL GraphQL (snapshot) et de la liste
  des scopes, sur le modèle du contract-drift OpenAPI du bot.
