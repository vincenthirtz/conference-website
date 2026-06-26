# Caster ↔ Site API Contract — `/api/caster/v1/`, `/api/scrims/`, `/api/twitch/`

Canonical contract for the HTTP API consumed by the **womenscup-caster**
Electron desktop app (sibling repo `womenscup-caster`). The website is the
source of truth for shapes; the caster app is the authorised consumer.

When in doubt, the handlers under [`pages/api/caster/v1/`](../pages/api/caster/v1/),
[`pages/api/scrims/`](../pages/api/scrims/), [`pages/api/twitch/`](../pages/api/twitch/)
and the shared body in [`utils/casterApi.ts`](../utils/casterApi.ts) are
authoritative. This doc summarises the cross-cutting rules and lists every
endpoint the desktop app calls.

Client call sites in the caster repo:
`src/main/utils/tournamentsApi.js`, `src/main/scrim.js`, `src/main/twitch.js`.

---

## Overview

The caster app reads tournament / match / scrim data over HTTP (decoupled from
the DB schema) and delegates the Twitch OAuth token exchange to the server so
`TWITCH_CLIENT_SECRET` never ships in the Electron binary.

Three families, three different postures:

| Family           | Base path          | Versioned?         | Auth        |
| ---------------- | ------------------ | ------------------ | ----------- |
| Caster app reads | `/api/caster/v1/*` | **yes** (`/v1/`)   | public GET  |
| Scrims (shared)  | `/api/scrims/*`    | no (shared w/ web) | public GET  |
| Twitch OAuth     | `/api/twitch/*`    | no                 | public POST |

- **Transport**: HTTPS, JSON in/out.
- **Production host**: site origin. The caster points at `CONFERENCE_API_BASE`
  (default `https://owwomenscup.fr`, `http://localhost:3000` in dev).
- All reads use `supabaseAdmin` (service role) for tenant-scoped public data —
  the data is already public on the site, so the posture is "public GET, scoped
  read".

## Versioning

- **Caster reads** are path-prefixed under `/api/caster/v1/*`. A breaking change
  ships under `/v2/` rather than mutating `/v1/`. These are the **canonical**
  routes the caster app should target.
- **Legacy aliases** (`/api/caster/tournaments*`, `/api/caster/matches/:id`)
  remain functional but are **deprecated**. They forward to the exact same
  shared handler (`utils/casterApi.ts`) and additionally stamp:
  - `Deprecation: true`
  - `Sunset: Wed, 23 Dec 2026 00:00:00 GMT` (~6 months; constant
    `CASTER_LEGACY_SUNSET` in `utils/casterApi.ts`)
  - `Link: </api/caster/v1/...>; rel="successor-version"`
    Runtime behaviour is unchanged — the caster app keeps the same body/status.
    Migrate the caster client to `/v1/` before the Sunset date.
- **`/api/scrims/*`** is **NOT** versioned: it is a public contract shared with
  the web overlays/pages, not caster-specific.
- **`/api/twitch/*`** is **NOT** versioned.

## Tenant mechanism (known asymmetry)

The site is multi-tenant (`tenant_id` on the relevant tables). The two read
families resolve the tenant differently — this asymmetry is **intentional and
known**:

| Family             | Resolver                               | `x-tenant-id` header | Behaviour                                                                 |
| ------------------ | -------------------------------------- | -------------------- | ------------------------------------------------------------------------- |
| `/api/caster/v1/*` | `resolveTenantId(req)`                 | **honoured**         | Valid UUID header → that tenant. Missing/malformed → `DEFAULT_TENANT_ID`. |
| `/api/scrims/*`    | `resolveTenantIdForPublicRequest(req)` | **ignored**          | Always `DEFAULT_TENANT_ID` (conference) regardless of header.             |

- `/api/caster/v1/*` treats the caster like the bot: an optional
  `x-tenant-id: <uuid>` header (RFC 4122, case-insensitive) selects the tenant,
  falling back to `DEFAULT_TENANT_ID` when absent or malformed. This lets the
  Electron app point at the e2e tenant in E2E mode.
- `/api/scrims/*` is a legacy public resolver that currently **forces**
  `DEFAULT_TENANT_ID` and ignores any header — the scrims pages are still
  mono-tenant on the site. When the public pages migrate to the path-prefix
  resolver (`resolveTenantIdForPublicRequestAsync`, see `utils/tenant.ts` TODOs),
  this asymmetry should be revisited. Until then, the caster only ever sees the
  conference tenant's public scrims via `/api/scrims/*`.

`DEFAULT_TENANT_ID` = `ce69a726-773e-4d12-b5eb-d2503aa752b4` (conference).

## Rate limits

