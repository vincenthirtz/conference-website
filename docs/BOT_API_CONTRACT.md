# Bot ↔ Site API Contract — `/api/bot/v1/`

Canonical contract for the HTTP API consumed by the Discord bot
([docker-box `services/discord-bot/`](https://github.com/) — sibling repo).
The website is the source of truth for shapes; the bot is the only authorised
consumer.

When in doubt, the handlers under [`pages/api/bot/v1/`](../pages/api/bot/v1/)
and the middleware at [`utils/botAuth.ts`](../utils/botAuth.ts) are
authoritative. This doc summarises the cross-cutting rules and lists every
endpoint so the bot side can be code-reviewed against a single page.

---

## Base URL & versioning

- **Base path**: `/api/bot/v1/`
- **Versioning**: path-prefixed. A breaking change ships under `/v2/` rather
  than mutating `/v1/`. No deprecation header today — coordinate cuts via PR.
- **Production host**: site origin (see `SITE_URL` / `NEXT_PUBLIC_SITE_URL`).
- **Transport**: HTTPS, JSON in/out.

## Authentication

| Header      | Value                                                            |
| ----------- | ---------------------------------------------------------------- |
| `x-api-key` | A bot API key (per-tenant from `tenant_secrets`, or legacy env). |

- Comparison is **per-tenant first** : the provided key is sha256-hashed and
  looked up in `tenant_secrets.bot_api_key_hash`. Match → the row's
  `tenant_id` is authoritative for the request (`req.botContext.tenantId`).
- Fallback : if no row matches, the key is constant-time compared with the
  legacy global `BOT_API_KEY` env var. **This env var is a transition
  fallback and should be retired once every tenant has been rotated** (see
  [Per-tenant secrets rotation](#per-tenant-secrets-rotation) below).
- Missing/empty header → `401 { error: "Invalid or missing API key." }`.
- Neither per-tenant nor env key matches → `401`.
- Per-tenant cache empty AND env unset → `500 { error: "Endpoint not configured." }`.
- The bot identifies the **acting user** via `actorDiscordUserId` in the
  body (writes) or query string (reads) — this is separate from auth and
  feeds the per-actor rate-limit and audit logs.

### Per-tenant secrets rotation

Each tenant carries its own `bot_api_key` and `bot_webhook_secret` (HMAC
push signing) in `tenant_secrets`. Rotate via
`POST /api/admin/tenants/:id/rotate-secrets` (owner-only): the endpoint
returns the two plain values **once** in the response body. The operator:

1. Updates the **bot side** podman secrets on the Freebox VM:
   ```bash
   printf '%s' '<new-api-key>'        | sudo podman secret create --replace discord_bot_api_key -
   printf '%s' '<new-webhook-secret>' | sudo podman secret create --replace discord_bot_webhook_secret -
   sudo systemctl restart discord-bot.service
   ```
2. **Does NOT need to update Netlify env vars** for that tenant: once the
   `tenant_secrets` row exists, the site stops consulting `BOT_API_KEY` /
   `BOT_WEBHOOK_SECRET` env for it. The env entries remain as a fallback
   for tenants that haven't been rotated yet.
3. **End-state cleanup** (when every tenant has a `tenant_secrets` row):
   delete `BOT_API_KEY` and `BOT_WEBHOOK_SECRET` from Netlify's dashboard.
   Verify the rotated bot still authenticates after the next deploy.
   The site will then refuse any unrotated bot — that's the point.

## Tenant identification

The site is multi-tenant. Every `/api/bot/v1/*` call **must** declare which
tenant it targets, either through a per-tenant API key (preferred) or
through the `x-tenant-id` header (legacy fallback while we roll out
per-tenant keys). The middleware ([`utils/botAuth.ts`](../utils/botAuth.ts))
resolves the tenant once and stashes it on `req.botContext.tenantId`.

| Header        | Value                                                      |
| ------------- | ---------------------------------------------------------- |
| `x-tenant-id` | The tenant UUID (RFC 4122, any version). Case-insensitive. |

- **Format**: must match `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`.
- **V2 (active)**: the header is **required** when the `x-api-key` matches
  the legacy global `BOT_API_KEY` env var. Missing/empty → `400` with
  `code: "MISSING_TENANT_ID"`. Non-UUID → `400` with
  `code: "INVALID_TENANT_ID"`. Unknown tenant (no row in `tenants`) →
  `404` with `code: "UNKNOWN_TENANT"`. The existence check is cached
  in-process for 60s to avoid a Supabase round-trip per request.
- **Per-tenant API key (authoritative)**: when the provided `x-api-key`
  matches a row in `tenant_secrets.bot_api_key_hash`, the tenant id is
  taken from the DB and the `x-tenant-id` header is **ignored**. If the
  header is present and contradicts the key, a `warn` is logged but the
  request still succeeds with the key's tenant id (the key wins). This
  lets the bot ship one `bot_api_key` per linked guild without also
  having to send a coherent header.
- **Discord guild mapping**: the bot resolves the right UUID locally from
  `discord_guilds.guild_id` → `tenant_id`. It is not the site's job to
  guess the tenant from a Discord context.
- **Cross-tenant exemptions**: `/tenants/all-configs`, `/tenants/by-guild/:id`,
  `/tenants/link-guild`, `/tenants/request-onboard`, `/events/pending`,
  `/events/:id/ack` and `/cast/upcoming` are intentionally **not**
  tenant-scoped — they are
  global resolvers / pollers the bot needs in order to route correctly.
  These routes are flagged `crossTenant: true` in `withBotRoute({ ... })`
  and the middleware **skips** the header validation + existence check;
  `req.botContext.tenantId` is left `undefined` and handlers must not
  read it. When a cross-tenant route returns a list, every row exposes
  its own `tenantId` so the bot can dispatch per-row. Every other
  `/api/bot/v1/*` route enforces tenant scoping.

### Error codes

| Code                | Status | When                                                            |
| ------------------- | ------ | --------------------------------------------------------------- |
| `MISSING_TENANT_ID` | 400    | `x-tenant-id` header is absent or empty (legacy env auth only). |
| `INVALID_TENANT_ID` | 400    | `x-tenant-id` header is present but not a valid UUID.           |
| `UNKNOWN_TENANT`    | 404    | `x-tenant-id` is a valid UUID but no matching row in `tenants`. |

Example:

```http
GET /api/bot/v1/teams HTTP/1.1
x-api-key: <BOT_API_KEY>
x-tenant-id: ce69a726-773e-4d12-b5eb-d2503aa752b4
```

```bash
curl -sS https://site.example/api/bot/v1/teams \
  -H "x-api-key: $BOT_API_KEY" \
  -H "x-tenant-id: ce69a726-773e-4d12-b5eb-d2503aa752b4"
```

### Outbox events carry their tenant

Outbound events emitted via `emitBotEvent()` (see [`utils/botEvents.ts`](../utils/botEvents.ts))
**embed `tenantId`** so the bot can route to the right guild without having to
re-derive it from the payload:

- `bot_event_outbox.tenant_id` — DB column, `NOT NULL` since
  [`enforce_tenant_id_not_null_and_fk.sql`](../database/migrations/).
- Webhook push body — `tenantId` at the payload root, e.g.
  `{ id, event, tenantId, timestamp, data }`.
- Webhook push headers — `X-Tenant-Id: <uuid>` alongside the existing
  `X-Webhook-Signature` and `X-Webhook-Event` headers.
- `/events/pending` response — every row exposes `tenantId` (in addition to
  `id`, `eventId`, `eventName`, `payload`, ...) so the bot can dispatch
  cross-tenant from a single poll.

The bot resolves the target guild via `tenant_config.getGuildIdForTenant(tenantId)`
(local cache amorcé au boot via `/tenants/all-configs`).

### Outbox event catalog

Event names written to `bot_event_outbox.event_name` are free-form text (no
CHECK constraint). The list below documents the names emitted by the website
today. The bot must tolerate unknown names (treat them as no-ops) so the
catalog can grow without forcing a bot deploy.

| Event name                        | Emitted by                                                                         | Payload `data` shape (high-level)                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `match.starting`                  | `pages/api/admin/matches/[matchId].ts` (status → ongoing)                          | `{ matchId, tournamentId?, scrimId?, team1Id, team2Id, scheduledAt, ..., enriched }`                                          |
| `match.scheduled`                 | Admin match meta update (`scheduled_at` set)                                       | `{ matchId, scheduledAt, ..., enriched }`                                                                                     |
| `match.unscheduled`               | Admin match meta update (`scheduled_at` cleared)                                   | `{ matchId }`                                                                                                                 |
| `match.finished`                  | Score apply / admin                                                                | `{ matchId, team1Score, team2Score, winnerTeamId }`                                                                           |
| `match.disputed`                  | Admin `POST .../dispute`                                                           | `{ matchId, reason, openedBy }`                                                                                               |
| `match.dispute.resolved`          | Admin `POST .../resolve-dispute`                                                   | `{ matchId, resolution, resolvedBy }`                                                                                         |
| `dispute.sla_breached` (Lot 4)    | Cron `/api/cron/dispute-sla-check`                                                 | `{ matchId, tournamentId, disputeReason, disputeOpenedAt, ageMinutes, slaMinutes }`                                           |
| `checkin.nudge` (Lot 5)           | Admin `POST /api/admin/matches/[matchId]/checkin-nudge`                            | `{ matchId, tournamentId, teamSide: 1 \| 2, scheduledAt, nudgedByStaffId, enriched }`                                         |
| `tournament.finalized` (Lot 1)    | Admin `POST /api/admin/tournament/[id]/finalize`                                   | `{ tournament_id, tournament_name, rankings: [{ team_id, team_name, rank, prize }, ...] }`                                    |
| `broadcast.state_changed` (Lot 7) | Admin `POST /api/admin/broadcast/state`                                            | `{ runId, runSlug, state: { v: 1, on_air, lower_third, pip }, currentSegmentId, matchId }`                                    |
| `news.published`                  | Admin / bot ingest                                                                 | `{ newsId, slug, title, tag, excerpt, imageUrl, publishedAt }`                                                                |
| `team.*` / `scrim.*` / `cast.*`   | various admin / bot routes                                                         | see emitter call sites                                                                                                        |
| `event_segment.transitioned`      | Admin `/api/admin/events/.../segments/.../{start,skip,end}.ts` (Lot 2 run-of-show) | `{ runId, segmentId, fromStatus, toStatus, tenantId, broadcastMessage, segment: { ord, type, title, durationMin, matchId } }` |

#### `event_segment.transitioned` (Lot 2 run-of-show)

Emitted whenever a segment in an `event_runs` timeline changes lifecycle
state via the staff Director endpoints:

- `upcoming → live` (via `POST /api/admin/events/:runId/segments/:segId/start`)
- `upcoming → skipped` (via `POST /api/admin/events/:runId/segments/:segId/skip`)
- `live → done` (via `POST /api/admin/events/:runId/segments/:segId/end`)

Idempotent endpoints — if the transition is a no-op (segment already in the
target state) the event is **not** re-emitted, so the bot can safely treat
the event as "first time we see this transition for this segmentId".

The full webhook/outbox body shape (consistent with the rest of the catalog):

```json
{
  "id": "<event uuid>",
  "event": "event_segment.transitioned",
  "tenantId": "<uuid>",
  "timestamp": "2026-05-21T20:42:00.000Z",
  "data": {
    "runId": "<uuid>",
    "segmentId": "<uuid>",
    "fromStatus": "upcoming",
    "toStatus": "live",
    "tenantId": "<uuid>",
    "broadcastMessage": {
      "discord": "**Match 3** kicks off NOW — Chaos Theory vs Phoenix Rising",
      "push_title": "Live now: Chaos Theory vs Phoenix Rising",
      "push_body": "Tune in for Match 3 of Finale Spring 2026",
      "email_subject": null
    },
    "segment": {
      "ord": 4,
      "type": "match",
      "title": "Match 3 — Chaos Theory vs Phoenix Rising",
      "durationMin": 45,
      "matchId": "<uuid>"
    }
  }
}
```

`broadcastMessage` is `null` when the staff didn't author one for that
segment (i.e. silent transition — pure cockpit/timeline state change). The
bot uses it as the canonical Discord copy when `toStatus === 'live'`. For
`skipped` and `done`, the bot typically ignores `broadcastMessage` and just
updates its own panel/state.

#### `dispute.sla_breached` (Lot 4 Open Disputes Board)

Emitted by `pages/api/cron/dispute-sla-check.ts` (Netlify scheduled
function, every 5 minutes) for each `matches` row where:

- `status = 'disputed'`
- `now() - dispute_opened_at >= tenants.dispute_sla_minutes`
- `escalation_pinged_at IS NULL`

The cron then stamps `escalation_pinged_at = now()` so the next tick
skips that match — **single escalation per breach**. The flag is reset to
`null` when the admin resolves or cancels the dispute, allowing a
subsequent re-open to fire a fresh escalation cycle.

Payload :

```json
{
  "id": "<event uuid>",
  "event": "dispute.sla_breached",
  "tenantId": "<uuid>",
  "timestamp": "2026-05-25T18:42:00.000Z",
  "data": {
    "matchId": "<uuid>",
    "tournamentId": "<uuid|null>",
    "disputeReason": "Conteste le score 2-1 en finale",
    "disputeOpenedAt": "2026-05-25T17:40:00.000Z",
    "ageMinutes": 62,
    "slaMinutes": 60
  }
}
```

The bot is expected to DM the configured staff role (or the
`disputes_forum_channel_id` thread) once per event. For richer context
the bot can pull `GET /api/bot/v1/disputes/escalations?breached=true`,
which returns the full enriched list (team names, tournament, age,
classification).

#### `checkin.nudge` (Lot 5 Live Check-In Console)

Emitted by `pages/api/admin/matches/[matchId]/checkin-nudge.ts` when a
staff member clicks "Relance Discord" on the live check-in console at
`/admin/tournament/[id]/checkin/live`. One event is emitted per nudged
team side, so the bot can route directly to the right captain.

Server-side guards :

- 404 if the match is unknown for the tenant.
- 409 with `INVALID_STATUS` when the match is not `pending` / `ongoing`.
- 409 with `ALREADY_CHECKED_IN` if every requested side already checked
  in (the endpoint silently filters out checked sides; this 409 is only
  returned when none remain).
- `withAdminIdempotency` wraps the handler (5 min window, key
  `match-checkin-nudge`), so double-clicks within the window replay the
  cached response instead of re-emitting.

Payload :

```json
{
  "id": "<event uuid>",
  "event": "checkin.nudge",
  "tenantId": "<uuid>",
  "timestamp": "2026-05-25T18:42:00.000Z",
  "data": {
    "matchId": "<uuid>",
    "tournamentId": "<uuid|null>",
    "teamSide": 1,
    "scheduledAt": "2026-05-25T19:00:00.000Z",
    "nudgedByStaffId": "<uuid|null>",
    "enriched": {
      "tournamentName": "<string|null>",
      "scrimName": "<string|null>",
      "team1": { "captainDiscordUserId": "<snowflake|null>", ... },
      "team2": { "captainDiscordUserId": "<snowflake|null>", ... },
      "checkinUrl1": "https://site/checkin/<token>",
      "checkinUrl2": "https://site/checkin/<token>"
    }
  }
}
```

The bot DMs the captain of `teamSide`, posts a fresh check-in prompt
(URL + Check-in button reusing the existing `match_checkin` reminder
template). If `enriched.team{N}.captainDiscordUserId` is null, the bot
logs and skips — the team probably has no linked captain.

## Idempotency

Opt-in per route via `idempotent: true` in `withBotRoute({ ... })`. Only
honoured on unsafe methods (POST/PUT/PATCH/DELETE). GET/HEAD/OPTIONS ignore it.

- **Request header**: `Idempotency-Key: <up to 200 chars, trimmed>`
- **Cache scope**: `method + url + key + sha256(body).slice(0,8)`.
  The body hash is **deliberate**: re-sending the same key with a different
  payload (e.g. corrected score) is treated as a new request, not a silent
  replay of the stale response.
- **TTL**: 5 minutes (`bot_idempotency` table in Supabase, see
  [`add_bot_idempotency_table.sql`](../database/migrations/)).
- **What gets cached**: success responses only (2xx). Transient 5xx can be
  retried without consuming the cache slot.
- **Replay marker**: replayed responses carry `Idempotency-Replay: true`
  in the response header (and the original status code + body).
- **Cold-start safe**: cache is in Supabase, not in-process — survives
  Netlify Lambda cold starts.

## Maintenance mode

Writes (any non-safe method) on any `/api/bot/v1/*` route return:

```http
HTTP/1.1 503 Service Unavailable
Retry-After: 60
Content-Type: application/json

{ "error": "Site en maintenance, les écritures bot sont temporairement désactivées.", "code": "MAINTENANCE_MODE" }
```

GET/HEAD/OPTIONS keep working so polling (reminders, snapshots, autocomplete)
doesn't break during a deploy. The mode is toggled via
[`utils/maintenance.ts`](../utils/maintenance.ts).

## Rate limits

- **Global** — every route has its own bucket keyed by IP (or the configured
  store key). Limit hit → `429`.
- **Per-actor** — opt-in per route. When set, the limiter additionally caps
  requests keyed on `actorDiscordUserId` (body for writes, query for reads)
  with the Discord-ID regex `^[0-9]{15,25}$`. Protects against one Discord
  user draining the global IP bucket.

Default window is 60 s. The bot should respect `Retry-After` when it appears.

## Standard response codes

| Code | When                                                               |
| ---- | ------------------------------------------------------------------ |
| 200  | OK / replayed cache                                                |
| 201  | Resource created (some POST endpoints)                             |
| 400  | Validation error (missing field, malformed UUID/Discord ID, etc.)  |
| 401  | Missing/invalid `x-api-key`                                        |
| 403  | Actor not allowed to perform the action (e.g. non-captain)         |
| 404  | Target resource not found                                          |
| 405  | Method not allowed — response includes `Allow` header              |
| 409  | Business-state conflict (already finished, already disputed, etc.) |
| 429  | Rate limit hit (global or per-actor)                               |
| 500  | Server config (key unset / DB unavailable) or unhandled exception  |
| 503  | Maintenance mode (writes only) — see above                         |

Error body shape (consistent across handlers):

```json
{ "error": "Human-readable message", "code": "OPTIONAL_MACHINE_CODE" }
```

`code` is present on cases the bot needs to branch on
(`MAINTENANCE_MODE`, dispute-specific codes, etc.).

## Canonical write example — `POST /api/bot/v1/matches/:matchId/report`

Captain submits a score from Discord. Illustrates the standard write shape.

```http
POST /api/bot/v1/matches/4e8c…/report HTTP/1.1
x-api-key: $BOT_API_KEY
Idempotency-Key: report-4e8c-865432109876543210-1
Content-Type: application/json

{
  "discordUserId": "865432109876543210",
  "team1_score": 3,
  "team2_score": 1
}
```

Response paths (see handler for full logic):

- Single report stored, waiting on opponent → `200 { status: "waiting" }`
- Both reports agree → `applyMatchScore` runs → `200 { status: "finished", … }`
- Reports diverge → match → `disputed` → `200 { status: "disputed", … }`
- Captain re-reports and now agrees → dispute closes →
  `200 { status: "finished", … }`

## Canonical read example — `GET /api/bot/v1/autocomplete/teams`

```http
GET /api/bot/v1/autocomplete/teams?q=cha&tournamentId=… HTTP/1.1
x-api-key: $BOT_API_KEY

200 OK
[
  { "id": "…", "name": "Chaos Theory", "tag": "CTH" },
  …
]
```

Autocomplete responses are always arrays capped at 25 (Discord limit).

## Endpoint inventory

Resource paths grouped below. Click through for the actual handler — request
body shapes live there. `Idem.` means the route honours `Idempotency-Key`.
`Rate-key` is the bucket identifier in `utils/rateLimit`.

### Announcements & moderation

| Route                                                                            | Methods | Idem. | Rate-key                   |
| -------------------------------------------------------------------------------- | ------- | ----- | -------------------------- |
| [`announcements.ts`](../pages/api/bot/v1/announcements.ts)                       | POST    | yes   | `bot-announcements`        |
| [`broadcast/on-air.ts`](../pages/api/bot/v1/broadcast/on-air.ts) (Lot 7)         | GET     | —     | `bot-broadcast-on-air`     |
| [`disputes.ts`](../pages/api/bot/v1/disputes.ts)                                 | GET     | —     | `bot-disputes`             |
| [`disputes/escalations.ts`](../pages/api/bot/v1/disputes/escalations.ts) (Lot 4) | GET     | —     | `bot-disputes-escalations` |
| [`staff-logs.ts`](../pages/api/bot/v1/staff-logs.ts)                             | GET     | —     | `bot-staff-logs`           |

#### `GET /api/bot/v1/disputes/escalations`

Liste enrichie des disputes en cours pour le board staff (slash
`/disputes-board`). Quand `?breached=true`, ne retient que les rows
`classification === 'breached'` ET `escalation_pinged_at IS NULL` — la même
sélection que le cron `dispute.sla_breached`, utile pour un re-ping manuel.

**Auth** : `x-api-key` + tenant via per-tenant key ou `x-tenant-id`.

**Query**

- `tournament` _(optionnel)_ — UUID, filtre par tournoi.
- `limit` _(optionnel, int, 1..50, defaut 30)_ — taille du board.
- `breached` _(optionnel)_ — `'true'` pour ne garder que les breaches non
  pingés.

**Response 200**

```json
{
  "escalations": [
    {
      "matchId": "uuid",
      "tournament": {
        "id": "uuid",
        "name": "Spring Cup 2026",
        "slug": "spring-cup-2026"
      },
      "team1": { "id": "uuid", "name": "Chaos Theory" },
      "team2": { "id": "uuid", "name": "Phoenix Rising" },
      "disputeReason": "Conteste le score 2-1 en finale",
      "disputeOpenedAt": "2026-05-25T17:40:00.000Z",
      "escalationPingedAt": null,
      "disputeThreadId": "1300000000000000001",
      "slaDueAt": "2026-05-25T18:40:00.000Z",
      "ageMinutes": 62,
      "slaMinutes": 60,
      "classification": "breached"
    }
  ],
  "count": 1,
  "total": 1
}
```

**Field shapes**

- `disputeThreadId` : `string | null` — snowflake du thread forum Discord
  créé sur `match.disputed` (colonne `matches.discord_dispute_thread_id`).
  Permet au bot de construire un lien profond
  `discord.com/channels/<guildId>/<disputeThreadId>` sans round-trip.
  `null` quand le thread n'a jamais été créé (ex: dispute pré-Lot 4 ou
  forum non configuré).
- `slaDueAt` : `string | null` — ISO 8601 UTC, échéance SLA calculée
  côté site (`disputeOpenedAt + slaMinutes`). Source unique pour éviter
  toute dérive client/serveur. `null` quand `disputeOpenedAt` est absent
  ou non parsable (cas dégénéré).

**Errors** : `400` (tournament invalide), `401`, `500`.
**Rate limit** : 30/min global. **Idempotency** : non (GET).

### Autocomplete (Discord choice-pickers)

| Route                                                                              | Methods | Idem. | Rate-key              |
| ---------------------------------------------------------------------------------- | ------- | ----- | --------------------- |
| [`autocomplete/cast-members.ts`](../pages/api/bot/v1/autocomplete/cast-members.ts) | GET     | —     | `bot-ac-cast-members` |
| [`autocomplete/matches.ts`](../pages/api/bot/v1/autocomplete/matches.ts)           | GET     | —     | `bot-ac-matches`      |
| [`autocomplete/stages.ts`](../pages/api/bot/v1/autocomplete/stages.ts)             | GET     | —     | `bot-ac-stages`       |
| [`autocomplete/teams.ts`](../pages/api/bot/v1/autocomplete/teams.ts)               | GET     | —     | `bot-ac-teams`        |
| [`autocomplete/tournaments.ts`](../pages/api/bot/v1/autocomplete/tournaments.ts)   | GET     | —     | `bot-ac-tournaments`  |

### Cast assignments

| Route                                                                          | Methods           | Idem. | Rate-key               | Tenant scope                                      |
| ------------------------------------------------------------------------------ | ----------------- | ----- | ---------------------- | ------------------------------------------------- |
| [`cast/assignments.ts`](../pages/api/bot/v1/cast/assignments.ts)               | GET               | —     | `bot-cast-assignments` | per-tenant                                        |
| [`cast/upcoming.ts`](../pages/api/bot/v1/cast/upcoming.ts)                     | GET               | —     | `bot-cast-upcoming`    | `crossTenant: true` — `tenantId` returned per row |
| [`cast/[assignmentId]/ack.ts`](../pages/api/bot/v1/cast/[assignmentId]/ack.ts) | POST              | yes   | `cast.ack`             | per-tenant                                        |
| [`matches/[matchId]/cast.ts`](../pages/api/bot/v1/matches/[matchId]/cast.ts)   | GET, POST, DELETE | yes   | `bot-match-cast`       | per-tenant                                        |

#### `GET /api/bot/v1/cast/upcoming`

Liste les `cast_assignments` dont le match commence dans la fenetre `[now,
now+withinMinutes]`, non annules, `acked_at IS NULL`. Sert au bot pour DM les
casters a T-30 avec un bouton "Je confirme" (qui POST `/cast/:id/ack`).

**Auth** : `x-api-key`. La route est `crossTenant: true` — le header
`x-tenant-id` n'est ni requis ni utilise. Chaque row de la response inclut
`tenantId` afin que le bot route le DM vers le guild Discord correspondant
(resolution `tenantId -> guildId` cote `tenant_config`). Un seul poll
suffit pour DM les casters de tous les tenants linkes.

**Query**

- `withinMinutes` (optionnel, int, 5..120, defaut 30) — taille de la fenetre

**Response 200**

```json
{
  "assignments": [
    {
      "assignmentId": "uuid",
      "tenantId": "ce69a726-773e-4d12-b5eb-d2503aa752b4",
      "kind": "match",
      "matchId": "uuid",
      "scrimId": null,
      "matchStartsAt": "2026-05-20T20:00:00.000Z",
      "casterDiscordUserId": "9000…",
      "role": "Streameuse Overwatch",
      "teamA": { "id": "uuid", "name": "Chaos Theory" },
      "teamB": { "id": "uuid", "name": "Nova Storm" },
      "tournamentName": "Spring Cup 2026",
      "scrimName": null,
      "ackedAt": null
    },
    {
      "assignmentId": "uuid",
      "tenantId": "ce69a726-…",
      "kind": "scrim",
      "matchId": null,
      "scrimId": "uuid",
      "matchStartsAt": "2026-05-21T18:00:00.000Z",
      "casterDiscordUserId": "9000…",
      "role": "Caster",
      "teamA": { "id": "uuid", "name": "Pulse" },
      "teamB": { "id": "uuid", "name": "Echo" },
      "tournamentName": null,
      "scrimName": "Pulse vs Echo — Scrim Tactical",
      "ackedAt": null
    }
  ],
  "count": 2,
  "withinMinutes": 30
}
```

**Lot 9 (Scrims reuse)** : `cast_assignments` est désormais polymorphique
(`match_id` XOR `scrim_id`, CHECK `chk_cast_assignments_entity_xor`). Les
rows pré-Lot 9 conservent `kind: 'match'` + `matchId`, et les nouveaux
assignments scrim ont `kind: 'scrim'` + `scrimId`. Le bot doit consommer
les deux variantes pour le DM T-30 — la résolution du `guildId` reste
sur `tenantId` (inchangée).

**Errors** : `400` (withinMinutes hors plage), `401`, `500`.
**Rate limit** : 60/min global. **Idempotency** : non.

#### `POST /api/bot/v1/cast/:assignmentId/ack`

Le caster clique le bouton "Je confirme" du DM T-30. Marque
`cast_assignments.acked_at = now()`. Idempotent : un 2eme appel renvoie
`200` sans rechanger `acked_at` (la valeur initiale est conservee).

**Auth** : `x-api-key` + `actorDiscordUserId` doit etre le caster lui-meme
(resolu via `cast_members.auth_user_id` + `user_discord_links`).

**Body**

```json
{ "actorDiscordUserId": "9000…" }
```

**Response 200**

```json
{
  "assignmentId": "uuid",
  "ackedAt": "2026-05-20T19:45:00.000Z",
  "alreadyAcked": false
}
```

**Errors** : `400` (uuid/discord id invalide), `401`, `403` (pas le caster),
`404` (assignment introuvable), `503` (maintenance).
**Rate limit** : 30/min global, bucket `cast.ack`. **Idempotency** : oui.

### Events queue (bot ↔ site eventual-consistency channel)

| Route                                                                              | Methods | Idem. | Rate-key                | Tenant scope                                      |
| ---------------------------------------------------------------------------------- | ------- | ----- | ----------------------- | ------------------------------------------------- |
| [`events/pending.ts`](../pages/api/bot/v1/events/pending.ts)                       | GET     | —     | `bot-events-pending`    | `crossTenant: true` — `tenantId` returned per row |
| [`events/handled.ts`](../pages/api/bot/v1/events/handled.ts)                       | POST    | no    | `bot-events-handled`    | per-tenant                                        |
| [`events/[id]/ack.ts`](../pages/api/bot/v1/events/[id]/ack.ts)                     | POST    | yes   | `bot-events-ack`        | `crossTenant: true` — PK globally unique          |
| [`reconcile/discord-orphans.ts`](../pages/api/bot/v1/reconcile/discord-orphans.ts) | GET     | —     | `bot-reconcile-orphans` | per-tenant                                        |

### Locks (distributed cron / fullSync coordination)

| Route                                                    | Methods | Idem. | Rate-key    |
| -------------------------------------------------------- | ------- | ----- | ----------- |
| [`locks/[name].ts`](../pages/api/bot/v1/locks/[name].ts) | POST    | no    | `bot-locks` |

### Matches

| Route                                                                                              | Methods           | Idem. | Rate-key                    |
| -------------------------------------------------------------------------------------------------- | ----------------- | ----- | --------------------------- |
| [`matches/[matchId].ts`](../pages/api/bot/v1/matches/[matchId].ts)                                 | GET, PATCH        | yes   | `bot-match-meta`            |
| [`matches/[matchId]/checkin.ts`](../pages/api/bot/v1/matches/[matchId]/checkin.ts)                 | POST              | yes   | `bot-match-checkin`         |
| [`matches/[matchId]/discord.ts`](../pages/api/bot/v1/matches/[matchId]/discord.ts)                 | PATCH             | yes   | `bot-match-discord`         |
| [`matches/[matchId]/dispute.ts`](../pages/api/bot/v1/matches/[matchId]/dispute.ts)                 | GET               | —     | `bot-match-dispute`         |
| [`matches/[matchId]/forfeit.ts`](../pages/api/bot/v1/matches/[matchId]/forfeit.ts)                 | POST              | yes   | `bot-match-forfeit`         |
| [`matches/[matchId]/report.ts`](../pages/api/bot/v1/matches/[matchId]/report.ts)                   | POST              | yes   | `bot-match-report`          |
| [`matches/[matchId]/reset.ts`](../pages/api/bot/v1/matches/[matchId]/reset.ts)                     | POST              | yes   | `bot-match-reset`           |
| [`matches/[matchId]/resolve-dispute.ts`](../pages/api/bot/v1/matches/[matchId]/resolve-dispute.ts) | POST              | yes   | `bot-match-resolve-dispute` |
| [`matches/[matchId]/veto.ts`](../pages/api/bot/v1/matches/[matchId]/veto.ts)                       | GET, POST, DELETE | yes   | `bot-match-veto`            |

#### `GET /api/bot/v1/matches/:matchId/dispute`

Vue _capitaine_ (commande `/ma-dispute`) d'une dispute en cours sur un de
ses matches. Filtre explicitement les champs internes staff (audit log, IPs,
dispute_reason interne, UUIDs internes) — seul ce qui est utile au capitaine
sort.

**Auth** : `x-api-key` + `actorDiscordUserId` (query) doit etre capitaine
d'une des deux equipes (resolu via `user_discord_links` puis
`teams.captain_id`).

**Query**

- `actorDiscordUserId` (requis) — Discord user id du capitaine

**Response 200**

```json
{
  "matchId": "uuid",
  "status": "disputed",
  "openedAt": "2026-05-19T22:00:00.000Z",
  "reports": [
    {
      "teamId": "uuid",
      "teamName": "Chaos Theory",
      "submittedBy": "9000…",
      "scoreA": 3,
      "scoreB": 1,
      "submittedAt": "2026-05-19T21:55:00.000Z"
    }
  ],
  "staffNote": null,
  "resolution": null
}
```

Quand la dispute est resolue, `resolution` est `{ resolvedAt, decidedScoreA,
decidedScoreB }` et `staffNote` peut contenir la note finale.

**Errors** : `400` (matchId/actorDiscordUserId invalide), `401`,
`403` (non capitaine), `404` (match introuvable ou pas de dispute).
**Rate limit** : 60/min global. **Idempotency** : non (GET).

### Players (by Discord ID lookups)

| Route                                                                                                                              | Methods | Idem. | Rate-key                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------- | ----- | ------------------------------------------------------------------ |
| [`players/by-discord/[discordUserId]/actions.ts`](../pages/api/bot/v1/players/by-discord/[discordUserId]/actions.ts)               | GET     | —     | `bot-player-actions`                                               |
| [`players/by-discord/[discordUserId]/actions-todo.ts`](../pages/api/bot/v1/players/by-discord/[discordUserId]/actions-todo.ts)     | GET     | —     | `bot-player-actions-todo`                                          |
| [`players/by-discord/[discordUserId]/actions/snooze.ts`](../pages/api/bot/v1/players/by-discord/[discordUserId]/actions/snooze.ts) | POST    | yes   | `actions.snooze`                                                   |
| [`players/by-discord/[discordUserId]/history.ts`](../pages/api/bot/v1/players/by-discord/[discordUserId]/history.ts)               | GET     | —     | `bot-player-history`                                               |
| [`players/by-discord/[discordUserId]/invitations.ts`](../pages/api/bot/v1/players/by-discord/[discordUserId]/invitations.ts)       | GET     | —     | `bot-player-invitations`                                           |
| [`players/by-discord/[discordUserId]/next-match.ts`](../pages/api/bot/v1/players/by-discord/[discordUserId]/next-match.ts)         | GET     | —     | `bot-player-next-match`                                            |
| [`players/by-discord/[discordUserId]/profile.ts`](../pages/api/bot/v1/players/by-discord/[discordUserId]/profile.ts)               | PATCH   | yes   | `bot-player-profile`                                               |
| [`players/by-discord/[discordUserId]/reminders.ts`](../pages/api/bot/v1/players/by-discord/[discordUserId]/reminders.ts)           | GET     | —     | `bot-player-reminders`                                             |
| [`players/by-discord/[discordUserId]/stats.ts`](../pages/api/bot/v1/players/by-discord/[discordUserId]/stats.ts)                   | GET     | —     | `bot-player-stats`                                                 |
| [`players/by-discord/[discordUserId]/team.ts`](../pages/api/bot/v1/players/by-discord/[discordUserId]/team.ts)                     | GET     | —     | `bot-player-team`                                                  |
| [`player-actions.ts`](../pages/api/bot/v1/player-actions.ts)                                                                       | GET     | —     | `bot-player-actions` _(shares bucket with the by-discord variant)_ |

#### `GET /api/bot/v1/players/by-discord/:discordUserId/actions-todo`

Liste agregee des "actions a faire" pour une joueuse (commande Discord
`/mes-actions` et hub DM T-30). Vue derivee de l'etat DB courant (matches en
attente de check-in, vetos pending, score reports manquants, invitations team
pending). Different de `…/actions` qui est un audit log staff.

**Auth** : `x-api-key`.

**Response 200**

```json
{
  "player": { "authUserId": "uuid", "discordUserId": "9000…" },
  "actions": [
    {
      "actionKey": "checkin:match:abc-…",
      "type": "checkin",
      "entity": "match",
      "entityId": "abc-…",
      "variant": "teamA",
      "refAt": "2026-05-20T20:00:00.000Z",
      "snoozedUntil": null,
      "group": "today",
      "meta": { "side": 1, "matchId": "abc-…" }
    }
  ],
  "count": 1
}
```

**Champs ajoutes / comportement** :

- `actionKey` : cle STABLE et deterministe, forme
  `<type>:<entity>:<id>[:<variant>]`. Derivee purement d'IDs DB (pas un index
  de tableau). Sert au snooze pour identifier l'action.
