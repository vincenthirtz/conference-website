# Public API Contract — écriture + GraphQL

> Surface **publique authentifiée** de l'API (feature "API publique élargie").
> Distincte de :
>
> - l'API publique **read-only anonyme** (`/api/public/v1/*` en `GET`, CORS `*`,
>   cf. `utils/publicApi.ts`) ;
> - l'API **bot** (`/api/bot/v1/*`, clé per-tenant + acteur Discord, cf.
>   `docs/BOT_API_CONTRACT.md`).
>
> Cette surface-ci sert les **orgas tierces** qui automatisent (scripts de
> résultats, overlays, intégrations). Auth par **token scopé découplé du bot**.

## 1. Authentification

En-tête sur toute requête d'écriture (et les mutations GraphQL) :

```
Authorization: Bearer pk_live_<64 hex>
```

- Le token est émis par le staff depuis `/admin/api-tokens` (endpoints
  `pages/api/admin/api-tokens/*`). Il est affiché **une seule fois** à la
  création — seul son `token_prefix` (`pk_live_a1b2c3…`) reste visible ensuite.
- Stockage : `tenant_api_tokens` (sha256 du token, jamais le clair ; RLS
  service-role only). Lookup inbound = sha256(header) → row non révoquée.
- Le **tenant est autoritaire** : déterminé par le token, pas par un header.
- Révocation : soft (`revoked_at`), un token révoqué → `401`.
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

### Gate PLAN (entitlement facturé)

Les clés API sont un **produit payant**. Indépendamment des scopes, l'accès
dépend du **plan effectif** du tenant propriétaire du token (cf.
`utils/billing/planFeatures.ts`, gate `utils/billing/apiPlanGate.ts`) :

| Accès                                                | Capacité requise | Plans qui l'ouvrent                        |
| ---------------------------------------------------- | ---------------- | ------------------------------------------ |
| Lecture (GET/HEAD, mutations `:read`)                | `apiRead`        | `regie`, `circuit`, `editor`, `foundation` |
| Écriture (POST/PUT/PATCH/DELETE, mutations `:write`) | `apiWrite`       | `circuit`, `editor`, `foundation`          |

- Le plan est chargé au moment où le token résout le tenant
  (`resolveApiTokenFromHeader`) et porté par `PublicApiToken.plan`.
- Capacité manquante → `403 { "error": "plan_required", "message": "…",
"requiredCapability": "apiRead" | "apiWrite" }` (REST) ; en GraphQL,
  `extensions.code = FORBIDDEN`, `extensions.reason = plan_required`.
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
  (`apiRateLimitPerMin`, `apiMonthlyQuota`). Les **lectures anonymes**
  `/api/public/v1/*` gardent le limiteur in-memory par IP (~120/min).

## 2. Enveloppe & codes d'erreur (REST)

Succès : `{ "data": … }`. Erreur : `{ "error": "message", "code": "CODE" }`.

| HTTP | code                                             | quand                                                                          |
| ---- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| 401  | `UNAUTHORIZED`                                   | token absent / invalide / révoqué                                              |
| 403  | `INSUFFICIENT_SCOPE`                             | token valide, scope manquant                                                   |
| 403  | `plan_required`                                  | plan du tenant insuffisant (voir Gate PLAN) ; corps porte `requiredCapability` |
| 405  | `METHOD_NOT_ALLOWED`                             | méthode non autorisée (+ header `Allow`)                                       |
| 429  | `RATE_LIMITED` / `ACTOR_RATE_LIMIT`              | rate-limit IP / par token (in-memory) ou rate-limit/min durable par plan       |
| 429  | `QUOTA_EXCEEDED`                                 | quota mensuel du plan dépassé (compteur durable) ; header `Retry-After`        |
| 503  | `MAINTENANCE_MODE`                               | écritures gelées (maintenance)                                                 |
| 400  | `INVALID_BODY` / `INVALID_QUERY` / `BAD_REQUEST` | validation                                                                     |
| 404  | `NOT_FOUND`                                      | ressource inconnue dans le tenant                                              |
| 409  | `CONFLICT`                                       | conflit d'état (ex. match déjà clôturé)                                        |
| 500  | `INTERNAL`                                       | erreur serveur                                                                 |

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

Erreurs notables : `404` match inconnu, `400` bye/équipes manquantes, `409`
match déjà clôturé (`finished`/`walkover`/`cancelled`).

> _Endpoint pilote (Lot 3). Les suivants (création tournoi, patch équipe, …)
> suivront le même moule._

## 4. GraphQL — `POST /api/graphql`

Servi par graphql-yoga (`pages/api/graphql.ts`). GraphiQL + introspection en
**dev uniquement** (désactivés en prod). Garde de **profondeur max = 8**
(anti-DoS). Erreurs masquées par défaut (pas de fuite de stack).

- **Queries** : lecture **anonyme** autorisée (même posture que le REST public
  read). Sans token, le tenant résolu = `DEFAULT_TENANT_ID` (mono-tenant V1).
- **Mutations** : exigent un token scopé (`Authorization: Bearer …`).

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
- Codes d'erreur mutation (extensions `code`) : `UNAUTHENTICATED`, `FORBIDDEN`,
  `BAD_USER_INPUT`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_SERVER_ERROR`.

### Exemple

```bash
curl -X POST https://<host>/api/graphql \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer pk_live_…' \
  -d '{"query":"mutation($m:ID!){reportMatchResult(matchId:$m,team1Score:2,team2Score:1){status winnerTeamId}}","variables":{"m":"…"}}'
```

## 5. Portail développeur & spec machine-readable

- **Spec publique JSON/YAML** : `GET /api/public/openapi` (anonyme, CORS `*`,
  `?format=yaml`). Dérivée de `docs/openapi.yaml` filtrée aux paths
  `/api/public/*` + composants transitivement référencés (aucune fuite
  bot/admin). Générateur pur : `utils/openapi/publicSpec.ts`
  (`filterPublicSpec` / `buildPublicSpec`), couvert par
  `tests/unit/openapiPublicSpec.test.ts`.
- **Référence rendue** : `/developpeurs/reference` — SSR pur généré depuis la
  même spec (pas de swagger-ui/redoc : incompatible CSP à nonce + React 19).
  Toujours en phase avec les endpoints réels, donc anti-dérive.
- **Clés API self-service** : créées par un admin d'orga depuis
  `/admin/api-tokens` (affichées une seule fois). Le guide public
  `/developpeurs` pointe vers cette page.

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
  **jamais** exposés (même via `'*'`).
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
  un succès remet le compteur à 0.
- Tables : `webhook_subscriptions` / `webhook_deliveries` (migration
  `create_webhook_subscriptions_and_deliveries.sql`), RLS service_role only.

## 7. À maintenir en sync (anti-dérive)

Toute évolution de cette surface DOIT mettre à jour, ensemble :

- les handlers (`pages/api/public/v1/*` write, `pages/api/graphql.ts`, schéma) ;
- ce document ;
- `docs/openapi.yaml` (le contract-drift `tests/unit/openapiContractDrift.test.ts`
  échoue sinon) — la spec publique en dérive automatiquement ;
- le picker de scopes admin (dérivé de `utils/apiScopes.ts` — automatique) ;
- (à ajouter) un test de non-régression du SDL GraphQL (snapshot) et de la liste
  des scopes, sur le modèle du contract-drift OpenAPI du bot.
