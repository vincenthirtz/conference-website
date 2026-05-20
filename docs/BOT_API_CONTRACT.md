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

| Header      | Value                                                                 |
|-------------|-----------------------------------------------------------------------|
| `x-api-key` | The shared secret `BOT_API_KEY` (set in both repos' env)              |

- Comparison is constant-time (`crypto.timingSafeEqual`).
- Missing/empty header → `401 { error: "Invalid or missing API key." }`.
- `BOT_API_KEY` unset on the server → `500 { error: "Endpoint not configured." }`
  (the server logs which route was hit).
- The bot identifies the **acting user** via `actorDiscordUserId` in the
  body (writes) or query string (reads) — this is separate from auth and
  feeds the per-actor rate-limit and audit logs.

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

| Code | When                                                                  |
|------|-----------------------------------------------------------------------|
| 200  | OK / replayed cache                                                   |
| 201  | Resource created (some POST endpoints)                                |
| 400  | Validation error (missing field, malformed UUID/Discord ID, etc.)     |
| 401  | Missing/invalid `x-api-key`                                           |
| 403  | Actor not allowed to perform the action (e.g. non-captain)            |
| 404  | Target resource not found                                             |
| 405  | Method not allowed — response includes `Allow` header                 |
| 409  | Business-state conflict (already finished, already disputed, etc.)    |
| 429  | Rate limit hit (global or per-actor)                                  |
| 500  | Server config (key unset / DB unavailable) or unhandled exception     |
| 503  | Maintenance mode (writes only) — see above                            |

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

| Route | Methods | Idem. | Rate-key |
|---|---|---|---|
| [`announcements.ts`](../pages/api/bot/v1/announcements.ts) | POST | yes | `bot-announcements` |
| [`disputes.ts`](../pages/api/bot/v1/disputes.ts) | GET | — | `bot-disputes` |
| [`staff-logs.ts`](../pages/api/bot/v1/staff-logs.ts) | GET | — | `bot-staff-logs` |

### Autocomplete (Discord choice-pickers)

| Route | Methods | Idem. | Rate-key |
|---|---|---|---|
| [`autocomplete/cast-members.ts`](../pages/api/bot/v1/autocomplete/cast-members.ts) | GET | — | `bot-ac-cast-members` |
| [`autocomplete/matches.ts`](../pages/api/bot/v1/autocomplete/matches.ts) | GET | — | `bot-ac-matches` |
| [`autocomplete/stages.ts`](../pages/api/bot/v1/autocomplete/stages.ts) | GET | — | `bot-ac-stages` |
| [`autocomplete/teams.ts`](../pages/api/bot/v1/autocomplete/teams.ts) | GET | — | `bot-ac-teams` |
| [`autocomplete/tournaments.ts`](../pages/api/bot/v1/autocomplete/tournaments.ts) | GET | — | `bot-ac-tournaments` |

### Cast assignments

| Route | Methods | Idem. | Rate-key |
|---|---|---|---|
| [`cast/assignments.ts`](../pages/api/bot/v1/cast/assignments.ts) | GET | — | `bot-cast-assignments` |
| [`cast/upcoming.ts`](../pages/api/bot/v1/cast/upcoming.ts) | GET | — | `bot-cast-upcoming` |
| [`cast/[assignmentId]/ack.ts`](../pages/api/bot/v1/cast/[assignmentId]/ack.ts) | POST | yes | `cast.ack` |
| [`matches/[matchId]/cast.ts`](../pages/api/bot/v1/matches/[matchId]/cast.ts) | GET, POST, DELETE | yes | `bot-match-cast` |

#### `GET /api/bot/v1/cast/upcoming`

Liste les `cast_assignments` dont le match commence dans la fenetre `[now,
now+withinMinutes]`, non annules, `acked_at IS NULL`. Sert au bot pour DM les
casters a T-30 avec un bouton "Je confirme" (qui POST `/cast/:id/ack`).

**Auth** : `x-api-key`

**Query**
- `withinMinutes` (optionnel, int, 5..120, defaut 30) — taille de la fenetre

**Response 200**
```json
{
  "assignments": [
    {
      "assignmentId": "uuid",
      "matchId": "uuid",
      "matchStartsAt": "2026-05-20T20:00:00.000Z",
      "casterDiscordUserId": "9000…",
      "role": "Streameuse Overwatch",
      "teamA": { "id": "uuid", "name": "Chaos Theory" },
      "teamB": { "id": "uuid", "name": "Nova Storm" },
      "tournamentName": "Spring Cup 2026",
      "ackedAt": null
    }
  ],
  "count": 1,
  "withinMinutes": 30
}
```

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
{ "assignmentId": "uuid", "ackedAt": "2026-05-20T19:45:00.000Z", "alreadyAcked": false }
```

**Errors** : `400` (uuid/discord id invalide), `401`, `403` (pas le caster),
`404` (assignment introuvable), `503` (maintenance).
**Rate limit** : 30/min global, bucket `cast.ack`. **Idempotency** : oui.

### Events queue (bot ↔ site eventual-consistency channel)

| Route | Methods | Idem. | Rate-key |
|---|---|---|---|
| [`events/pending.ts`](../pages/api/bot/v1/events/pending.ts) | GET | — | `bot-events-pending` |
| [`events/handled.ts`](../pages/api/bot/v1/events/handled.ts) | POST | no | `bot-events-handled` |
| [`events/[id]/ack.ts`](../pages/api/bot/v1/events/[id]/ack.ts) | POST | yes | `bot-events-ack` |
| [`reconcile/discord-orphans.ts`](../pages/api/bot/v1/reconcile/discord-orphans.ts) | GET | — | `bot-reconcile-orphans` |

### Locks (distributed cron / fullSync coordination)

| Route | Methods | Idem. | Rate-key |
|---|---|---|---|
| [`locks/[name].ts`](../pages/api/bot/v1/locks/[name].ts) | POST | no | `bot-locks` |

### Matches

| Route | Methods | Idem. | Rate-key |
|---|---|---|---|
| [`matches/[matchId].ts`](../pages/api/bot/v1/matches/[matchId].ts) | GET, PATCH | yes | `bot-match-meta` |
| [`matches/[matchId]/checkin.ts`](../pages/api/bot/v1/matches/[matchId]/checkin.ts) | POST | yes | `bot-match-checkin` |
| [`matches/[matchId]/discord.ts`](../pages/api/bot/v1/matches/[matchId]/discord.ts) | PATCH | yes | `bot-match-discord` |
| [`matches/[matchId]/forfeit.ts`](../pages/api/bot/v1/matches/[matchId]/forfeit.ts) | POST | yes | `bot-match-forfeit` |
| [`matches/[matchId]/report.ts`](../pages/api/bot/v1/matches/[matchId]/report.ts) | POST | yes | `bot-match-report` |
| [`matches/[matchId]/reset.ts`](../pages/api/bot/v1/matches/[matchId]/reset.ts) | POST | yes | `bot-match-reset` |
| [`matches/[matchId]/resolve-dispute.ts`](../pages/api/bot/v1/matches/[matchId]/resolve-dispute.ts) | POST | yes | `bot-match-resolve-dispute` |
| [`matches/[matchId]/veto.ts`](../pages/api/bot/v1/matches/[matchId]/veto.ts) | GET, POST, DELETE | yes | `bot-match-veto` |

### Players (by Discord ID lookups)

| Route | Methods | Idem. | Rate-key |
|---|---|---|---|
| [`players/by-discord/[discordUserId]/actions.ts`](../pages/api/bot/v1/players/by-discord/[discordUserId]/actions.ts) | GET | — | `bot-player-actions` |
| [`players/by-discord/[discordUserId]/history.ts`](../pages/api/bot/v1/players/by-discord/[discordUserId]/history.ts) | GET | — | `bot-player-history` |
| [`players/by-discord/[discordUserId]/invitations.ts`](../pages/api/bot/v1/players/by-discord/[discordUserId]/invitations.ts) | GET | — | `bot-player-invitations` |
| [`players/by-discord/[discordUserId]/next-match.ts`](../pages/api/bot/v1/players/by-discord/[discordUserId]/next-match.ts) | GET | — | `bot-player-next-match` |
| [`players/by-discord/[discordUserId]/profile.ts`](../pages/api/bot/v1/players/by-discord/[discordUserId]/profile.ts) | PATCH | yes | `bot-player-profile` |
| [`players/by-discord/[discordUserId]/reminders.ts`](../pages/api/bot/v1/players/by-discord/[discordUserId]/reminders.ts) | GET | — | `bot-player-reminders` |
| [`players/by-discord/[discordUserId]/stats.ts`](../pages/api/bot/v1/players/by-discord/[discordUserId]/stats.ts) | GET | — | `bot-player-stats` |
| [`players/by-discord/[discordUserId]/team.ts`](../pages/api/bot/v1/players/by-discord/[discordUserId]/team.ts) | GET | — | `bot-player-team` |
| [`player-actions.ts`](../pages/api/bot/v1/player-actions.ts) | GET | — | `bot-player-actions` *(shares bucket with the by-discord variant)* |

### Registration / linking

| Route | Methods | Idem. | Rate-key |
|---|---|---|---|
| [`register-user.ts`](../pages/api/bot/v1/register-user.ts) | POST | yes | `bot-register` |
| [`role-sync/snapshot.ts`](../pages/api/bot/v1/role-sync/snapshot.ts) | GET | — | `bot-role-sync-snapshot` |

### Demandes & invitations

| Route | Methods | Idem. | Rate-key |
|---|---|---|---|
| [`demandes.ts`](../pages/api/bot/v1/demandes.ts) | GET | — | `bot-demandes` |
| [`invitations/[demandeId].ts`](../pages/api/bot/v1/invitations/[demandeId].ts) | POST | yes | `bot-invitations-action` |

### Reminders & live data

| Route | Methods | Idem. | Rate-key |
|---|---|---|---|
| [`reminders/index.ts`](../pages/api/bot/v1/reminders/index.ts) | GET | — | `bot-reminders` |
| [`leaderboards/teams.ts`](../pages/api/bot/v1/leaderboards/teams.ts) | GET | — | `bot-leaderboards-teams` |
| [`twitch/live.ts`](../pages/api/bot/v1/twitch/live.ts) | GET | — | `bot-twitch-live` |
| [`tournament-help/inventory.ts`](../pages/api/bot/v1/tournament-help/inventory.ts) | GET | — | `bot-tournament-help-inventory` |

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

| Route | Methods | Idem. | Rate-key |
|---|---|---|---|
| [`scrims/index.ts`](../pages/api/bot/v1/scrims/index.ts) | GET, POST | yes | `bot-scrims` |
| [`scrims/[scrimId]/index.ts`](../pages/api/bot/v1/scrims/[scrimId]/index.ts) | GET, PATCH | yes | `bot-scrim-id` |
| [`scrims/[scrimId]/matches.ts`](../pages/api/bot/v1/scrims/[scrimId]/matches.ts) | GET, POST | yes | `bot-scrim-matches` |
| [`scrims/[scrimId]/matches/[matchId].ts`](../pages/api/bot/v1/scrims/[scrimId]/matches/[matchId].ts) | PATCH | yes | `bot-scrim-match-patch` |

### Stages

| Route | Methods | Idem. | Rate-key |
|---|---|---|---|
| [`stages/[stageId]/auto-byes.ts`](../pages/api/bot/v1/stages/[stageId]/auto-byes.ts) | POST | yes | `bot-stage-auto-byes` |
| [`stages/[stageId]/finalize.ts`](../pages/api/bot/v1/stages/[stageId]/finalize.ts) | POST | yes | `bot-stage-finalize` |
| [`stages/[stageId]/next-round.ts`](../pages/api/bot/v1/stages/[stageId]/next-round.ts) | POST | yes | `bot-stage-next-round` |

### Teams

| Route | Methods | Idem. | Rate-key |
|---|---|---|---|
| [`teams/index.ts`](../pages/api/bot/v1/teams/index.ts) | GET, POST | yes | `bot-teams` |
| [`teams/[teamId].ts`](../pages/api/bot/v1/teams/[teamId].ts) | GET, PATCH | — | `bot-team-id` |
| [`teams/[teamId]/discord.ts`](../pages/api/bot/v1/teams/[teamId]/discord.ts) | PATCH | yes | `bot-team-discord` |
| [`teams/[teamId]/invitations.ts`](../pages/api/bot/v1/teams/[teamId]/invitations.ts) | GET, POST | yes | `bot-team-invitations` |
| [`teams/[teamId]/members.ts`](../pages/api/bot/v1/teams/[teamId]/members.ts) | DELETE | yes | `bot-team-members-kick` |
| [`teams/[teamId]/transfer-captain.ts`](../pages/api/bot/v1/teams/[teamId]/transfer-captain.ts) | POST | yes | `bot-team-transfer-captain` |
| [`teams/leave.ts`](../pages/api/bot/v1/teams/leave.ts) | POST | yes | `bot-team-leave` |

### Tournaments

| Route | Methods | Idem. | Rate-key |
|---|---|---|---|
| [`tournaments/index.ts`](../pages/api/bot/v1/tournaments/index.ts) | GET, POST | yes | `bot-tournaments` |
| [`tournaments/[tournamentId]/bracket.ts`](../pages/api/bot/v1/tournaments/[tournamentId]/bracket.ts) | GET | — | `bot-tournament-bracket` |
| [`tournaments/[tournamentId]/clone.ts`](../pages/api/bot/v1/tournaments/[tournamentId]/clone.ts) | POST | yes | `bot-tournament-clone` |
| [`tournaments/[tournamentId]/matches.ts`](../pages/api/bot/v1/tournaments/[tournamentId]/matches.ts) | POST | yes | `bot-matches` |
| [`tournaments/[tournamentId]/stages.ts`](../pages/api/bot/v1/tournaments/[tournamentId]/stages.ts) | POST | yes | `bot-stages` |
| [`tournaments/[tournamentId]/status.ts`](../pages/api/bot/v1/tournaments/[tournamentId]/status.ts) | POST | yes | `bot-tournament-status` |
| [`tournaments/[tournamentId]/teams.ts`](../pages/api/bot/v1/tournaments/[tournamentId]/teams.ts) | GET, POST | yes | `bot-tournament-teams` |

---

## Matrice commandes Discord ↔ endpoints

Mapping de chaque commande slash / interaction du bot vers son endpoint
`/api/bot/v1/*`. Source canonique : [`config/tournament-help.json`](../config/tournament-help.json)
(servi via `GET /api/bot/v1/tournament-help/inventory`). Cette table doit
rester en phase avec la fixture — si tu ajoutes une commande au bot, ajoute
sa ligne ici **et** dans la fixture.

| Commande / interaction | Rôle | Endpoint |
|---|---|---|
| `/creer-tournoi` | admin | `POST /api/bot/v1/tournaments` |
| `/publier-tournoi` | admin | `POST /api/bot/v1/tournaments/:tournamentId/status` |
| `/cloner-tournoi` | admin | `POST /api/bot/v1/tournaments/:tournamentId/clone` |
| `/creer-phase` | admin | `POST /api/bot/v1/tournaments/:tournamentId/stages` |
| `/generer-bracket-vide` | admin | `POST /api/bot/v1/tournaments/:tournamentId/matches` |
| `/tournois` | public | `GET /api/bot/v1/tournaments` |
| `/creer-mon-equipe` | captain | `POST /api/bot/v1/teams` |
| `/modifier-equipe` | captain | `PATCH /api/bot/v1/teams/:teamId` |
| `/inscrire-equipe` | admin | `POST /api/bot/v1/tournaments/:tournamentId/teams` |
| `/inscrire-membre` | admin | `POST /api/bot/v1/register-user` |
| `/inscription` | player | `POST /api/bot/v1/register-user` |
| `/inviter send` | captain | `POST /api/bot/v1/teams/:teamId/invitations` |
| `/inviter cancel` | captain | `POST /api/bot/v1/invitations/:demandeId` |
| Bouton DM `invite:accept:<id>` / `invite:reject:<id>` | player | `POST /api/bot/v1/invitations/:demandeId` |
| `/quitter-equipe` | player | `POST /api/bot/v1/teams/leave` |
| `/team show` / `/team member` / `/roster` | public | `GET /api/bot/v1/teams/:teamId` |
| `/casters` | public | `GET /api/bot/v1/cast/assignments` |
| `/assigner-cast` | admin | `POST /api/bot/v1/matches/:matchId/cast` |
| `/retirer-cast` | admin | `DELETE /api/bot/v1/matches/:matchId/cast` |
| Job DM T-30 caster + bouton `cast:ack:<id>` | caster | `GET /api/bot/v1/cast/upcoming`, `POST /api/bot/v1/cast/:assignmentId/ack` |
| `/checkin` + bouton DM `checkin:<matchId>` | captain | `POST /api/bot/v1/matches/:matchId/checkin` |
| Bouton DM `veto:<matchId>` | captain | `GET`/`POST`/`DELETE /api/bot/v1/matches/:matchId/veto` |
| `/report-score` + bouton DM `report:<matchId>` | captain | `POST /api/bot/v1/matches/:matchId/report` |
| `/match-meta` | admin | `PATCH /api/bot/v1/matches/:matchId` |
| `/participants` | public | `GET /api/bot/v1/tournaments/:tournamentId/teams` |
| `/bracket` | public | `GET /api/bot/v1/tournaments/:tournamentId/bracket` |
| `/next-round` | admin | `POST /api/bot/v1/stages/:stageId/next-round` |
| `/disputes` | admin | `GET /api/bot/v1/disputes` |
| `/resoudre-dispute` | admin | `POST /api/bot/v1/matches/:matchId/resolve-dispute` |
| `/forfait` | admin | `POST /api/bot/v1/matches/:matchId/forfeit` |
| `/reset-match` | admin | `POST /api/bot/v1/matches/:matchId/reset` |
| `/signalement` | public | _(pas d'endpoint — Discord-only, post staff channel)_ |
| `/finaliser-phase` | admin | `POST /api/bot/v1/stages/:stageId/finalize` |
| `auto-byes` _(pas de slash, appel direct)_ | admin | `POST /api/bot/v1/stages/:stageId/auto-byes` |
| `/classement` | public | `GET /api/bot/v1/leaderboards/teams` |
| `/sync-roles` / `/rs` | admin | `GET /api/bot/v1/role-sync/snapshot` |
| `/annoncer` | admin | `POST /api/bot/v1/announcements` |
| `/repost-news` | admin | _(pas d'endpoint — re-poste depuis l'état interne du bot)_ |
| `/lives` | public | `GET /api/bot/v1/twitch/live` |
| `/logs` | admin | `GET /api/bot/v1/staff-logs` |
| `/demandes` | admin | `GET /api/bot/v1/demandes` |
| `/me` / `/next-match` / `/stats` / `/historique` / `/rappels` / `/mes-invitations` / `/profil` / `/profil-admin` | player | `GET/PATCH /api/bot/v1/players/by-discord/:discordUserId/*` |
| `/scrim create / show / start / finish / score` | admin | `GET`/`POST`/`PATCH /api/bot/v1/scrims*` |
| Autocomplete (tournois, équipes, matchs, phases, cast-members) | — | `GET /api/bot/v1/autocomplete/*` |
| `outbox-poller` (jobs internes) | — | `GET /api/bot/v1/events/pending`, `POST /api/bot/v1/events/handled`, `POST /api/bot/v1/events/:id/ack` |
| `reconciliation` (jobs internes) | — | `GET /api/bot/v1/reconcile/discord-orphans` |
| `match-thread` / `team-voice` / `dispute-forum` (event-driven, pas de slash) | — | `PATCH /api/bot/v1/matches/:matchId/discord`, `PATCH /api/bot/v1/teams/:teamId/discord` |
| `/aide-tournoi` _(à venir, conso de cette fixture)_ | public | `GET /api/bot/v1/tournament-help/inventory` |

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