Per-IP buckets, 60 s window. Limit hit → `429` with `Retry-After`. The caster
should honour `Retry-After` when present.

| Route family             | Limit    | Buckets                                                                                                 |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------- |
| `/api/caster/v1/*`       | 60 / min | `caster-v1-tournaments`, `caster-v1-tournament-matches`, `caster-v1-tournament-maps`, `caster-v1-match` |
| `/api/caster/*` (legacy) | 60 / min | `caster-tournaments`, `caster-tournament-matches`, `caster-tournament-maps`, `caster-match`             |
| `/api/scrims/*`          | 60 / min | `scrims-list`, `scrims-detail`                                                                          |
| `/api/twitch/*`          | 20 / min | `twitch-exchange`, `twitch-refresh`                                                                     |

> The legacy and v1 caster routes use **separate** buckets, so a client hitting
> both does not double-count against one IP cap.

## Error shape

Consistent across handlers:

```json
{ "error": "Human-readable message", "code": "OPTIONAL_MACHINE_CODE" }
```

| Code | When                                                         |
| ---- | ------------------------------------------------------------ |
| 200  | OK                                                           |
| 400  | Validation error (malformed UUID, invalid `status` enum)     |
| 404  | Target resource not found (scrim / match)                    |
| 405  | Method not allowed — response includes `Allow` header        |
| 429  | Rate limit hit — response includes `Retry-After`             |
| 500  | Server config (service role unset / DB unavailable) or error |

---

## Endpoint inventory — `/api/caster/v1/*` (canonical)

All GET-only, public, tenant via `x-tenant-id` (optional). Shared body in
[`utils/casterApi.ts`](../utils/casterApi.ts).

### `GET /api/caster/v1/tournaments`

List of tournaments for the caster app.

- **Auth**: none. **Tenant**: `x-tenant-id` (optional).
- **Request**: no params.
- **Response 200**:

```json
{
  "tournaments": [
    {
      "id": "uuid",
      "name": "Spring Cup 2026",
      "slug": "spring-cup-2026",
      "game": "overwatch",
      "status": "running",
      "start_date": "2026-05-01T18:00:00.000Z",
      "format_type": "single_elimination"
    }
  ]
}
```

- **Tournament statuses returned**: only `running`, `published`.
- **Errors**: `405`, `429`, `500`.

### `GET /api/caster/v1/tournaments/:id/matches`

Matches for a tournament.

- **Auth**: none. **Tenant**: `x-tenant-id` (optional).
- **Request**: path `:id` — tournament UUID (validated).
- **Response 200**:

```json
{
  "matches": [
    {
      "id": "uuid",
      "status": "ongoing",
      "best_of": 3,
      "match_format": "bo3",
      "scheduled_at": "2026-05-01T19:00:00.000Z",
      "team1_score": 1,
      "team2_score": 0,
      "round_name": "Quarterfinal",
      "stream_url": "https://twitch.tv/...",
      "team1": {
        "id": "uuid",
        "name": "Chaos Theory",
        "short_name": "CTH",
        "logo_url": "..."
      },
      "team2": {
        "id": "uuid",
        "name": "Phoenix Rising",
        "short_name": "PHX",
        "logo_url": "..."
      }
    }
  ]
}
```

- **Match statuses returned**: only `pending`, `ongoing`, `finished`.
- **Errors**: `400` (invalid id), `405`, `429`, `500`.

### `GET /api/caster/v1/tournaments/:id/maps`

Enabled maps configured for a tournament.

- **Auth**: none. **Tenant**: `x-tenant-id` (optional).
- **Request**: path `:id` — tournament UUID (validated).
- **Response 200**:

```json
{
  "maps": [
    {
      "id": "uuid",
      "map_name": "Ilios",
      "map_type": "control",
      "image_url": "..."
    }
  ]
}
```

- **Errors**: `400` (invalid id), `405`, `429`, `500`.

### `GET /api/caster/v1/matches/:id`

Single match detail + its games.

- **Auth**: none. **Tenant**: `x-tenant-id` (optional).
- **Request**: path `:id` — match UUID (validated).
- **Response 200**:

```json
{
  "match": {
    "id": "uuid",
    "status": "ongoing",
    "best_of": 3,
    "match_format": "bo3",
    "scheduled_at": "2026-05-01T19:00:00.000Z",
    "team1_score": 1,
    "team2_score": 0,
    "round_name": "Quarterfinal",
    "stream_url": "https://twitch.tv/...",
    "team1": {
      "id": "uuid",
      "name": "Chaos Theory",
      "short_name": "CTH",
      "logo_url": "..."
    },
    "team2": {
      "id": "uuid",
      "name": "Phoenix Rising",
      "short_name": "PHX",
      "logo_url": "..."
    }
  },
  "games": [
    {
      "id": "uuid",
      "map_name": "Ilios",
      "map_order": 1,
      "team1_score": 2,
      "team2_score": 1
    }
  ]
}
```

