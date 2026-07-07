# Public API Contract — écriture + GraphQL

> Surface **publique authentifiée** de l'API (feature "API publique élargie").
> Distincte de :
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

| Ressource | Actions |
|---|---|
| `tournaments` | `read`, `write` |
| `matches` | `read`, `write` |
| `teams` | `read`, `write` |
| `players` | `read`, `write` |

Un endpoint déclare le scope qu'il exige. Scope absent du token → `403
INSUFFICIENT_SCOPE`. Pas d'implication : `matches:write` n'implique pas
`matches:read`.

## 2. Enveloppe & codes d'erreur (REST)

Succès : `{ "data": … }`. Erreur : `{ "error": "message", "code": "CODE" }`.

| HTTP | code | quand |
|---|---|---|
| 401 | `UNAUTHORIZED` | token absent / invalide / révoqué |
| 403 | `INSUFFICIENT_SCOPE` | token valide, scope manquant |
| 405 | `METHOD_NOT_ALLOWED` | méthode non autorisée (+ header `Allow`) |
| 429 | `RATE_LIMITED` / `ACTOR_RATE_LIMIT` | quota IP ou quota par token |
| 503 | `MAINTENANCE_MODE` | écritures gelées (maintenance) |
| 400 | `INVALID_BODY` / `INVALID_QUERY` / `BAD_REQUEST` | validation |
| 404 | `NOT_FOUND` | ressource inconnue dans le tenant |
| 409 | `CONFLICT` | conflit d'état (ex. match déjà clôturé) |
| 500 | `INTERNAL` | erreur serveur |

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
{ "data": { "matchId": "…", "status": "finished",
            "team1Score": 2, "team2Score": 1, "winnerTeamId": "…" } }
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
  tournaments(status: String, game: String, limit: Int = 50, offset: Int = 0): TournamentList!
  tournament(idOrSlug: String!): TournamentDetail   # id OU slug
  match(id: ID!): MatchDetail
  team(idOrSlug: String!): Team
}

type Mutation {
  # scope requis : matches:write
  reportMatchResult(matchId: ID!, team1Score: Int!, team2Score: Int!): MatchResultPayload!
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

## 5. À maintenir en sync (anti-dérive)

Toute évolution de cette surface DOIT mettre à jour, ensemble :
- les handlers (`pages/api/public/v1/*` write, `pages/api/graphql.ts`, schéma) ;
- ce document ;
- le picker de scopes admin (dérivé de `utils/apiScopes.ts` — automatique) ;
- (à ajouter) un test de non-régression du SDL GraphQL (snapshot) et de la liste
  des scopes, sur le modèle du contract-drift OpenAPI du bot.