- `snoozedUntil` : ISO ou `null`. Une action encore snoozee (snoozed_until
  > now()) est **filtree par l'API** (LEFT JOIN cote app sur
  > `player_action_snoozes` + `WHERE snoozed_until IS NULL OR snoozed_until
<= now()`). Les actions retournees avec `snoozedUntil` non-null
  > correspondent a un snooze deja expire (info pour l'UX "tu avais snooze ca").
- `group` : `urgent` (refAt < 15min), `today` (meme jour calendaire serveur),
  `later`. Le tri global respecte cet ordre puis `refAt` ascendant.

**Errors** : `400`, `401`, `404` (compte non lie), `500`.
**Rate limit** : 60/min global. **Idempotency** : non.

#### `POST /api/bot/v1/players/by-discord/:discordUserId/actions/snooze`

Le joueur snooze une de ses actions pour qu'elle disparaisse temporairement
de sa liste `/mes-actions`. Upsert sur `player_action_snoozes` (PK
`(discord_user_id, action_key)`).

**Auth** : `x-api-key` + `actorDiscordUserId` (body) doit etre egal au
`:discordUserId` du path (un joueur ne snooze que ses propres actions).

**Body**

```json
{
  "actorDiscordUserId": "9000…",
  "actionKey": "checkin:match:abc-…",
  "minutes": 60
}
```

- `minutes` : optionnel, entier 15..1440 (defaut 60).
- `actionKey` : la cle retournee par `actions-todo`.

**Response 200**

```json
{
  "discordUserId": "9000…",
  "actionKey": "checkin:match:abc-…",
  "snoozedUntil": "2026-05-20T21:00:00.000Z",
  "minutes": 60
}
```

Idempotent : un 2eme POST avec la meme `actionKey` UPDATE
`snoozed_until` (le snooze est etendu/raccourci selon la nouvelle valeur).

**Errors** : `400` (champs invalides), `401`, `403` (actor != path),
`503` (maintenance).
**Rate limit** : 30/min global, bucket `actions.snooze`. **Idempotency** : oui.

### Registration / linking

| Route                                                                | Methods | Idem. | Rate-key                 |
| -------------------------------------------------------------------- | ------- | ----- | ------------------------ |
| [`register-user.ts`](../pages/api/bot/v1/register-user.ts)           | POST    | yes   | `bot-register`           |
| [`role-sync/snapshot.ts`](../pages/api/bot/v1/role-sync/snapshot.ts) | GET     | —     | `bot-role-sync-snapshot` |

### Demandes & invitations

| Route                                                                          | Methods | Idem. | Rate-key                 |
| ------------------------------------------------------------------------------ | ------- | ----- | ------------------------ |
| [`demandes.ts`](../pages/api/bot/v1/demandes.ts)                               | GET     | —     | `bot-demandes`           |
| [`invitations/[demandeId].ts`](../pages/api/bot/v1/invitations/[demandeId].ts) | POST    | yes   | `bot-invitations-action` |

### Reminders & live data

| Route                                                                              | Methods | Idem. | Rate-key                        |
| ---------------------------------------------------------------------------------- | ------- | ----- | ------------------------------- |
| [`reminders/index.ts`](../pages/api/bot/v1/reminders/index.ts)                     | GET     | —     | `bot-reminders`                 |
| [`leaderboards/teams.ts`](../pages/api/bot/v1/leaderboards/teams.ts)               | GET     | —     | `bot-leaderboards-teams`        |
| [`twitch/live.ts`](../pages/api/bot/v1/twitch/live.ts)                             | GET     | —     | `bot-twitch-live`               |
| [`tournament-help/inventory.ts`](../pages/api/bot/v1/tournament-help/inventory.ts) | GET     | —     | `bot-tournament-help-inventory` |
| [`runs/current.ts`](../pages/api/bot/v1/runs/current.ts)                           | GET     | —     | `bot-runs-current`              |

#### `GET /api/bot/v1/runs/current`

Returns the current live `event_run` of the tenant plus its segments —
useful for a `/run` or `/event` slash command, or for the bot to render a
"What's live right now" panel without piecing it together from the outbox.

**Auth** : `x-api-key` + tenant via per-tenant key or `x-tenant-id` header
(standard `withBotRoute` resolution).

**Response 200** (no live run)

```json
{ "run": null, "segments": [] }
```

**Response 200** (live run)

```json
{
  "run": {
    "id": "<uuid>",
    "slug": "finale-printemps-2026",
    "name": "Finale Printemps 2026",
    "description": "Show de clôture, 4 matchs + remise des prix",
    "scheduledAt": "2026-05-21T20:00:00.000Z",
    "status": "live",
    "startedAt": "2026-05-21T20:03:12.000Z",
    "endedAt": null
  },
  "segments": [
    {
      "id": "<uuid>",
      "ord": 0,
      "type": "intro",
      "title": "Intro caster",
      "durationMin": 10,
      "matchId": null,
      "status": "done",
      "startedAt": "2026-05-21T20:03:12.000Z",
      "endedAt": "2026-05-21T20:13:45.000Z"
    },
    {
      "id": "<uuid>",
      "ord": 1,
      "type": "match",
      "title": "Match 1 — Chaos Theory vs Phoenix Rising",
      "durationMin": 45,
      "matchId": "<uuid>",
      "status": "live",
      "startedAt": "2026-05-21T20:14:01.000Z",
      "endedAt": null
    }
  ]
}
```

Like the public timeline endpoint, this projection deliberately omits
`broadcast_message` and `caster_checklist`. Those stay internal — the bot
already receives the broadcast copy via the `event_segment.transitioned`
outbox event.

**Errors** : `400` (missing tenant context), `401` (auth), `500` (DB).
**Rate limit** : 60/min global. **Idempotency** : non (GET).

#### `GET /api/bot/v1/tournament-help/inventory`

Returns the canonical "manage a tournament from Discord" walkthrough used
by both the bot's `/aide-tournoi` slash command and the future admin page
`/admin/aide-tournoi`. Backed by [`config/tournament-help.json`](../config/tournament-help.json).
`Cache-Control: public, max-age=60`. Bump the `version` field on any
structural change so consumers can detect updates without diffing.

Response shape (truncated):

```json
{
  "version": "2026-05-20.1",
  "sections": [
    {
      "id": "setup",
      "title": "1. Création & configuration d'un tournoi",
      "description": "Créer le tournoi côté site, ajouter des phases…",
      "commands": [
        {
          "name": "creer-tournoi",
          "signature": "/creer-tournoi nom:<str> [statut] [debut] …",
          "role": "admin",
          "phase": "setup",
          "prereqs": ["Rôle staff Discord"],
          "endpoint": "POST /api/bot/v1/tournaments",
          "impact": {
            "db": ["tournaments (insert)"],
            "ui": ["/admin/tournois", "/tournois"]
          },
          "examples": [
            { "label": "…", "payload": { "…": "…" }, "expected": "…" }
          ],
          "deeplink_admin": "/admin/aide-tournoi#creer-tournoi"
        }
      ]
    }
  ]
}
```

### Scrims

| Route                                                                                                | Methods    | Idem. | Rate-key                |
| ---------------------------------------------------------------------------------------------------- | ---------- | ----- | ----------------------- |
| [`scrims/index.ts`](../pages/api/bot/v1/scrims/index.ts)                                             | GET, POST  | yes   | `bot-scrims`            |
| [`scrims/[scrimId]/index.ts`](../pages/api/bot/v1/scrims/[scrimId]/index.ts)                         | GET, PATCH | yes   | `bot-scrim-id`          |
| [`scrims/[scrimId]/matches.ts`](../pages/api/bot/v1/scrims/[scrimId]/matches.ts)                     | GET, POST  | yes   | `bot-scrim-matches`     |
| [`scrims/[scrimId]/matches/[matchId].ts`](../pages/api/bot/v1/scrims/[scrimId]/matches/[matchId].ts) | PATCH      | yes   | `bot-scrim-match-patch` |

### Stages

| Route                                                                                  | Methods | Idem. | Rate-key               |
| -------------------------------------------------------------------------------------- | ------- | ----- | ---------------------- |
| [`stages/[stageId]/auto-byes.ts`](../pages/api/bot/v1/stages/[stageId]/auto-byes.ts)   | POST    | yes   | `bot-stage-auto-byes`  |
| [`stages/[stageId]/finalize.ts`](../pages/api/bot/v1/stages/[stageId]/finalize.ts)     | POST    | yes   | `bot-stage-finalize`   |
| [`stages/[stageId]/next-round.ts`](../pages/api/bot/v1/stages/[stageId]/next-round.ts) | POST    | yes   | `bot-stage-next-round` |

### Tenant lifecycle (multi-tenant resolution)

| Route                                                                                | Methods | Idem. | Rate-key                      | Tenant scope        |
| ------------------------------------------------------------------------------------ | ------- | ----- | ----------------------------- | ------------------- |
| [`tenants/by-guild/[guildId].ts`](../pages/api/bot/v1/tenants/by-guild/[guildId].ts) | GET     | —     | `bot-tenants-by-guild`        | `crossTenant: true` |
| [`tenants/link-guild.ts`](../pages/api/bot/v1/tenants/link-guild.ts)                 | POST    | yes   | `bot-tenants-link-guild`      | `crossTenant: true` |
| [`tenants/all-configs.ts`](../pages/api/bot/v1/tenants/all-configs.ts)               | GET     | —     | `bot-tenants-all-configs`     | `crossTenant: true` |
| [`tenants/request-onboard.ts`](../pages/api/bot/v1/tenants/request-onboard.ts)       | POST    | yes   | `bot-tenants-request-onboard` | `crossTenant: true` |

These three endpoints **bootstrap** the bot's `guildId → (tenant_id, discord
config)` map. They are the **only** `/api/bot/v1/*` routes (alongside
`/events/pending` and `/events/:id/ack`) that do not scope their queries by
`req.botContext.tenantId` — they ARE the tenant resolver, so they look up
`discord_guilds` / `tenants` directly. The middleware is opted into this via
`crossTenant: true` in `withBotRoute({ ... })`. Pas de header `x-tenant-id`
requis (il serait ignoré — aucun 400/404 émis pour ce header sur ces routes).

#### `GET /api/bot/v1/tenants/by-guild/:guildId`

Resoud un guild Discord vers son tenant + sa config Discord (channels, roles,
forum tags). Le bot l'appelle au boot (one-shot per guild) puis cache en
memoire.

**Path params**

- `guildId` — snowflake Discord (15-25 chiffres).

**Response 200**

```json
{
  "tenant": {
    "id": "ce69a726-773e-4d12-b5eb-d2503aa752b4",
    "slug": "conference",
    "name": "Conférence",
    "is_active": true,
    "default_locale": "fr"
  },
  "guild": {
    "guild_id": "1259186540001890474",
    "is_primary": true
  },
  "discord_config": {
    "staff_log_channel_id": null,
    "matches_live_channel_id": null,
    "disputes_forum_channel_id": null,
    "lives_board_channel_id": null,
    "news_ingest_channel_id": null,
    "scrims_announce_channel_id": null,
    "captain_role_id": null,
    "substitute_role_id": null,
    "staff_role_owner_id": null,
    "staff_role_admin_id": null,
    "staff_role_manager_id": null,
    "staff_role_caster_id": null,
    "teams_voice_category_id": null,
    "disputes_forum_tag_open_id": null,
    "disputes_forum_tag_pending_id": null,
    "disputes_forum_tag_resolved_id": null,
    "extras": {}
  }
}
```

Si aucune row n'existe dans `tenant_discord_config` pour ce guild, toutes les
colonnes config retournent `null` / `{}` (defauts). Le bot doit alors
appliquer son fallback env vars sur les valeurs `null` (mode V1 progressif).

> **Breaking change** (2026-05-21) : l'ancien tableau `staff_role_ids:
string[]` est remplace par 4 colonnes typees
> (`staff_role_owner_id`, `staff_role_admin_id`, `staff_role_manager_id`,
> `staff_role_caster_id`), chacune un snowflake Discord nullable. La colonne
> SQL `staff_role_ids` est droppee. Cote bot, lire les 4 nouvelles cles dans
> `discord_config` et choisir le role correspondant a la hierarchie
> staff (`owner > admin > manager > caster`).

**Errors**

- `400 { code: "INVALID_GUILD_ID" }` — `guildId` absent ou non-snowflake.
- `404 { code: "GUILD_NOT_LINKED", guild_id: "..." }` — guild absent de
  `discord_guilds`. Le bot doit alors appeler `POST /tenants/link-guild`.
- `401`, `500`, `503` — auth / database / maintenance.

**Rate limit** : 120/min global. **Idempotency** : non (read-only).

```bash
curl -sS "https://site.example/api/bot/v1/tenants/by-guild/1259186540001890474" \
  -H "x-api-key: $BOT_API_KEY"
```

#### `POST /api/bot/v1/tenants/link-guild`

Appele par le bot dans son handler `guildCreate` (le bot vient d'etre invite
sur un nouveau serveur). Trois cas couverts en une seule call :

1. **Guild deja linke** — repond `already_linked` avec le tenant cible. Le
   bot continue normalement.
2. **Auto-claim onboarding (NEW)** — si `owner_discord_id` matche une row
   `tenant_requests` active (`status='pending_bot_invite'`,
   `email_verified_at IS NOT NULL`, `created_at < 7d`), le site cree le
   tenant complet de maniere atomique :
   `tenants` → `discord_guilds` → `tenant_secrets` (clef API + webhook
   secret freshly minted) → `staff` (si requester signed-in via Supabase
   Auth, role global = `caster`) → `tenant_staff` (role = `owner`) →
   `tenant_discord_config` (row vide). Un email Brevo single-use est
   envoye au demandeur avec un lien `/onboard/secrets/<token>` (TTL 1h).
   Reponse : `auto_claimed`.
3. **Guild inconnu sans match** — la demande est enregistree dans
   `pending_guild_links` (upsert idempotent par `guild_id`). Un admin doit
   ensuite passer sur `/admin/tenants` (S7) pour creer un tenant ou
   rattacher a un tenant existant. Le bot DEVRAIT etre configure pour
   quitter automatiquement les guilds non-linked apres N minutes
   (anti-abus), mais c'est une decision produit cote bot.

**Body**

```json
{
  "guild_id": "1234567890123456789",
  "guild_name": "Nouveau Serveur",
  "owner_discord_id": "9876543210123456789"
}
```

- `guild_id` _(requis)_ — snowflake Discord (15-25 chiffres).
- `guild_name` _(optionnel)_ — nom du guild, max 200 chars (UX admin).
- `owner_discord_id` _(optionnel)_ — Discord ID du proprietaire, snowflake.
  Recommande car declenche le chemin auto-claim si match.

**Response 200 (deja linke)**

```json
{
  "status": "already_linked",
  "guild_id": "1259186540001890474",
  "is_primary": true,
  "tenant_id": "ce69a726-773e-4d12-b5eb-d2503aa752b4",
  "tenant_slug": "conference"
}
```

**Response 200 (auto-claim)**

```json
{
  "status": "auto_claimed",
  "tenant_id": "44444444-4444-4444-4444-444444444444",
  "tenant_slug": "fresh-org",
  "guild_id": "1234567890123456789",
  "message": "Tenant created automatically from onboarding request."
}
```

**Response 200 (en attente)**

```json
{
  "status": "pending_admin_link",
  "guild_id": "1234567890123456789",
  "guild_name": "Nouveau Serveur",
  "owner_discord_id": "9876543210123456789"
}
```

**Errors**

- `400 { code: "INVALID_GUILD_ID" | "INVALID_OWNER_ID" }` — validation body.
- `401`, `500 { code: "AUTO_CLAIM_FAILED" }`, `503`.

**Rate limit** : 30/min global. **Idempotency** : oui (header
`Idempotency-Key`).

```bash
curl -sS -X POST "https://site.example/api/bot/v1/tenants/link-guild" \
  -H "x-api-key: $BOT_API_KEY" \
  -H "content-type: application/json" \
  -H "Idempotency-Key: bot-guild-create-1234567890123456789" \
  -d '{"guild_id":"1234567890123456789","guild_name":"Nouveau Serveur","owner_discord_id":"9876543210123456789"}'
```

#### `GET /api/bot/v1/tenants/all-configs`

Liste la config de TOUS les guilds linkes en une seule requete. Le bot
l'utilise au boot pour amorcer son cache in-memory plutot que de boucler
sur `/by-guild/:id`.

**Response 200**

```json
{
  "configs": [
    {
      "tenant": {
        "id": "...",
        "slug": "conference",
        "name": "Conférence",
        "is_active": true,
        "default_locale": "fr"
      },
      "guild": { "guild_id": "1259186540001890474", "is_primary": true },
      "discord_config": {
        "staff_log_channel_id": null,
        "staff_role_owner_id": null,
        "staff_role_admin_id": null,
        "staff_role_manager_id": null,
        "staff_role_caster_id": null,
        "extras": {}
      }
    }
  ]
}
```

Pas de pagination V1 (volume attendu < 100 guilds). Si le nombre monte,
ajouter `?limit=&offset=`.

**Errors** : `401`, `500`, `503`.
**Rate limit** : 30/min global. **Idempotency** : non (read-only).

```bash
curl -sS "https://site.example/api/bot/v1/tenants/all-configs" \
  -H "x-api-key: $BOT_API_KEY"
```

#### `POST /api/bot/v1/tenants/request-onboard`

Entrée _Discord-native_ du flow onboarding. Pendant du POST web
`/api/onboard/tenant-request`. Un user déjà présent sur l'un de nos serveurs
Discord exécute la slash command `/demander-bot`, le bot relaye le modal
ici. La clef API du bot prouve que le canal est de confiance et le snowflake
Discord prouve l'identité, donc **on saute la vérification Turnstile ET le
round-trip email**. Le bot doit ensuite DM le user avec le `botInviteUrl`
retourné — quand le user invite le bot sur son serveur, le `guildCreate`
côté bot déclenchera `/tenants/link-guild` qui auto-claimera ce request
(match `requester_discord_user_id` == `owner_discord_id`).

**Body**

```json
{
  "requesterDiscordUserId": "1234567890123456789",
  "requesterDiscordDisplayName": "OperatorTag",
  "requesterEmail": "op@example.com",
  "requestedSlug": "my-org",
  "requestedName": "My Organisation",
  "description": "We host community tournaments."
}
```

- `requesterDiscordUserId` _(requis)_ — snowflake Discord (15-25 chiffres).
- `requesterDiscordDisplayName` _(optionnel, nullable)_ — tag Discord, ≤ 200
  chars. Stocké pour l'UX admin/queue.
- `requested_email` _(requis)_ — email du demandeur (recevra l'email
  `secrets_reveal` quand le bot sera invité). Lowercased côté serveur.
- `requested_slug` _(requis)_ — `^[a-z][a-z0-9-]{2,29}$`, non réservé.
- `requested_name` _(requis)_ — 1-200 chars.
- `description` _(optionnel)_ — 0-1000 chars.

> Le payload utilise camelCase pour les champs Discord (`requesterDiscordUserId`,
> `requesterDiscordDisplayName`) et snake_case pour les champs tenant
> (`requested_slug`, `requested_name`, `requested_email`, `description`) afin
> de matcher 1:1 les colonnes DB pour ces derniers. Le bot doit envoyer
> exactement ces noms de clefs.

**Response 200**

```json
{
  "requestId": "f9a1f4c0-1234-4abc-89de-aaaaaaaaaaaa",
  "secretsRevealHint": "user will receive DM with bot invite URL",
  "botInviteUrl": "https://discord.com/oauth2/authorize?client_id=...&scope=bot+applications.commands&permissions=..."
}
```

Row insérée :

- `source = 'discord_command'`
- `status = 'pending_bot_invite'` (skip `pending_email_verification`)
- `email_verified_at = now()`
- `email_verification_token = NULL`
- `requester_auth_user_id = NULL`
- `ip_address` / `user_agent` = NULL

**Errors**

- `400 { code: "INVALID_BODY", fields: {…} }` — champ invalide (snowflake,
  slug, email, nom). Le champ fautif est dans `fields`.
- `409 { code: "SLUG_TAKEN" }` — un tenant existant ou une autre request
  active porte déjà ce slug.
- `409 { code: "REQUEST_ALREADY_PENDING" }` — ce Discord user a déjà une
  request `pending_*` en cours (unique partial index).
- `500 { code: "BOT_INVITE_UNAVAILABLE" }` — `DISCORD_CLIENT_ID` non
  configuré côté site (no-op du flow, contactez l'admin site).
- `401`, `500`, `503` — auth / database / maintenance.

**Rate limit** : 30/min global. **Idempotency** : oui (header
`Idempotency-Key` recommandé — le bot peut rejouer le slash command sans
créer de doublon).

```bash
curl -sS -X POST "https://site.example/api/bot/v1/tenants/request-onboard" \
  -H "x-api-key: $BOT_API_KEY" \
  -H "content-type: application/json" \
  -H "Idempotency-Key: demander-bot-1234567890123456789" \
  -d '{
    "requesterDiscordUserId": "1234567890123456789",
    "requesterDiscordDisplayName": "OperatorTag",
    "requesterEmail": "op@example.com",
    "requestedSlug": "my-org",
    "requestedName": "My Organisation",
    "description": "We host community tournaments."
  }'
```

### Teams

| Route                                                                                          | Methods    | Idem. | Rate-key                    |
| ---------------------------------------------------------------------------------------------- | ---------- | ----- | --------------------------- |
| [`teams/index.ts`](../pages/api/bot/v1/teams/index.ts)                                         | GET, POST  | yes   | `bot-teams`                 |
| [`teams/[teamId].ts`](../pages/api/bot/v1/teams/[teamId].ts)                                   | GET, PATCH | —     | `bot-team-id`               |
| [`teams/[teamId]/discord.ts`](../pages/api/bot/v1/teams/[teamId]/discord.ts)                   | PATCH      | yes   | `bot-team-discord`          |
| [`teams/[teamId]/invitations.ts`](../pages/api/bot/v1/teams/[teamId]/invitations.ts)           | GET, POST  | yes   | `bot-team-invitations`      |
| [`teams/[teamId]/members.ts`](../pages/api/bot/v1/teams/[teamId]/members.ts)                   | DELETE     | yes   | `bot-team-members-kick`     |
| [`teams/[teamId]/transfer-captain.ts`](../pages/api/bot/v1/teams/[teamId]/transfer-captain.ts) | POST       | yes   | `bot-team-transfer-captain` |
| [`teams/leave.ts`](../pages/api/bot/v1/teams/leave.ts)                                         | POST       | yes   | `bot-team-leave`            |

### Tournaments

| Route                                                                                                | Methods   | Idem. | Rate-key                 |
| ---------------------------------------------------------------------------------------------------- | --------- | ----- | ------------------------ |
| [`tournaments/index.ts`](../pages/api/bot/v1/tournaments/index.ts)                                   | GET, POST | yes   | `bot-tournaments`        |
| [`tournaments/[tournamentId]/bracket.ts`](../pages/api/bot/v1/tournaments/[tournamentId]/bracket.ts) | GET       | —     | `bot-tournament-bracket` |
| [`tournaments/[tournamentId]/clone.ts`](../pages/api/bot/v1/tournaments/[tournamentId]/clone.ts)     | POST      | yes   | `bot-tournament-clone`   |
| [`tournaments/[tournamentId]/matches.ts`](../pages/api/bot/v1/tournaments/[tournamentId]/matches.ts) | POST      | yes   | `bot-matches`            |
| [`tournaments/[tournamentId]/stages.ts`](../pages/api/bot/v1/tournaments/[tournamentId]/stages.ts)   | POST      | yes   | `bot-stages`             |
| [`tournaments/[tournamentId]/status.ts`](../pages/api/bot/v1/tournaments/[tournamentId]/status.ts)   | POST      | yes   | `bot-tournament-status`  |
| [`tournaments/[tournamentId]/teams.ts`](../pages/api/bot/v1/tournaments/[tournamentId]/teams.ts)     | GET, POST | yes   | `bot-tournament-teams`   |

---

## Matrice commandes Discord ↔ endpoints

Mapping de chaque commande slash / interaction du bot vers son endpoint
`/api/bot/v1/*`. Source canonique : [`config/tournament-help.json`](../config/tournament-help.json)
(servi via `GET /api/bot/v1/tournament-help/inventory`). Cette table doit
rester en phase avec la fixture — si tu ajoutes une commande au bot, ajoute
sa ligne ici **et** dans la fixture.

| Commande / interaction                                                                                           | Rôle    | Endpoint                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `/creer-tournoi`                                                                                                 | admin   | `POST /api/bot/v1/tournaments`                                                                                                        |
| `/publier-tournoi`                                                                                               | admin   | `POST /api/bot/v1/tournaments/:tournamentId/status`                                                                                   |
| `/cloner-tournoi`                                                                                                | admin   | `POST /api/bot/v1/tournaments/:tournamentId/clone`                                                                                    |
| `/creer-phase`                                                                                                   | admin   | `POST /api/bot/v1/tournaments/:tournamentId/stages`                                                                                   |
| `/generer-bracket-vide`                                                                                          | admin   | `POST /api/bot/v1/tournaments/:tournamentId/matches`                                                                                  |
| `/tournois`                                                                                                      | public  | `GET /api/bot/v1/tournaments`                                                                                                         |
| `/creer-mon-equipe`                                                                                              | captain | `POST /api/bot/v1/teams`                                                                                                              |
| `/modifier-equipe`                                                                                               | captain | `PATCH /api/bot/v1/teams/:teamId`                                                                                                     |
| `/modifier-equipe-admin`                                                                                         | admin   | `PATCH /api/bot/v1/teams/:teamId` _(body `actorIsStaff: true` → bypass capitaine)_                                                    |
| `/inscrire-equipe`                                                                                               | admin   | `POST /api/bot/v1/tournaments/:tournamentId/teams`                                                                                    |
| `/inscrire-membre`                                                                                               | admin   | `POST /api/bot/v1/register-user`                                                                                                      |
| `/inscription`                                                                                                   | player  | `POST /api/bot/v1/register-user`                                                                                                      |
| `/inviter send`                                                                                                  | captain | `POST /api/bot/v1/teams/:teamId/invitations`                                                                                          |
| `/inviter cancel`                                                                                                | captain | `POST /api/bot/v1/invitations/:demandeId`                                                                                             |
| Bouton DM `invite:accept:<id>` / `invite:reject:<id>`                                                            | player  | `POST /api/bot/v1/invitations/:demandeId`                                                                                             |
| `/quitter-equipe`                                                                                                | player  | `POST /api/bot/v1/teams/leave`                                                                                                        |
| `/team show` / `/team member` / `/roster`                                                                        | public  | `GET /api/bot/v1/teams/:teamId`                                                                                                       |
| `/casters`                                                                                                       | public  | `GET /api/bot/v1/cast/assignments`                                                                                                    |
| `/assigner-cast`                                                                                                 | admin   | `POST /api/bot/v1/matches/:matchId/cast`                                                                                              |
| `/retirer-cast`                                                                                                  | admin   | `DELETE /api/bot/v1/matches/:matchId/cast`                                                                                            |
| Job DM T-30 caster + bouton `cast:ack:<id>`                                                                      | caster  | `GET /api/bot/v1/cast/upcoming`, `POST /api/bot/v1/cast/:assignmentId/ack`                                                            |
| `/checkin` + bouton DM `checkin:<matchId>`                                                                       | captain | `POST /api/bot/v1/matches/:matchId/checkin`                                                                                           |
| Bouton DM `veto:<matchId>`                                                                                       | captain | `GET`/`POST`/`DELETE /api/bot/v1/matches/:matchId/veto`                                                                               |
| `/report-score` + bouton DM `report:<matchId>`                                                                   | captain | `POST /api/bot/v1/matches/:matchId/report`                                                                                            |
| `/match-meta`                                                                                                    | admin   | `PATCH /api/bot/v1/matches/:matchId`                                                                                                  |
| `/participants`                                                                                                  | public  | `GET /api/bot/v1/tournaments/:tournamentId/teams`                                                                                     |
| `/bracket`                                                                                                       | public  | `GET /api/bot/v1/tournaments/:tournamentId/bracket`                                                                                   |
| `/next-round`                                                                                                    | admin   | `POST /api/bot/v1/stages/:stageId/next-round`                                                                                         |
| `/disputes`                                                                                                      | admin   | `GET /api/bot/v1/disputes`                                                                                                            |
| `/disputes-board`                                                                                                | admin   | `GET /api/bot/v1/disputes/escalations?breached=true`                                                                                  |
| `/resoudre-dispute`                                                                                              | admin   | `POST /api/bot/v1/matches/:matchId/resolve-dispute`                                                                                   |
| `/forfait`                                                                                                       | admin   | `POST /api/bot/v1/matches/:matchId/forfeit`                                                                                           |
| `/reset-match`                                                                                                   | admin   | `POST /api/bot/v1/matches/:matchId/reset`                                                                                             |
| `/signalement`                                                                                                   | public  | _(pas d'endpoint — Discord-only, post staff channel)_                                                                                 |
| `/finaliser-phase`                                                                                               | admin   | `POST /api/bot/v1/stages/:stageId/finalize`                                                                                           |
| `/auto-byes`                                                                                                     | admin   | `POST /api/bot/v1/stages/:stageId/auto-byes`                                                                                          |
| `/transferer-capitaine`                                                                                          | captain | `POST /api/bot/v1/teams/:teamId/transfer-captain`                                                                                     |
| `/classement`                                                                                                    | public  | `GET /api/bot/v1/leaderboards/teams`                                                                                                  |
| `/sync-roles` / `/rs`                                                                                            | admin   | `GET /api/bot/v1/role-sync/snapshot`                                                                                                  |
| `/annoncer`                                                                                                      | admin   | `POST /api/bot/v1/announcements`                                                                                                      |
| `/repost-news`                                                                                                   | admin   | _(pas d'endpoint — re-poste depuis l'état interne du bot)_                                                                            |
| `/lives`                                                                                                         | public  | `GET /api/bot/v1/twitch/live`                                                                                                         |
| `/logs`                                                                                                          | admin   | `GET /api/bot/v1/staff-logs`                                                                                                          |
| `/demandes`                                                                                                      | admin   | `GET /api/bot/v1/demandes`                                                                                                            |
| `/me` / `/next-match` / `/stats` / `/historique` / `/rappels` / `/mes-invitations` / `/profil` / `/profil-admin` | player  | `GET/PATCH /api/bot/v1/players/by-discord/:discordUserId/*`                                                                           |
| `/mes-actions` + bouton `snooze:<actionKey>`                                                                     | player  | `GET /api/bot/v1/players/by-discord/:discordUserId/actions-todo`, `POST /api/bot/v1/players/by-discord/:discordUserId/actions/snooze` |
| `/ma-dispute`                                                                                                    | captain | `GET /api/bot/v1/matches/:matchId/dispute`                                                                                            |
| `/scrim create / show / start / finish / score`                                                                  | admin   | `GET`/`POST`/`PATCH /api/bot/v1/scrims*`                                                                                              |
| Autocomplete (tournois, équipes, matchs, phases, cast-members)                                                   | —       | `GET /api/bot/v1/autocomplete/*`                                                                                                      |
| `outbox-poller` (jobs internes)                                                                                  | —       | `GET /api/bot/v1/events/pending`, `POST /api/bot/v1/events/handled`, `POST /api/bot/v1/events/:id/ack`                                |
| `reconciliation` (jobs internes)                                                                                 | —       | `GET /api/bot/v1/reconcile/discord-orphans`                                                                                           |
| `match-thread` / `team-voice` / `dispute-forum` (event-driven, pas de slash)                                     | —       | `PATCH /api/bot/v1/matches/:matchId/discord`, `PATCH /api/bot/v1/teams/:teamId/discord`                                               |
| `/aide-tournoi` _(à venir, conso de cette fixture)_                                                              | public  | `GET /api/bot/v1/tournament-help/inventory`                                                                                           |

---

## Tenant management (admin)

S7 — endpoints **admin** (staff dashboard, NOT bot) qui gerent la
configuration multi-tenant : switcher de tenant actif via cookie, CRUD
des tenants, claim des `pending_guild_links` venus du bot, config
Discord par guild, gestion du staff par tenant.

Auth : `withStaffRoute` (cookie Supabase) — cf. `utils/staff.ts`. Le
tenant actif est lu depuis le cookie `staff_active_tenant_id` (UUID),
fallback sur le premier tenant accessible par slug ASC, puis sur
`DEFAULT_TENANT_ID`. Le champ `currentTenantSource` dans
`AuthenticatedStaffContext` indique la provenance (`'cookie' |
'fallback_first' | 'fallback_default'`).

Cookie `staff_active_tenant_id` : `HttpOnly; SameSite=Lax; Path=/`,
session cookie (pas de Max-Age), `Secure` ajoute en production.

| Route                                                                                                     | Methods            | Min role       | Notes                                                                                                                             |
| --------------------------------------------------------------------------------------------------------- | ------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [`active-tenant.ts`](../pages/api/admin/active-tenant.ts)                                                 | GET, POST          | caster         | GET → tenant courant + source. POST → switch + Set-Cookie.                                                                        |
| [`tenants/accessible.ts`](../pages/api/admin/tenants/accessible.ts)                                       | GET                | caster         | Tenants accessibles au staff (pour dropdown switcher).                                                                            |
| [`tenants/index.ts`](../pages/api/admin/tenants/index.ts)                                                 | GET, POST          | manager        | GET liste globale + guild_count/staff_count. POST cree tenant.                                                                    |
| [`tenants/[id].ts`](../pages/api/admin/tenants/[id].ts)                                                   | GET, PATCH, DELETE | caster/manager | GET = manager+ OU staff du tenant. PATCH/DELETE = manager+. Slug immuable. DELETE = soft (is_active=false), `conference` protege. |
| [`tenants/[id]/discord-config/index.ts`](../pages/api/admin/tenants/[id]/discord-config/index.ts)         | GET                | caster         | Liste configs par guild du tenant.                                                                                                |
| [`tenants/[id]/discord-config/[guildId].ts`](../pages/api/admin/tenants/[id]/discord-config/[guildId].ts) | PUT                | caster         | Upsert config Discord. Verifie que guildId est dans le tenant.                                                                    |
| [`tenants/[id]/staff/index.ts`](../pages/api/admin/tenants/[id]/staff/index.ts)                           | GET, POST          | caster/manager | GET = staff du tenant ou manager+. POST = manager+.                                                                               |
| [`tenants/[id]/staff/[staffId].ts`](../pages/api/admin/tenants/[id]/staff/[staffId].ts)                   | DELETE             | manager        | 409 si on retire le dernier admin du tenant.                                                                                      |
| [`pending-guild-links/index.ts`](../pages/api/admin/pending-guild-links/index.ts)                         | GET                | manager        | Guilds en attente de linkage (rempli par `POST /bot/v1/tenants/link-guild`).                                                      |
| [`pending-guild-links/[guildId]/claim.ts`](../pages/api/admin/pending-guild-links/[guildId]/claim.ts)     | POST               | manager        | Body `{ tenant_id }` OU `{ new_tenant: { slug, name, default_locale? } }`. Cree row dans `discord_guilds` + delete pending.       |
| [`pending-guild-links/[guildId]/index.ts`](../pages/api/admin/pending-guild-links/[guildId]/index.ts)     | DELETE             | manager        | Rejette la demande (delete pending). V2 TODO : signaler au bot pour `guild.leave()`.                                              |

Idempotence : les mutations POST/PATCH/PUT/DELETE supportent
l'header `Idempotency-Key` via `withAdminIdempotency` (cache scope =
tenant courant + staff + route + body hash, TTL 5 min, 2xx only).

---

## Where it lives

- **Middleware** — [`utils/botAuth.ts`](../utils/botAuth.ts) (`withBotRoute`,
  `verifyBotApiKey`, `bot_idempotency` table access).
- **Rate limit primitives** — [`utils/rateLimit.ts`](../utils/rateLimit.ts).
- **Maintenance toggle** — [`utils/maintenance.ts`](../utils/maintenance.ts).
- **Idempotency DDL** — [`database/migrations/`](../database/migrations/)
  (`add_bot_idempotency_table.sql`).
- **Consumer (bot)** — `docker-box/services/discord-bot/` (sibling repo).

## Extending the contract

When you add a new `/api/bot/v1/*` route:

1. Wrap the handler with `withBotRoute({ methods, rateLimit, idempotent? })`.
2. Pick a unique `rateLimit.key` (greppable across the codebase — collisions
   silently merge buckets). The existing `bot-player-actions` collision is
   the only intentional one.
3. Decide `idempotent: true` for any state-changing write the bot might retry.
   Cost is one cached Supabase row per request for 5 min. The exception is
   the events queue (`events/handled.ts`) where idempotency is intentionally
   off so the bot can re-mark events.
4. Update this doc's inventory table — keep this file in sync with the
   `withBotRoute` configs.