> **Shape note**: `stream_url` is now selected here too, matching
> `/api/caster/v1/tournaments/:id/matches` — the two endpoints of the same
> domain expose the same match columns.

- **Errors**: `400` (invalid id), `404` (match not found), `405`, `429`, `500`.

## Endpoint inventory — `/api/caster/*` (legacy, DEPRECATED)

Same shapes as the v1 routes above (they share the body). The only difference
is the `Deprecation` / `Sunset` / `Link` response headers. **Sunset:
2026-12-23.** Migrate the caster client to the `/v1/` equivalents.

| Legacy route                              | Successor (`Link`)                       |
| ----------------------------------------- | ---------------------------------------- |
| `GET /api/caster/tournaments`             | `/api/caster/v1/tournaments`             |
| `GET /api/caster/tournaments/:id/matches` | `/api/caster/v1/tournaments/:id/matches` |
| `GET /api/caster/tournaments/:id/maps`    | `/api/caster/v1/tournaments/:id/maps`    |
| `GET /api/caster/matches/:id`             | `/api/caster/v1/matches/:id`             |

## Endpoint inventory — `/api/scrims/*` (public, shared, NOT versioned)

Public read of `is_public = true` scrims, tenant forced to `DEFAULT_TENANT_ID`
(see asymmetry above). Drafts (`status = 'draft'`) are always hidden.

**Scrim status enum (canonical)**: `draft`, `scheduled`, `running`,
`completed`, `cancelled`. (`draft` is never exposed publicly.)

### `GET /api/scrims`

List of public scrims.

- **Auth**: none. **Tenant**: ignored, always conference.
- **Query**:
  - `status` _(optional)_ — one of the enum above. Invalid value →
    `400 { code: "INVALID_STATUS" }` (no longer a silent empty list).
  - `limit` _(optional, int, 1..100, default 50)_.
- **Response 200**:

```json
{
  "scrims": [
    {
      "id": "uuid",
      "name": "Pulse vs Echo — Scrim",
      "slug": "pulse-vs-echo",
      "game": "overwatch",
      "status": "scheduled",
      "scheduled_date": "2026-05-21T18:00:00.000Z",
      "timezone": "Europe/Paris",
      "logo_url": "...",
      "stream_url": "...",
      "team1_id": "uuid",
      "team2_id": "uuid",
      "team1": {
        "id": "uuid",
        "name": "Pulse",
        "short_name": "PLS",
        "slug": "pulse",
        "logo_url": "..."
      },
      "team2": {
        "id": "uuid",
        "name": "Echo",
        "short_name": "ECH",
        "slug": "echo",
        "logo_url": "..."
      }
    }
  ]
}
```

- **Ordering**: `scheduled_date` desc (nulls last), then `created_at` desc.
- **Errors**: `400` (invalid status), `405`, `429`, `500`.

### `GET /api/scrims/:idOrSlug`

Detail of one public scrim (by UUID or slug) + its matches.

- **Auth**: none. **Tenant**: ignored, always conference.
- **Request**: path `:idOrSlug` — UUID (matched on `id`) or slug (matched on
  `slug`).
- **Response 200**:

```json
{
  "scrim": {
    "id": "uuid",
    "name": "Pulse vs Echo — Scrim",
    "slug": "pulse-vs-echo",
    "game": "overwatch",
    "status": "scheduled",
    "scheduled_date": "2026-05-21T18:00:00.000Z",
    "timezone": "Europe/Paris",
    "logo_url": "...",
    "banner_url": "...",
    "description": "...",
    "stream_url": "...",
    "team1_id": "uuid",
    "team2_id": "uuid",
    "team1": {
      "id": "uuid",
      "name": "Pulse",
      "short_name": "PLS",
      "slug": "pulse",
      "logo_url": "..."
    },
    "team2": {
      "id": "uuid",
      "name": "Echo",
      "short_name": "ECH",
      "slug": "echo",
      "logo_url": "..."
    }
  },
  "matches": [
    {
      "id": "uuid",
      "status": "pending",
      "is_bye": false,
      "best_of": 3,
      "match_format": "bo3",
      "team1_id": "uuid",
      "team2_id": "uuid",
      "team1_score": 0,
      "team2_score": 0,
      "winner_team_id": null,
      "forfeit_team_id": null,
      "scheduled_at": null,
      "started_at": null,
      "completed_at": null,
      "stream_url": null,
      "replay_url": null,
      "lobby_code": null,
      "team1": {
        "id": "uuid",
        "name": "Pulse",
        "short_name": "PLS",
        "logo_url": "..."
      },
      "team2": {
        "id": "uuid",
        "name": "Echo",
        "short_name": "ECH",
        "logo_url": "..."
      }
    }
  ]
}
```

- **Errors**: `400` (missing id), `404` (not found / private / draft), `405`,
  `429`, `500`.

## Endpoint inventory — `/api/twitch/*` (OAuth, server-side secret)

The caster app holds only the public `client_id` + the user access token. The
server holds `TWITCH_CLIENT_SECRET` (via `clientCreds()`) and performs the
token grants. Same Twitch application as the site.

### `POST /api/twitch/exchange`

Exchange an `authorization_code` for tokens.

- **Auth**: none (public POST). **Rate limit**: 20/min (`twitch-exchange`).
- **Body**:

```json
{
  "code": "<oauth code>",
  "redirectUri": "http://localhost:3456/twitch/callback"
}
```

- **Response 200**:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_in": 14400,
  "scope": ["chat:read", "chat:edit"],
  "token_type": "bearer"
}
```

- **Errors**: `400` (`INVALID_CODE`, `INVALID_REDIRECT_URI`), `405`, `429`,
  `500` (`TWITCH_NOT_CONFIGURED`), `502` (`TWITCH_EXCHANGE_FAILED`).

### `POST /api/twitch/refresh`

Refresh an expired access token.

- **Auth**: none (public POST). **Rate limit**: 20/min (`twitch-refresh`).
- **Body**:

```json
{ "refresh_token": "..." }
```

- **Response 200**: same shape as `/exchange`.
- **Errors**: `400` (`INVALID_REFRESH_TOKEN`), `405`, `429`,
  `500` (`TWITCH_NOT_CONFIGURED`), `502` (`TWITCH_REFRESH_FAILED`).

---

## Out of scope — caster cockpit / run-of-show

The following `/api/caster/*` routes belong to a **separate web feature**
(staff cockpit / run-of-show) guarded by `withCasterRoute`. They are **NOT**
called by the womenscup-caster Electron app and are **NOT** versioned here.
Listed only so this inventory stays unambiguous:

- `/api/caster/auth/*` (magic-link)
- `/api/caster/briefing/[matchId]`
- `/api/caster/cues/[cueId]/ack`
- `/api/caster/heartbeat`
- `/api/caster/me`
- `/api/caster/runs/*`
- `/api/caster/segments/*`

## Residual realtime channel (outside the HTTP API)

For live score updates the caster does **not** poll the HTTP API — it
subscribes directly to **Supabase Realtime** `postgres_changes` on
`public.matches` (the caster's `tournaments:subscribe-match`). That channel is
outside this contract: it talks to Supabase directly, not to the site. All
other reads (tournament list / matches / detail / maps) go through
`/api/caster/v1/*`, and scrims through `/api/scrims/*`.

---

## Where it lives

- **Shared caster handlers** — [`utils/casterApi.ts`](../utils/casterApi.ts)
  (body of v1 + legacy, `CASTER_LEGACY_SUNSET`, `markCasterLegacyDeprecated`).
- **v1 routes** — [`pages/api/caster/v1/`](../pages/api/caster/v1/).
- **Legacy aliases** — [`pages/api/caster/tournaments/`](../pages/api/caster/tournaments/),
  [`pages/api/caster/matches/[id].ts`](../pages/api/caster/matches/[id].ts).
- **Scrims** — [`pages/api/scrims/`](../pages/api/scrims/).
- **Twitch OAuth** — [`pages/api/twitch/`](../pages/api/twitch/),
  secret via [`utils/twitch.ts`](../utils/twitch.ts) `clientCreds()`.
- **Rate limit primitives** — [`utils/rateLimit.ts`](../utils/rateLimit.ts).
- **Tenant resolution** — [`utils/tenant.ts`](../utils/tenant.ts).
- **Consumer (caster app)** — `womenscup-caster/src/main/utils/tournamentsApi.js`,
  `src/main/scrim.js`, `src/main/twitch.js` (sibling repo).

## Extending the contract

When you add a caster read endpoint:

1. Put the canonical route under `pages/api/caster/v1/<resource>/...`.
2. Extract the body into `utils/casterApi.ts` so a legacy alias (if any) can
   share it without drift.
3. Validate path/query params (UUID via `isValidUUID`, enums explicitly).
4. Apply `applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, '<unique-key>')`.
5. Use `resolveTenantId(req)` (honours `x-tenant-id`) for caster reads.
6. Update this doc's inventory + the OpenAPI spec (`docs/openapi.yaml`).
