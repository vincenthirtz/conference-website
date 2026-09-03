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

- The provided key is sha256-hashed and looked up in
  `tenant_secrets.bot_api_key_hash`. Match → the row's `tenant_id` is
  authoritative for the request (`req.botContext.tenantId`).
- **Per-tenant only** : the legacy global `BOT_API_KEY` env fallback has been
  **removed** for `/api/bot/v1/*`. Every tenant MUST have its key seeded in
  `tenant_secrets` (see [Per-tenant secrets rotation](#per-tenant-secrets-rotation)
  below).
- Missing/empty header, or a key matching no `tenant_secrets` row →
  `401 { error: "Invalid or missing API key." }`.
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
2. **Does NOT need to update Netlify env vars** for the bot/v1 API: the site
   resolves both the API key and the webhook signing secret per-tenant from
   `tenant_secrets`. The env fallback for `/api/bot/v1/*` auth **and** webhook
   signing has been **removed** — the site refuses any bot whose key isn't
   seeded in `tenant_secrets`.
3. **Netlify env cleanup**: `BOT_WEBHOOK_SECRET` is no longer read by the site
   and can be deleted. `BOT_API_KEY` is still consumed by two **legacy non-v1**
   routes (`POST /api/news` ingest and the `/api/support/ticket` bot path), so
   keep it until those migrate — it no longer affects `/api/bot/v1/*` auth.

   > **`POST /api/news` (legacy ingest) — tenant model.** This route authenticates
   > with the **global** `BOT_API_KEY` and selects the target tenant from the
   > client `x-tenant-id` header (the key is **not** per-tenant authoritative
   > here, unlike `/api/bot/v1/*`). The caller
   > `services/discord-bot/news-forwarder.js` sends `x-api-key: BOT_API_KEY` +
   > a guild-resolved `x-tenant-id`. It is **not** migrated to `withBotRoute`
   > because that would require a per-tenant key seeded in `tenant_secrets`,
   > which this caller does not send → migrate bot **and** site together. As a
   > hardening that preserves the legacy contract, the route now **rejects an
   > unknown or inactive `x-tenant-id` with `400 UNKNOWN_TENANT`** (the
   > `DEFAULT_TENANT_ID` fallback stays valid), so a global-key holder can no
   > longer write news into an arbitrary/spoofed tenant bucket.

## Tenant identification

The site is multi-tenant. The tenant for every `/api/bot/v1/*` call is
determined **by the per-tenant API key** (`tenant_secrets.bot_api_key_hash`).
The middleware ([`utils/botAuth.ts`](../utils/botAuth.ts)) resolves it once and
stashes it on `req.botContext.tenantId`. The `x-tenant-id` header is now
**informational only**.

| Header        | Value                                                      |
| ------------- | ---------------------------------------------------------- |
| `x-tenant-id` | The tenant UUID (RFC 4122, any version). Case-insensitive. |

- **Format** (if sent): `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`, case-insensitive.
- **Ordinary key (self-hosted bot)**: the per-tenant API key is authoritative.
  `x-tenant-id` is informational; if it contradicts the key, a `warn` is logged
  and the key wins. Such a key can never change scope.
- **Platform key (shared bot)**: a key flagged `tenant_secrets.is_platform_key`
  MAY act for another tenant — this is what makes the shared bot possible at
  all, since one process serves N guilds with one key. The signal that decides
  is `x-guild-id`, checked against `discord_guilds`:

  | Header       | Value                                                        |
  | ------------ | ------------------------------------------------------------ |
  | `x-guild-id` | Discord snowflake of the server the interaction comes from. |

  - guild known → its tenant wins, even against a contradicting `x-tenant-id`
    (the bot's header falls back to the default tenant while its config cache
    is cold; the guild is the only claim the site can verify);
  - guild unknown to `discord_guilds` → warn, fall back to header/key;
  - malformed `x-guild-id` → `400 INVALID_GUILD_HEADER`;
  - no guild header, `x-tenant-id` naming an unknown/inactive tenant →
    `404 UNKNOWN_TENANT`; malformed → `400 INVALID_TENANT_HEADER`.

  The plan gate is evaluated on the **effective** tenant, never the key's.
  The bot sends `x-guild-id` on every tenant-scoped call, from the ambient
  guild of the Discord event (`services/discord-bot/request-context.js`).
- **Discord guild mapping**: the bot also resolves the UUID locally from
  `discord_guilds.guild_id` → `tenant_id` for its own routing.
- **Cross-tenant resolvers**: `/tenants/all-configs`, `/tenants/by-guild/:id`,
  `/tenants/link-guild`, `/tenants/request-onboard`, `/events/pending`,
  `/events/:id/ack` and `/cast/upcoming` are flagged `crossTenant: true`:
  `req.botContext` is left `undefined` and handlers must not read it.

  What they RETURN, though, depends on the caller (`req.botKey`, set on every
  route): a **platform key** sees all tenants — that is the routing table the
  shared bot needs, and each row carries its own `tenantId` — while an
  **ordinary key** sees only its own tenant's guilds, events and assignments.
  Before this scoping, any valid key could read every tenant's Discord
  configuration and event payloads.
- **Intentionally global tables (not yet tenant-scoped):**
  - `user_discord_links` — global by design (one Discord account ↔ one site
    account across all tenants).
  - `support_tickets` — **now tenant-scoped** (migration
    `add_tenant_id_to_support_tickets.sql`). La liste, le détail, la conversion
    en blacklist et les compteurs de `overview-summary` filtrent sur le tenant
    actif ; l'ingestion (`POST /api/support/ticket`) résout le tenant depuis
    `x-guild-id`, puis `x-tenant-id`, puis l'URL publique. Un signalement est
    nominatif et souvent sensible : il n'a rien à faire sous les yeux du staff
    d'un autre espace.

### Error codes

Tenant resolution no longer emits dedicated error codes: the per-tenant key is
authoritative, so an unrecognised key simply returns `401`
(`Invalid or missing API key.`). The former `MISSING_TENANT_ID` /
`INVALID_TENANT_ID` / `UNKNOWN_TENANT` codes were retired with the env fallback.

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

### Plan gate (« Régie solidaire »)

Bot features honour the **billing plan** of the resolved `x-tenant-id` (see
[`utils/billing/planFeatures.ts`](../utils/billing/planFeatures.ts) and
[`utils/billing/botPlanGate.ts`](../utils/billing/botPlanGate.ts)). A route may
declare `requireCapability` in `withBotRoute({ ... })`; the middleware loads the
tenant's plan (`plan`/`plan_status`/`plan_expires_at`, fail-closed to `discovery`)
and, if the effective plan lacks the capability, returns:

```json
{
  "error": "plan_required",
  "message": "…",
  "requiredCapability": "discordEventOps:full"
}
```

with HTTP **403**. An expired / `past_due` paid plan downgrades to `discovery`
(via `effectivePlan`); the flagship `foundation` has every capability and is never
gated.

**BASELINE — the bot itself is gated.** Every tenant-scoped route requires the
`discordBot` capability: the bot is reserved to the Women's Cup (`foundation`)
and to paying plans (Régie+). A free `discovery` tenant (or an expired paid plan)
gets **403 `plan_required` with `requiredCapability: "discordBot"` on EVERY
route**, base ones included — _only Women's Cup admins use the bot without a
plan_. The outbox delivery loop (`events/pending`, `events/handled`,
`events/[id]/ack`, all `crossTenant`) is **infra, not a feature → never gated**.

**PREMIUM — some features need more than the baseline.** On top of `discordBot`,
these routes also require a specific capability (currently subsumed by the
baseline since every bot-enabled plan is Régie+ with full ops, but declared for
future finer tiers). The baseline denial fires first for a tenant with no bot.

| Capability              | Routes                                                                                                                                                                                         | Plan                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `discordBot` (baseline) | **toutes les routes tenant-scopées**                                                                                                                                                           | Régie+ / foundation |
| `discordEventOps:full`  | `runs/current`, `cast/assignments`, `cast/[assignmentId]/ack`, `matches/[matchId]/cast`, `matches/[matchId]/discord`, `matches/[matchId]/drafts`, `matches/[matchId]/veto` | Régie+              |
| `arbitration`           | `disputes`, `disputes/escalations`, `matches/[matchId]/dispute`, `matches/[matchId]/resolve-dispute`, `moderation/blacklist-alert`                                                             | Régie+              |

**Bot client (docker-box `services/discord-bot/api-client.js`) — à gérer** : traiter
un **403 `plan_required`** comme un refus de capacité (ne pas retenter, désactiver
la feature pour ce tenant, logguer) plutôt qu'une erreur transitoire.

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

### Site → bot: guild inventory (channel/role picker)

Read-only companion to the webhook push, in the same direction (site → bot). The
site has **no Discord token**, so the admin "list channels" picker relays to the
bot, which owns the discord.js client.

- **Bot endpoint**: `GET /guild-inventory?guildId=<snowflake>` on the webhook
  server (proxied publicly as `/bot/guild-inventory`, cf. docker-box nginx).
- **Auth**: HMAC-SHA256 of the canonical string `` `${guildId}:${timestamp}` ``
  with the tenant's `bot_webhook_secret`, sent as `X-Webhook-Signature` +
  `X-Webhook-Timestamp` (ISO). Anti-replay: timestamp bounded to a 5-min skew.
- **Site caller**: [`pages/api/admin/tenants/[id]/discord-config/[guildId]/channels.ts`](../pages/api/admin/tenants/)
  (staff `admin+`, verifies the guild belongs to the tenant before relaying).
- **Response**: `{ guild: { id, name }, channels: [{ id, name, type, parentId, position }], roles: [{ id, name, color, position, managed }] }`.
  `type` is the numeric Discord `ChannelType`; `@everyone` is excluded from roles.

### Outbox event catalog

Event names written to `bot_event_outbox.event_name` are free-form text (no
CHECK constraint). The list below documents the names emitted by the website
today. The bot must tolerate unknown names (treat them as no-ops) so the
catalog can grow without forcing a bot deploy.

| Event name                        | Emitted by                                                                                                                        | Payload `data` shape (high-level)                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `match.starting`                  | `pages/api/admin/matches/[matchId].ts` (status → ongoing)                                                                         | `{ matchId, tournamentId?, scrimId?, team1Id, team2Id, scheduledAt, ..., enriched }`                                                           |
| `match.scheduled`                 | Admin match meta update (`scheduled_at` set)                                                                                      | `{ matchId, scheduledAt, ..., enriched }`                                                                                                      |
| `match.unscheduled`               | Admin match meta update (`scheduled_at` cleared)                                                                                  | `{ matchId }`                                                                                                                                  |
| `match.finished`                  | Score apply / admin                                                                                                               | `{ matchId, team1Score, team2Score, winnerTeamId }`                                                                                            |
| `match.disputed`                  | Admin `POST .../dispute`                                                                                                          | `{ matchId, reason, openedBy }`                                                                                                                |
| `match.dispute.resolved`          | Admin `POST .../resolve-dispute`                                                                                                  | `{ matchId, resolution, resolvedBy }`                                                                                                          |
| `dispute.sla_breached` (Lot 4)    | Cron `/api/cron/dispute-sla-check`                                                                                                | `{ matchId, tournamentId, disputeReason, disputeOpenedAt, ageMinutes, slaMinutes }`                                                            |
| `checkin.nudge` (Lot 5)           | Admin `POST /api/admin/matches/[matchId]/checkin-nudge`                                                                           | `{ matchId, tournamentId, teamSide: 1 \| 2, scheduledAt, nudgedByStaffId, enriched }`                                                          |
| `tournament.finalized` (Lot 1)    | Admin `POST /api/admin/tournament/[id]/finalize`                                                                                  | `{ tournament_id, tournament_name, rankings: [{ team_id, team_name, rank, prize }, ...] }`                                                     |
| `broadcast.state_changed` (Lot 7) | Admin `POST /api/admin/broadcast/state`                                                                                           | `{ runId, runSlug, state: { v: 1, on_air, lower_third, pip, scene, auto_director, scene_updated_at }, currentSegmentId, matchId }`             |
| `news.published`                  | Admin / bot ingest                                                                                                                | `{ newsId, slug, title, tag, excerpt, imageUrl, publishedAt }`                                                                                 |
| `registration.blacklisted`        | `utils/moderation/blacklist.ts` (`alertIfBlacklisted`) at register / team create / add-member                                     | `{ context, matchedOn, strength, reason, matchCount, matches[], battleTag?, displayName?, discordUserId? }`                                    |
| `registration.entity_blacklisted` | `utils/moderation/entityBlacklist.ts` (`alertIfEntityBlacklisted`) at team create                                                 | `{ context, entityName, matchedOn: 'name', entityType, matchedName, strength, reason, matchCount, matches[] }`                                 |
| `team.*` / `scrim.*` / `cast.*`   | various admin / bot routes                                                                                                        | see emitter call sites                                                                                                                         |
| `scrim.request`                   | `utils/scrimRequestNotify.ts` — demande de scrim dirigée (`/api/demandes/scrim`, `/api/public/scrim-requests`) ou scrim créé par le bot (`/api/bot/v1/scrims`) | `{ kind: 'request' \| 'created', captainDiscordUserId, recipientRole: 'captain' \| 'manager' \| 'coach', recipientTeamName, opponentName, dateLabel, message, requesterName, isExternal, ctaUrl }` — UN event PAR destinataire (capitaine + manager + coach de l'équipe) ; le bot en fait un DM (`scrim-dm.js`) |
| `scrim.request.dispatched`        | `utils/scrimRequestNotify.ts` — une fois les DM partis, pour le salon d'actions du bot                                            | `{ kind, demandeId, teamName, opponentName, dateLabel, slots[], recipients: [{ discordUserId, role }] }` — le message porte les 3 boutons de décision, utilisables par un admin si personne ne répond |
| `scrim.request.resolved`          | `utils/teams/scrimRequestActions.ts` (cœur partagé) — décision prise, que ce soit depuis Discord OU depuis le site               | `{ demandeId, outcome: 'accepted' \| 'rejected' \| 'countered' \| 'reported', teamName, byStaff, actorName, agreedSlot?, slots? }`                                                                     |
| `scrim.planning.opened`           | `pages/api/admin/scrim-plannings/index.ts` (POST) — grille de dispos ouverte entre 2 équipes                                      | `{ planningId, title, game, status, team1, team2, horizonStart, horizonDays }`                                                                 |
| `scrim.planning.validated`        | `pages/api/admin/scrim-plannings/[planningId]/validate.ts` — créneau validé → scrim créé                                          | `{ planningId, validatedSlot, scrimId, team1, team2 }` (le `scrim.scheduled` du scrim créé est émis en parallèle)                              |
| `scrim.planning.reminder`         | `emitScrimPlanningEvent('scrim.planning.reminder', ...)` — relance : dispos encore manquantes                                     | `{ planningId, title, game, status, team1, team2, horizonStart, horizonDays }` (fanout push/email : staff + capitaines/managers des 2 équipes) |
| `event_segment.transitioned`      | Admin `/api/admin/events/.../segments/.../{start,skip,end}.ts` (Lot 2 run-of-show)                                                | `{ runId, segmentId, fromStatus, toStatus, tenantId, broadcastMessage, segment: { ord, type, title, durationMin, matchId } }`                  |
| `task.created` (Kanban)           | `createTaskCore` — admin `POST /api/admin/tasks/tasks` OU bot `POST /api/bot/v1/tasks`                                            | `{ taskId, boardId, boardName, columnName, title, priority, assigneeStaffId?, assigneeDiscordUserId?, assigneeName?, actorLabel }`             |
| `task.moved` (Kanban)             | `moveTaskCore` — admin `PATCH .../tasks/{id}/move` OU bot `PATCH /api/bot/v1/tasks/{id}/move`                                     | `{ taskId, boardName, title, fromColumnName, toColumnName, isDone, assigneeDiscordUserId?, assigneeName?, actorLabel }`                        |
| `task.assigned` (Kanban)          | `assignTaskCore` — admin `PATCH .../tasks/{id}/assign` OU bot `PATCH /api/bot/v1/tasks/{id}/assign` (assigné non-null uniquement) | `{ taskId, boardName, title, assigneeStaffId, assigneeName, assigneeDiscordUserId?, actorLabel }`                                              |
| `task.board_changed` (Kanban)     | **Chaque** mutation d'un board — cores (`createTaskCore` / `moveTaskCore` / `assignTaskCore` / `restoreTaskCore`) **et** handlers admin (édition/soft-delete carte, POST/PATCH/DELETE colonne, PATCH board) | `{ boardId, boardName }` (`boardName` peut être `null`)                                                                                        |
| `task.due_soon` (Kanban)          | Cron `/api/cron/task-due-reminders` — carte due J-1, hors colonne terminale                                                       | `{ taskId, boardName, title, dueDate, columnName, priority, assigneeStaffId?, assigneeName?, assigneeDiscordUserId? }`                         |
| `task.digest` (Kanban)            | Cron `/api/cron/task-board-digest` — digest quotidien, **un event par tenant**                                                    | `{ boards: [{ boardId, boardName, total, overdue, dueToday, columns: [{ name, count }], overdueTasks, dueTodayTasks, topTasks }] }`             |

#### Kanban interne (`task.created` / `task.moved` / `task.assigned`)

Tableau de tâches interne **staff-only** (tables `task_boards` / `task_columns`
/ `tasks`, RLS default-deny — service_role uniquement). Ces trois events sont
émis par le **cœur partagé** [`utils/taskBoard.ts`](../utils/taskBoard.ts), donc
identiques que l'action vienne du back-office admin ou de la commande Discord
`/kanban`.

- `assigneeDiscordUserId` est résolu depuis `assignee_staff_id → staff.auth_user_id
→ user_discord_links.discord_user_id` ; absent si l'assigné n'a pas lié son
  Discord. `assigneeName` = `staff.display_name`.
- `actorLabel` = nom d'affichage de l'acteur (staff back-office ou staff Discord).
- `task.assigned` n'est **PAS** émis lors d'une désassignation (`assigneeStaffId
= null`) — seul un assigné non-null déclenche l'event.
- `task.moved` porte `isDone` = la colonne cible est-elle terminale (permet au bot
  d'annoncer « tâche terminée »).
- `task.board_changed` est un **signal de rafraîchissement** LÉGER de la vue « live »
  d'un board dans Discord, émis **en plus** des events spécifiques (`task.created` /
  `task.moved` / `task.assigned`…) à **chaque** mutation qui change le contenu d'un
  board : création/édition/déplacement/(dés)assignation/soft-delete/restauration
  d'une carte, création/édition/suppression d'une colonne, et rename/archivage du
  board lui-même. Payload minimal `{ boardId, boardName }` (`boardName` peut être
  `null` selon le point d'émission) : le bot n'a besoin que de savoir **quel** board
  rafraîchir, puis il refetch l'état complet via `GET /api/bot/v1/tasks/board-snapshot?boardId=`.
  Émis uniquement sur un changement réel (le no-op d'un move — même colonne/même
  position — ne l'émet pas). Non émis à la **création** d'un board (aucune vue live
  n'existe encore) ni à sa suppression (le board a disparu). Best-effort : un échec
  d'émission ne casse jamais la mutation.
- `task.due_soon` est émis par le **cron** [`/api/cron/task-due-reminders`](../pages/api/cron/task-due-reminders.ts)
  (Netlify scheduled function), **pas** par le cœur partagé : une passe quotidienne
  sélectionne les cartes dont `due_date = CURRENT_DATE + 1` (rappel J-1), non
  supprimées et **hors** colonne terminale (`is_done`), et émet un event par carte.
  Déduplication naturelle par la date (une notif/carte, le jour J-1) — pas
  d'estampille. `assigneeDiscordUserId` est résolu comme pour les autres events
  Kanban (absent si l'assigné n'a pas lié son Discord, ou si la carte n'a pas
  d'assigné). Auth cron : `Authorization: Bearer <CRON_SECRET>` **ou**
  `?secret=<CRON_SECRET>` ; réponse `{ processed, emitted }`.
- `task.digest` est émis par le **cron** [`/api/cron/task-board-digest`](../pages/api/cron/task-board-digest.ts)
  (Netlify scheduled function). Une passe quotidienne agrège, **par tenant**, l'état
  de tous ses boards **non archivés** : pour chaque board `total` (cartes vivantes),
  `columns: [{ name, count }]` (compte par colonne, ordre `position`), `overdue`
  (`due_date < CURRENT_DATE`, colonne non terminale, non supprimée) et `dueToday`
  (`due_date = CURRENT_DATE`, colonne non terminale). **UN** event `task.digest`
  par tenant (payload `{ boards: [...] }`), pas un event par board. Auth cron
  identique ; réponse `{ emitted, boards }` (`emitted` = nombre de tenants notifiés,
  `boards` = nombre total de boards agrégés).
- **Noms des cartes dans le digest** — les compteurs seuls ne disent pas *quoi*
  faire, donc chaque board porte en plus trois listes **nommées**, chacune de la
  forme `{ items: [{ taskId, title, columnName, priority, dueDate, assigneeName }],
  omitted }` :
  - `overdueTasks` — cartes en retard, **les plus anciennes d'abord** ;
  - `dueTodayTasks` — cartes dues aujourd'hui ;
  - `topTasks` — filet de sécurité : cartes actives triées par priorité
    décroissante, renseigné **uniquement** si le board n'a ni retard ni échéance
    du jour (sinon un board sans dates n'afficherait aucun nom).

  Chaque liste est plafonnée à **5** cartes (`DIGEST_TASKS_PER_LIST`) et `omitted`
  porte le reliquat : une troncature est toujours annoncée, jamais muette. Les
  cartes en colonne terminale ne sont jamais nommées. Les noms d'assignées sont
  résolus en **une** requête `staff` pour tout le tick (pas un appel par carte) ;
  un nom introuvable laisse `assigneeName: null` sans faire échouer le digest.

  Côté bot, `formatBoardFieldValue` (kanban-events.js) rend ces listes sous les
  compteurs, une ligne par carte (`• 🔶 Titre — Colonne · 31/08 · Assignée`), en
  coupant à la **ligne entière** pour rester sous la limite Discord de 1024
  caractères par field. Un payload « legacy » sans ces clés (event émis avant le
  déploiement, rattrapé par l'outbox) reste rendu comme avant.

**Garde WIP sur le déplacement** — `moveTaskCore` refuse un déplacement **vers une
autre colonne** dont la `wip_limit` est atteinte : si la colonne cible contient déjà
`>= wip_limit` cartes vivantes (la carte déplacée exclue du compte), l'appel renvoie
`409 { error, code: 'wip_exceeded', limit, current }` (`limit` = plafond de la
colonne, `current` = cartes déjà présentes). Vaut pour l'admin
(`PATCH /api/admin/tasks/tasks/{id}/move`) **et** le bot
(`PATCH /api/bot/v1/tasks/{id}/move`). Un **reorder dans la même colonne** n'est
jamais bloqué ; la **création** de carte (`createTaskCore`) n'est pas gardée (saisie
de backlog volontaire).

**Labels colorés (admin uniquement)** — catalogue de définitions de labels par board
(table `task_labels`, RLS default-deny, service_role). Le lien carte ↔ label est par
**NOM** : `tasks.labels[]` stocke les noms bruts, `task_labels` porte la couleur +
position de chaque nom ; un nom présent sur une carte sans définition retombe en
couleur neutre côté UI.

| Méthode + path                        | Corps                          | Réponse                                                                                                                                                                        |
| ------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/admin/tasks/labels`        | `{ boardId, name, color }`     | `201 { label: { id, name, color, position } }` (position=max+1) ; `409 { code:'label_exists' }` si (board,name) pris ; loggue `task_label_create`                              |
| `PATCH /api/admin/tasks/labels/{id}`  | `{ name?, color?, position? }` | `200 { label }` ; si `name` change → **cascade** le rename dans `tasks.labels[]` des cartes du board ; `409 { code:'label_exists' }` en collision ; loggue `task_label_update` |
| `DELETE /api/admin/tasks/labels/{id}` | —                              | `200 { success: true }` ; **ne strippe PAS** le nom des cartes (redevient neutre) ; loggue `task_label_delete`                                                                 |

Le détail board `GET /api/admin/tasks/boards/{id}` renvoie désormais
`labels: [{ id, name, color, position }]` (définitions du board, triées par position).

**Vue « Mes tâches » (admin)** — `GET /api/admin/tasks/my` : toutes les cartes
vivantes assignées au staff courant, **tous boards du tenant**, chacune enrichie de
`boardName` / `columnName` / `columnIsDone` / `dueDate`. Tri : `dueDate` asc (null en
dernier), puis priorité (urgent > high > medium > low). Réponse `{ tasks: [...] }`.

**Timeline d'activité de carte (admin)** — `GET /api/admin/tasks/tasks/{id}/activity` :
historique `staff_logs` de la carte, `created_at` DESC. Agrège les actions « carte »
(`entity_type='task'`, `entity_id=taskId`) **et** les actions « commentaire »
(rattachées via `payload.task_id`). Réponse
`{ activity: [{ action, actorName, createdAt, payload }] }` — action **brute** +
payload ; l'humanisation des libellés se fait côté UI.

**Corbeille (admin)** — cartes soft-deleted (`deleted_at IS NOT NULL`) et leur
restauration. Endpoints **admin uniquement**, `withStaffRoute('admin')` :

| Méthode + path                              | Corps / query                 | Réponse                                                                                                                                                                                                                                                 |
| ------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/admin/tasks/deleted`              | `?boardId=<uuid?>&limit=<n?>` | `{ tasks: [{ id, title, boardId, boardName, columnId, columnName, priority, dueDate, deletedAt }] }` — filtre `boardId` optionnel, tri `deletedAt` DESC, plafond défaut 100 (max 500). Montre TOUT, y compris cartes de boards archivés.                |
| `PATCH /api/admin/tasks/tasks/{id}/restore` | —                             | `200 { task: NormalizedTask }` — `deleted_at = NULL` + `position = max(position dans sa colonne)+1`. `404 { code:'task_not_found' }`, `409 { code:'not_deleted' }` (déjà active), `409 { code:'column_gone' }`. Loggue `task_restore`. Pas d'event bot. |

**Extras de carte (commentaires + checklist)** — endpoints **admin uniquement**
(pas d'exposition bot), `withStaffRoute('admin')`, tables `task_comments` /
`task_checklist_items` (RLS default-deny, service_role) :

| Méthode + path                               | Corps                            | Réponse                                                                   |
| -------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------- |
| `GET /api/admin/tasks/tasks/{id}/comments`   | —                                | `{ comments: [{ id, body, authorStaffId, authorName, createdAt }] }`      |
| `POST /api/admin/tasks/tasks/{id}/comments`  | `{ body }`                       | `201 { comment }` (auteur = staff courant ; loggue `task_comment_create`) |
| `DELETE /api/admin/tasks/comments/{id}`      | —                                | `200 { success: true }` (loggue `task_comment_delete`)                    |
| `GET /api/admin/tasks/tasks/{id}/checklist`  | —                                | `{ items: [{ id, label, isDone, position }] }` (triés par position)       |
| `POST /api/admin/tasks/tasks/{id}/checklist` | `{ label }`                      | `201 { item }` (position = max+1)                                         |
| `PATCH /api/admin/tasks/checklist/{id}`      | `{ label?, isDone?, position? }` | `200 { item }`                                                            |
| `DELETE /api/admin/tasks/checklist/{id}`     | —                                | `200 { success: true }`                                                   |

Le détail carte `GET /api/admin/tasks/tasks/{id}` inclut désormais `comments: [...]`
et `checklist: [...]` complets ; le détail board `GET /api/admin/tasks/boards/{id}`
expose par carte `checklist: { done, total }` et `commentCount`. La checklist n'est
**pas** auditée (toggle trop verbeux) — seuls les commentaires le sont.

**Endpoints bot** (tous exigent un acteur `actorDiscordUserId` **staff
admin/owner** via `requireBotStaff` — 403 sinon — **SAUF** `board-snapshot`, cf.
note ci-dessous) :

| Méthode + path                            | Corps / query                                                                                                           | Réponse                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `GET /api/bot/v1/tasks/boards`            | query `actorDiscordUserId`                                                                                              | `{ boards: [{ id, name }], count }`          |
| `GET /api/bot/v1/tasks/columns`           | query `actorDiscordUserId`, `boardId` (requis)                                                                          | `{ columns: [{ id, name, isDone }], count }` |
| `GET /api/bot/v1/tasks`                   | query `actorDiscordUserId`, `boardId?`, `columnId?`, `assignee=me?`, `q?`, `limit?`                                     | `{ tasks: [NormalizedTask], count }`         |
| `GET /api/bot/v1/tasks/board-snapshot`    | query `boardId` (requis, uuid) — **PAS d'acteur staff**                                                                 | `{ board: BoardSnapshot }` (voir ci-dessous) |
| `POST /api/bot/v1/tasks`                  | `{ actorDiscordUserId, boardId, columnId, title, description?, priority?, assigneeStaffId?, dueDate?, labels? }`        | `201 { task: NormalizedTask }`               |
| `PATCH /api/bot/v1/tasks/{id}/move`       | `{ actorDiscordUserId, columnId, position? }` (idempotent)                                                              | `{ task: NormalizedTask }`                   |
| `PATCH /api/bot/v1/tasks/{id}/assign`     | `{ actorDiscordUserId, assignSelf?:true \| assigneeDiscordUserId? \| assigneeStaffId?(null=désassigner) }` (idempotent) | `{ task: NormalizedTask }`                   |

`NormalizedTask` = `{ id, title, description, boardId, boardName, columnId,
columnName, priority, assigneeStaffId, assigneeName, dueDate, labels }`.
`assigneeDiscordUserId` non-staff sur `/assign` → `400 { code:'assignee_not_staff' }`.

**`GET /api/bot/v1/tasks/board-snapshot`** — état COMPLET d'un board pour la vue
« live » du bot, à rafraîchir sur réception d'un event `task.board_changed`.
**N'exige PAS d'acteur staff** (`requireBotStaff`) : le rendu live est déclenché
par un event, pas par une commande utilisateur. Lecture seule, scopée au tenant
de la clé bot (`req.botContext.tenantId`). Query `boardId` requis (uuid) validée
par `withBotRoute({ querySchema })` → `400 { code:'INVALID_QUERY' }` si absent /
invalide. `404 { code:'board_not_found' }` si le board n'existe pas dans le
tenant. Rate-limit dédié `bot-tasks-snapshot` (60/min). Réponse :

```json
{
  "board": {
    "id": "<uuid>",
    "name": "Association",
    "columns": [
      {
        "name": "À faire",
        "isDone": false,
        "cards": [
          {
            "title": "Réserver la salle",
            "priority": "high",
            "assigneeName": "Alice",
            "dueDate": "2026-08-01",
            "checklist": { "done": 1, "total": 3 },
            "labels": [
              { "name": "Logistique", "color": "#e11d48" },
              { "name": "Urgent", "color": null }
            ]
          }
        ]
      }
    ]
  }
}
```

Colonnes triées par `position` ; cartes non supprimées (`deleted_at IS NULL`)
triées par `position` ; `assigneeName` = `staff.display_name` (`null` si non
assignée) ; `checklist` = compteur `done`/`total` des `task_checklist_items` de
la carte ; `dueDate` = date ISO ou `null` ; `labels` = liste
`{ name, color }` des labels portés par la carte (`tasks.labels[]`, ordre
préservé), la couleur venant de `task_labels` (`color` = `null` si le nom n'a
pas de définition de label sur le board ; `[]` si la carte n'a aucun label).

#### `event_segment.transitioned` (Lot 2 run-of-show)

Emitted whenever a segment in an `event_runs` timeline changes lifecycle
state via the staff Director endpoints:

- `upcoming → live` (via `POST /api/admin/events/:runId/segments/:segId/start`)
- `upcoming → skipped` (via `POST /api/admin/events/:runId/segments/:segId/skip`)
- `live → done` (via `POST /api/admin/events/:runId/segments/:segId/end`)

Idempotent endpoints — if the transition is a no-op (segment already in the
target state) the event is **not** re-emitted, so the bot can safely treat
the event as "first time we see this transition for this segmentId".

**Timeline pre-fill** — `POST /api/admin/events/:runId/segments/from-tournament`
(staff `admin`) builds the match segments of a run in one shot from a
tournament's matches. Body `{ tournament_id }`. Matches are appended to the
queue (`MAX(ord)+1, …`) in broadcast order (stage `order_index` → `round_number`
→ `scheduled_at` → `created_at`), one `type='match'` segment each, title
`"<teamA> vs <teamB>"` (falls back to the match round label, then `Match <n>`).
Anti-duplication: a match already bound to a segment of the run is skipped.
Honors `Idempotency-Key`. Returns `200 { segments, created, skipped }`,
`404 { code: 'TOURNAMENT_NOT_FOUND' }` for a foreign/missing tournament, and
`409 { code: 'RUN_DONE' }` when the run is finished. This endpoint does **not**
emit a bot event (segments start upcoming; `event_segment.transitioned` fires
later on start/skip/end).

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
      "discordThreadId": "<snowflake|null>",
      "discordScheduledEventId": "<snowflake|null>",
      "discordDisputeThreadId": "<snowflake|null>",
      "discordMatchChannelId": "<snowflake|null>",
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

`enriched.discordMatchChannelId` (T4) provient de `enrichMatchEvent`
(`utils/matches/botEventEnrich.ts`) et reflete
`matches.discord_match_channel_id` (salon prive par match). Lecture
**defensive** : si la migration n'est pas appliquee, le champ vaut `null`
sans jamais faire echouer l'enrichissement ni l'event. Le bot s'en sert pour
l'idempotence (savoir si le salon existe deja avant d'en creer un).
`checkinUrl1/2` n'apparaissent que dans le payload `checkin.nudge`.

`enriched.preset` (presets de partie personnalisee) provient du meme
`enrichMatchEvent` et porte le preset **deja resolu** pour ce match
(`{ id, game, name, importCode, description, mapPool[], scope, tournamentId,
stageId }`), ou `null` si aucun preset n'est configure. `scope` vaut
`stage | tournament | tenant` selon le niveau qui a gagne la resolution.
Comme pour `discordMatchChannelId`, la lecture est **defensive** : table absente
ou requete en echec ⇒ `null`, jamais d'event match.* casse.

Le bot s'en sert pour afficher le code d'import dans l'embed de match
(`embed-helpers.js`). Pour un bloc complet **pret a poster**, il appelle
`GET /matches/:matchId/preset` qui renvoie `lines` (voir plus haut) — le champ
`enriched.preset` reste la version condensee, sans mise en forme.

Sur `match.scheduled`, le bot pousse en plus ce bloc dans les **salons textuels
des deux equipes** (`enriched.team{1,2}.discordChannelId`), avec dedup sur le
couple `(matchId, importCode)` : replanifier ne respamme pas, changer le code
re-notifie.

#### `registration.blacklisted` (Blacklist joueurs)

Emitted by `utils/moderation/blacklist.ts` (`alertIfBlacklisted`) when a
blacklisted player **registers or is registered** at one of the interception
points (no registration is ever blocked — alert only):

- `pages/api/auth/register.ts` — account creation (`context: 'register'`).
- `pages/api/teams/create-with-member.ts` — team creation (`context: 'team_create'`).
- `pages/api/teams/add-member.ts` — captain adding a member (`context: 'add_member'`).

The matcher (`checkBlacklist`) compares `battle_tag` / `discord_user_id`
(**strong** match) and `display_name` (**soft**, case-insensitive) against the
tenant's `active` blacklist rows. On any match a **single aggregated** event is
emitted (no spam if several rows match); `matchedOn` / `strength` / `reason`
reflect the strongest match, and `matches[]` carries every hit.

Payload :

```json
{
  "id": "<event uuid>",
  "event": "registration.blacklisted",
  "tenantId": "<uuid>",
  "timestamp": "2026-06-25T18:42:00.000Z",
  "data": {
    "context": "register",
    "matchedOn": "battle_tag",
    "strength": "strong",
    "reason": "Triche avérée — finale 2026",
    "matchCount": 1,
    "matches": [
      {
        "id": "<blacklist row uuid>",
        "matchedOn": "battle_tag",
        "strength": "strong",
        "reason": "Triche avérée — finale 2026"
      }
    ],
    "battleTag": "smurf#1234",
    "displayName": "ToxicPlayer",
    "discordUserId": "1300000000000000001"
  }
}
```

`context` is one of `register | team_create | add_member`. `matchedOn` is one
of `battle_tag | display_name | discord_user_id`; `strength` is `strong | soft`.
The identifier fields (`battleTag` / `displayName` / `discordUserId`) are only
present when supplied at the interception point. The bot posts an alert embed in
the configured `staff_log_channel_id` (battletag, criterion, strength, reason) —
it does **not** ban or kick automatically (human decision), and now records the
detection via `POST /api/bot/v1/moderation/blacklist-alert` so the alert is
persisted in `blacklist_alerts` (auditable from the admin dashboard). The
registration flow itself also persists a `source: 'registration'` row directly
(best-effort, never blocks the registration).

#### `registration.entity_blacklisted` (Blacklist entités)

Emitted by `utils/moderation/entityBlacklist.ts` (`alertIfEntityBlacklisted`)
when a submitted **team/org name** matches a banned entity in the tenant's
`entity_blacklist` table (no creation is ever blocked — alert only):

- `pages/api/teams/create-with-member.ts` — team creation (`context: 'team_create'`).

The matcher (`checkEntityBlacklist`) normalises names (trim + lowercase +
collapsed whitespace) and compares against the tenant's `active` rows: exact
equality is a **strong** match; containment in either direction (stored name of
at least 4 normalised chars) is **soft** — a banned org "XYZ Org" matches a
team "XYZ Org Blue" and vice versa. On any match a **single aggregated** event
is emitted; `entityType` / `matchedName` / `strength` / `reason` reflect the
strongest match, and `matches[]` carries every hit.

Payload :

```json
{
  "id": "<event uuid>",
  "event": "registration.entity_blacklisted",
  "tenantId": "<uuid>",
  "timestamp": "2026-07-23T18:42:00.000Z",
  "data": {
    "context": "team_create",
    "entityName": "XYZ Org Blue",
    "matchedOn": "name",
    "entityType": "org",
    "matchedName": "XYZ Org",
    "strength": "soft",
    "reason": "Structure bannie — impayés 2026",
    "matchCount": 1,
    "matches": [
      {
        "id": "<entity_blacklist row uuid>",
        "entityType": "org",
        "matchedName": "XYZ Org",
        "strength": "soft",
        "reason": "Structure bannie — impayés 2026"
      }
    ]
  }
}
```

`context` is currently always `team_create` (type is extensible). `entityType`
is `team | org`; `strength` is `strong | soft`. Unlike the player flow there is
**no** `blacklist_alerts` insert (that table is player-specific — NOT NULL
`discord_user_id`): the outbox event **is** the alert. The bot posts an alert
embed in the configured `staff_log_channel_id` — it does **not** delete or
rename the team automatically (human decision).

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
  requests keyed on the actor's Discord id with the regex `^[0-9]{15,25}$`.
  The field read defaults to `actorDiscordUserId` (staff convention, body for
  writes / query for reads); captain-facing routes (`/report`, `/checkin`)
  send the id under `discordUserId` and the limiter is configured to key on
  that field instead. Protects against one Discord user draining the global
  IP bucket.

  Routes with a per-actor cap (all `windowMs = 60 s`):

  | Route                                 | Cap / actor | Actor field          | Actor kind |
  | ------------------------------------- | ----------- | -------------------- | ---------- |
  | `matches/:matchId/forfeit`            | 5           | `actorDiscordUserId` | staff      |
  | `matches/:matchId/reset`              | 5           | `actorDiscordUserId` | staff      |
  | `matches/:matchId/resolve-dispute`    | 5           | `actorDiscordUserId` | staff      |
  | `matches/:matchId/veto` (POST/DELETE) | 5           | `actorDiscordUserId` | staff      |
  | `matches/:matchId/cast` (POST/DELETE) | 5           | `actorDiscordUserId` | staff      |
  | `matches/:matchId/report`             | 5           | `discordUserId`      | captain    |
  | `matches/:matchId/checkin`            | 10          | `discordUserId`      | captain    |
  | `matches/:matchId/evidence` (POST)    | 10          | `discordUserId`      | captain    |

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

Response paths (see handler for full logic). All are `200`; branch on
`status`:

- Single report stored, waiting on opponent (or lone report still inside the
  SLA silence window) → `{ "status": "awaiting_opponent", … }`
- Both reports agree → `applyMatchScore` runs →
  `{ "status": "finalized", "resolution": "agreed", "reason": null, … }`
- One side auto-wins on opponent silence past the SLA **+** attached evidence →
  `{ "status": "finalized", "resolution": "auto_resolved", "reason": "<why>", … }`
- Reports diverge, OR a unilateral report stays unconfirmed past the SLA with
  no evidence → match → `disputed` →
  `{ "status": "disputed", … }` (with a silence/disagreement reason stored)
- Captain re-reports and now agrees → dispute closes →
  `{ "status": "finalized", "resolution": "agreed", … }`

`resolution` (`agreed` | `auto_resolved`) and `reason` (string, only when
`auto_resolved`) are present on the `finalized` branch; both are absent/null on
the other branches. The auto-resolution path (silence + evidence) leans on the
`/matches/:matchId/evidence` endpoint above and the tenant dispute SLA.

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

### Moderation

| Route                                                                                | Methods         | Idem.  | Rate-key                   |
| ------------------------------------------------------------------------------------ | --------------- | ------ | -------------------------- |
| [`disputes.ts`](../pages/api/bot/v1/disputes.ts)                                     | GET             | —      | `bot-disputes`             |
| [`disputes/escalations.ts`](../pages/api/bot/v1/disputes/escalations.ts) (Lot 4)     | GET             | —      | `bot-disputes-escalations` |
| [`moderation/blacklist.ts`](../pages/api/bot/v1/moderation/blacklist.ts)             | GET/POST/DELETE | DELETE | `bot-moderation`           |
| [`moderation/blacklist-alert.ts`](../pages/api/bot/v1/moderation/blacklist-alert.ts) | POST            | yes    | `bot-moderation`           |
| [`staff-logs.ts`](../pages/api/bot/v1/staff-logs.ts)                                 | GET             | —      | `bot-staff-logs`           |

### Kanban interne (task board)

Staff-only (`requireBotStaff`) **sauf `board-snapshot`** (lecture seule pour la
vue live, sans acteur). Voir la section « Kanban interne » du catalogue d'events
pour les corps/réponses détaillés.

| Route                                                                     | Methods  | Idem. | Rate-key             |
| ------------------------------------------------------------------------- | -------- | ----- | -------------------- |
| [`tasks/index.ts`](../pages/api/bot/v1/tasks/index.ts)                    | GET/POST | —     | `bot-tasks`          |
| [`tasks/boards.ts`](../pages/api/bot/v1/tasks/boards.ts)                  | GET      | —     | `bot-tasks-boards`   |
| [`tasks/columns.ts`](../pages/api/bot/v1/tasks/columns.ts)                | GET      | —     | `bot-tasks-columns`  |
| [`tasks/board-snapshot.ts`](../pages/api/bot/v1/tasks/board-snapshot.ts)  | GET      | —     | `bot-tasks-snapshot` |
| [`tasks/[id]/move.ts`](../pages/api/bot/v1/tasks/[id]/move.ts)            | PATCH    | yes   | `bot-tasks-move`     |
| [`tasks/[id]/assign.ts`](../pages/api/bot/v1/tasks/[id]/assign.ts)        | PATCH    | yes   | `bot-tasks-assign`   |

#### `GET /api/bot/v1/disputes/escalations`

Liste enrichie des disputes en cours pour le board staff (slash
`/dispute board`). Quand `?breached=true`, ne retient que les rows
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

#### `GET/POST/DELETE /api/bot/v1/moderation/blacklist` (Blacklist joueurs)

Liste de modération des joueurs bannis (slash `/blacklist list|add|remove`).
La table `player_blacklist` est service-role only (RLS default-deny) ; tous les
accès sont scopés par tenant. Le bot lit la liste pour scanner les membres du
serveur Discord et alerter sur un pseudo / battletag / compte banni présent.
Voir [docs/BLACKLIST_DESIGN.md](BLACKLIST_DESIGN.md).

**Auth** : `x-api-key` + tenant via per-tenant key (`crossTenant: false`).
Les écritures (POST/DELETE) exigent en plus `actorDiscordUserId` lié à un staff
`admin`/`owner` (sinon `403`).

**Rate limit** : 30/min global + 10/min par acteur Discord (`bot-moderation`).

##### `GET` — liste les entrées actives

Renvoie uniquement les entrées `active = true` du tenant, triées
`created_at desc`.

**Response 200**

```json
{
  "blacklist": [
    {
      "id": "uuid",
      "battleTag": "smurf#1234",
      "displayName": "ToxicPlayer",
      "discordUserId": "1300000000000000001",
      "reason": "Triche avérée — finale 2026"
    }
  ]
}
```

`battleTag` est stocké/normalisé en lowercase. Chaque champ identifiant peut
être `null` (au moins un est non-null par construction).

**Query `?withAlerted=1`** — au (re)démarrage, le bot joint ce flag pour
récupérer aussi l'ensemble (distinct) des `discord_user_id` ayant **déjà fait
l'objet d'une alerte** de détection (table `blacklist_alerts`). Il s'en sert
pour amorcer son état « déjà alerté » et **ne pas rejouer** d'alerte après un
restart pour des membres déjà signalés ; seules les détections réellement
nouvelles déclenchent. La réponse ajoute alors :

```json
{
  "blacklist": [
    /* … */
  ],
  "alertedDiscordUserIds": ["1300000000000000001", "1300000000000000002"]
}
```

- Champ **absent** si `withAlerted` n'est pas passé (rétrocompatible).
- `alertedDiscordUserIds: null` si le lookup des alertes échoue côté site
  (dégradation gracieuse : le bot ne suppose pas un état vide).

##### `POST` — ajoute une entrée (`/blacklist add`)

**Body**

- `actorDiscordUserId` _(requis)_ — snowflake du staff auteur.
- `battleTag` _(optionnel)_ — normalisé lowercase à l'écriture.
- `displayName` _(optionnel)_ — pseudo.
- `discordUserId` _(optionnel)_ — snowflake banni.
- `reason` _(optionnel)_ — motif du ban.
- Au moins un de `battleTag` / `displayName` / `discordUserId` est requis
  (sinon `400 INVALID_BODY`).

`banned_by` reste `null` (l'acteur est un compte Discord, pas un `auth.users`) ;
l'auteur est tracé dans `notes` (`added via Discord by <actorDiscordUserId>`).
**Idempotency** : non (un ré-ajout crée une nouvelle row — n'envoie pas de
`Idempotency-Key`).

**Response 201**

```json
{
  "entry": {
    "id": "uuid",
    "battleTag": "smurf#1234",
    "displayName": null,
    "discordUserId": null,
    "reason": "Triche avérée"
  }
}
```

##### `DELETE` — désactive une entrée (`/blacklist remove`)

Soft-disable (`active = false`, conserve l'historique). Sélecteur prioritaire :
`id` > `discordUserId` > `battleTag`.

**Body**

- `actorDiscordUserId` _(requis)_ — staff auteur.
- `id` _(optionnel, uuid)_ **ou** `battleTag` _(optionnel)_ **ou**
  `discordUserId` _(optionnel)_ — au moins un sélecteur requis.

**Idempotency** : oui (`Idempotency-Key` honoré — un retry ne redésactive pas
deux fois).

**Response 200**

```json
{ "removed": 1 }
```

**Errors** : `400` (body invalide / pas de sélecteur), `401`, `403` (acteur
non staff), `404` (aucune entrée active correspondante), `500`.

#### `POST /api/bot/v1/moderation/blacklist-alert` (Persistance des détections)

Le bot rapporte ici une **détection** blacklist pour qu'elle soit persistée dans
la table `blacklist_alerts` (service-role only, RLS default-deny ; scope
`tenant_id`). Source : scan périodique des membres du serveur Discord
(`source: 'bot_scan'`) ou arrivée d'un nouveau membre (`source: 'bot_member_add'`).
La détection N'A PAS d'acteur staff (c'est le bot système qui rapporte) :
contrairement aux autres écritures de `moderation/blacklist`, **aucun
`actorDiscordUserId` n'est requis** et aucun rôle staff n'est vérifié. L'insert
ne ban ni ne kick personne (décision humaine) — il alimente le journal auditable
depuis le dashboard admin (`GET /api/admin/moderation/blacklist/alerts`).

**Auth** : `x-api-key` + tenant via per-tenant key (`crossTenant: false`).

**Rate limit** : 30/min global (`bot-moderation`).

**Idempotency** : oui (`Idempotency-Key` honoré — un retry réseau ne crée pas
deux rows).

**Body**

- `discordUserId` _(requis)_ — snowflake du membre détecté (`1..32`).
- `matchedOn` _(requis)_ — `battle_tag | display_name | discord_user_id` (le
  critère le plus fort si plusieurs matchent).
- `strength` _(requis)_ — `strong | soft`.
- `source` _(requis)_ — `bot_scan | bot_member_add`.
- `battleTag` _(optionnel, nullable)_ — battletag détecté.
- `displayName` _(optionnel, nullable)_ — pseudo détecté.
- `blacklistEntryId` _(optionnel, nullable, uuid)_ — entrée `player_blacklist`
  matchée.
- `reason` _(optionnel, nullable)_ — motif du ban (recopié de l'entrée).
- `criteria` _(optionnel, nullable)_ — liste complète des critères matchés :
  `[{ matchedOn, strength }]` (quand plusieurs critères matchent).
- `context` _(optionnel, nullable)_ — contexte libre côté bot.

**Response 201**

```json
{
  "alert": {
    "id": "uuid",
    "createdAt": "2026-06-29T18:42:00.000Z"
  }
}
```

**Errors** : `400` (body invalide), `401`, `500`.

#### `GET /api/admin/moderation/blacklist/alerts` (Lecture admin du journal)

Pendant admin (dashboard staff) du POST bot ci-dessus : liste paginée du journal
des alertes de détection pour le tenant courant. La table `blacklist_alerts` est
service-role only (RLS default-deny) → l'endpoint passe par `supabaseAdmin` et
scope explicitement par `tenant_id`. Lecture réservée au rôle `admin`.

**Auth** : session staff (`withStaffRoute(handler, 'admin')`).

**Rate limit** : 60/min (`admin-blacklist-alerts`).

**Query** — tous optionnels, validés par zod :

- `limit` _(1..200, défaut 50)_ — taille de page.
- `before` _(ISO timestamp)_ — curseur descendant sur `created_at`.
- `strength` _(`strong | soft`)_ — filtre force.
- `source` _(`bot_scan | bot_member_add | registration`)_ — filtre source (inclut
  les alertes émises par le flux d'inscription site).
- `discordUserId` _(string)_ — filtre par membre.

**Response 200**

```json
{
  "alerts": [
    {
      "id": "uuid",
      "createdAt": "2026-06-29T18:42:00.000Z",
      "discordUserId": "1234567890",
      "battleTag": null,
      "displayName": null,
      "matchedOn": "battle_tag",
      "strength": "strong",
      "source": "bot_scan",
      "context": null,
      "reason": null,
      "blacklistEntryId": "uuid"
    }
  ],
  "nextCursor": "2026-06-29T18:30:00.000Z"
}
```

**Errors** : `400` (query invalide), `401`, `403`, `500`.

#### `GET /api/admin/overview-summary` (KPI agrégés du hub admin)

Remplace les 5 appels parallèles que le hub `/admin` faisait (tournaments,
teams, demandes, support/tickets, disputes) par **un seul** endpoint. Chaque
valeur est un count-only (`head:true, count:'exact'`) exécuté en parallèle via
`Promise.allSettled` — aucune ligne chargée. Les comptes
`tournamentsActive / teams / demandesPending / disputesOpen` sont scopés au
tenant courant ; `supportOpen / supportHigh` sont **globaux** (table
`support_tickets` sans `tenant_id`, cf. note « Intentionally global tables »).

**Auth** : session staff (`withStaffRoute(handler, 'admin')`).

**Rate limit** : 60/min (`admin-overview-summary`).

**Dégradation** : si un count échoue, l'endpoint renvoie tout de même `200` et
met `null` pour CETTE clé (les autres restent valides). `null` (et non `0`)
distingue « inconnu / en échec » de « zéro ».

**Response 200**

```json
{
  "tournamentsActive": 1,
  "teams": 42,
  "demandesPending": 3,
  "supportOpen": 5,
  "supportHigh": 2,
  "disputesOpen": 0
}
```

| Clé                 | Définition                                                  | Scope      |
| ------------------- | ----------------------------------------------------------- | ---------- |
| `tournamentsActive` | tournois `status = 'running'`                               | tenant     |
| `teams`             | total équipes                                               | tenant     |
| `demandesPending`   | demandes `status = 'pending'`                               | tenant     |
| `supportOpen`       | tickets support `status = 'open'`                           | **global** |
| `supportHigh`       | tickets `severity = 'high'` AND status ∉ {resolved, closed} | **global** |
| `disputesOpen`      | matches `status = 'disputed'`                               | tenant     |

**Errors** : `401`, `403`, `405` (méthode ≠ GET), `500` (Supabase admin absent).

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

| Route                                                                              | Methods | Idem. | Rate-key                      | Tenant scope                                      |
| ---------------------------------------------------------------------------------- | ------- | ----- | ----------------------------- | ------------------------------------------------- |
| [`events/pending.ts`](../pages/api/bot/v1/events/pending.ts)                       | GET     | —     | `bot-events-pending`          | `crossTenant: true` — `tenantId` returned per row |
| [`events/handled.ts`](../pages/api/bot/v1/events/handled.ts)                       | POST    | no    | `bot-events-handled`          | per-tenant                                        |
| [`events/[id]/ack.ts`](../pages/api/bot/v1/events/[id]/ack.ts)                     | POST    | yes   | `bot-events-ack`              | `crossTenant: true` — PK globally unique          |
| [`reconcile/discord-orphans.ts`](../pages/api/bot/v1/reconcile/discord-orphans.ts) | GET     | —     | `bot-reconcile-orphans`       | per-tenant                                        |
| [`reconcile/team-channels.ts`](../pages/api/bot/v1/reconcile/team-channels.ts)     | GET     | —     | `bot-reconcile-team-channels` | per-tenant                                        |

#### `POST /api/bot/v1/team-channels/snapshot`

Le bot dépose l'état Discord **observé** pour un lot d'équipes : le rôle et les
deux salons existent-ils vraiment, et qui peut entrer.

Seul le bot voit le guild. Le site ne connaît que des ids stockés dans
`teams.discord_*`, qui peuvent parfaitement pointer sur un salon supprimé — et
c'est le cas qui intéresse le plus. Sans cette photo, l'écran
`/admin/discord/team-channels` afficherait des ids en se taisant sur leur
validité.

**Notes** :

- **Upsert par équipe**, pas de purge : le bot peut rafraîchir UNE équipe après
  une action sans reposter tout le guild.
- `access[].source` dit par quel chemin la personne entre — `role` (rôle
  d'équipe) ou `text` / `voice` (permission individuelle sur ce salon). La
  distinction n'est pas cosmétique : on retire au bon endroit, sinon on croit
  avoir sorti quelqu'un qui rentre encore par l'autre porte.
- `warnings[]` remonte ce que le bot n'a pas su faire (salon introuvable,
  permissions manquantes) — affiché tel quel dans l'admin.
- `captured_at` est posé côté site : une photo sans date induit en erreur plus
  qu'elle n'informe.

Déclenché par l'événement `team.channels.snapshot.request` (bouton « Rafraîchir »
de l'admin) et après chaque action, pour que l'écran reflète le résultat.

---

#### `GET /api/bot/v1/reconcile/team-channels`

Cron quotidien de réconciliation Discord côté bot. Retourne les **équipes
ACTIVES** du tenant (`is_active = true` ET `deleted_at IS NULL`) avec leurs IDs
Discord (rôle, salon texte, salon vocal), l'ID Discord du capitaine, et pour
chaque équipe la liste de ses membres résolus vers leur ID Discord. Le bot
itère pour vérifier/reposer les rôles d'équipe, permissions de salon, etc.

**Query** : `limit` (défaut 200, max 500), `offset` (défaut 0) — même clamping
que `discord-orphans`.

**Notes** :

- Les membres **sans lien Discord** (aucune row `user_discord_links`) sont
  **omis** — le bot ne peut pas agir sur eux. `user_discord_links` est GLOBAL
  (pas de colonne `tenant_id`) : la résolution ne filtre pas par tenant.
- `isCaptain` = (`member.user_id === team.captain_id`). `isSubstitute` vient de
  `team_members.is_substitute`. Les membres sont dédupliqués par `discordUserId`.
- `captainDiscordUserId` = l'ID Discord du capitaine s'il est lié, sinon `null`.
- **Scoping** : équipes **inscrites au tournoi de l'année en cours** (via
  `tournament_teams`) **OU** dont l'inscription à ce tournoi est **en attente**
  (`demandes` type `team_registration`, statut `pending`). Une candidature
  déposée est déjà une équipe du tournoi : l'exclure la laisserait sans
  entretien ni réparation de salons. Aucun tournoi de l'année → `teams: []`.
- `knownChannelIds` = ids de salons Discord de **TOUTES les équipes actives** du
  tenant, inscrites ou non, **non paginé**. C'est un ensemble de RÉFÉRENCE, pas
  une page de travail : `teams` (scopé) répond « à qui provisionner ? »,
  `knownChannelIds` répond « quels salons sont légitimes ? ». Ne jamais déduire
  le second du premier — un cron l'a fait et a détruit les salons d'une équipe
  active dont l'inscription était encore en attente. `null` si la lecture a
  échoué : le consommateur doit alors s'abstenir, pas conclure « rien n'est
  connu ».
- `count` = nombre d'équipes retournées sur cette page.
- `tournamentInProgress` = `true` s'il existe un tournoi du tenant au statut
  `running`. Le cron bot **saute alors entièrement le run** (aucune création /
  suppression de salon ni changement de permission pendant un tournoi en cours).

```json
{
  "tournamentInProgress": false,
  "knownChannelIds": ["456", "789", "654", "987"],
  "teams": [
    {
      "teamId": "uuid",
      "name": "Alpha",
      "slug": "alpha",
      "discordRoleId": "123",
      "discordChannelId": "456",
      "discordVoiceChannelId": "789",
      "captainDiscordUserId": "111",
      "members": [
        { "discordUserId": "111", "isCaptain": true, "isSubstitute": false }
      ]
    }
  ],
  "limit": 200,
  "offset": 0,
  "count": 12
}
```

**Errors** : `401` (clé invalide), `500` (erreur DB). **Rate limit** : 30/min
global, bucket `bot-reconcile-team-channels`. **Idempotency** : non.

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
| [`matches/[matchId]/evidence.ts`](../pages/api/bot/v1/matches/[matchId]/evidence.ts)               | GET, POST         | yes   | `bot-match-evidence`        |
| [`matches/[matchId]/forfeit.ts`](../pages/api/bot/v1/matches/[matchId]/forfeit.ts)                 | POST              | yes   | `bot-match-forfeit`         |
| [`matches/[matchId]/report.ts`](../pages/api/bot/v1/matches/[matchId]/report.ts)                   | POST              | yes   | `bot-match-report`          |
| [`matches/[matchId]/preset.ts`](../pages/api/bot/v1/matches/[matchId]/preset.ts)                   | GET               | —     | `bot-match-preset`          |
| [`matches/[matchId]/reset.ts`](../pages/api/bot/v1/matches/[matchId]/reset.ts)                     | POST              | yes   | `bot-match-reset`           |
| [`matches/[matchId]/resolve-dispute.ts`](../pages/api/bot/v1/matches/[matchId]/resolve-dispute.ts) | POST              | yes   | `bot-match-resolve-dispute` |
| [`matches/[matchId]/veto.ts`](../pages/api/bot/v1/matches/[matchId]/veto.ts)                       | GET, POST, DELETE | yes   | `bot-match-veto`            |

#### `PATCH /api/bot/v1/matches/:matchId/discord`

Writeback bot → site des IDs Discord natifs lies a un match, pour assurer
l'idempotence des handlers d'event suivants (ne pas recreer un objet dont on
a deja l'ID). **Auth** : `x-api-key` uniquement (bot service account, pas
d'`actorDiscordUserId`).

**Body** — toutes les cles sont optionnelles ; chacune accepte un snowflake
valide **ou** `null` (pour vider la colonne). Cle absente = champ non touche.

| Cle body                  | Colonne DB                      |
| ------------------------- | ------------------------------- |
| `discordThreadId`         | `discord_thread_id`             |
| `discordScheduledEventId` | `discord_scheduled_event_id`    |
| `discordDisputeThreadId`  | `discord_dispute_thread_id`     |
| `discordMatchChannelId`   | `discord_match_channel_id` (T4) |

`discordMatchChannelId` (T4 — salon prive par match via overwrite de role
d'equipe) est ajoute par une **migration separee**. Degradation gracieuse :
si la colonne n'est pas encore appliquee, un PATCH qui **touche ce champ**
renvoie `503 { code: "CHANNEL_COLUMN_MISSING" }` (jamais un 500 opaque) ; les
PATCH des 3 champs historiques ne dependent jamais de cette colonne.

**Errors** : `400` (matchId invalide, snowflake invalide, body vide), `401`,
`404` (match introuvable), `503` (`CHANNEL_COLUMN_MISSING`).
**Rate limit** : 60/min global (`bot-match-discord`). **Idempotency** : oui.

#### `GET /api/bot/v1/matches/:matchId/preset`

Preset de **partie personnalisee** applicable a un match : le code d'import que
l'hote colle dans le jeu (Partie perso > Parametres > Importer).

**Pourquoi cet endpoint existe** : aucun titre qu'on opere — Overwatch en tete —
n'expose d'API pour CREER ou LANCER un lobby. L'hote configure tout a la main.
Le seul artefact automatisable est ce code d'import, qui restaure d'un coup
regles, cartes et heros interdits. C'est le pendant « lancement de partie » de
ce que `matches.lobby_code` fait pour la *jonction* au lobby.

**Auth** : `x-api-key` + `x-tenant-id`. **Pas** d'`actorDiscordUserId` : c'est
une lecture, et l'hote d'un match est souvent une capitaine, pas du staff.
Le code n'est jamais expose par l'API publique (`/api/public/*`).

**Resolution du perimetre** — faite **cote site** (`utils/customGamePresets.ts`),
le bot n'en duplique aucune regle. Le plus specifique gagne :

1. `stage` — meme `tournament_id` **et** meme `stage_id`
2. `tournament` — meme `tournament_id`
3. `tenant` — defaut du tenant pour ce jeu

Un preset de phase ne fuit jamais sur une phase voisine : sans repli de rang
inferieur, la reponse est `preset: null`. Le jeu vient de `tournaments.game`
(defaut `overwatch` pour les scrims, qui n'ont pas de tournoi).

**Reponse `200`**

```json
{
  "matchId": "4e8c…",
  "tournamentId": "22…",
  "stageId": "44…",
  "game": "overwatch",
  "preset": {
    "id": "aa…",
    "game": "overwatch",
    "name": "OWWC – Phase finale Bo5",
    "importCode": "A1B2C3",
    "description": "Heros interdits : …",
    "mapPool": ["Ilios", "Busan"],
    "scope": "stage",
    "tournamentId": "22…",
    "stageId": "44…"
  },
  "lines": [
    "🎮 Preset partie perso : **OWWC – Phase finale Bo5**",
    "📋 Code d'import : `A1B2C3`",
    "🗺️ Cartes : Ilios · Busan",
    "_Dans le jeu : Partie perso > Parametres > Importer > colle le code._"
  ]
}
```

`preset: null` **et** `lines: []` est un cas **nominal** (aucun preset configure
pour ce perimetre) — pas une erreur. Le bot doit rester silencieux dans ce cas
plutot que d'annoncer une absence.

`lines` porte la mise en forme **prete a poster** : le thread de match, la
notification aux salons d'equipe et `/preset` affichent ainsi exactement le meme
bloc, sans duplication de rendu cote bot.

**Errors** : `400` (matchId invalide), `401`, `404` (match introuvable dans ce
tenant). **Rate limit** : 60/min (`bot-match-preset`). **Idempotency** : n/a (GET).

**Cote bot** : `api-client.getMatchPreset()`, consomme par
[`preset-command.js`](../../docker-box/services/discord-bot/preset-command.js)
(`/preset`), [`match-thread.js`](../../docker-box/services/discord-bot/match-thread.js)
(message epingle a la creation du thread) et
[`match-preset-notify.js`](../../docker-box/services/discord-bot/match-preset-notify.js)
(push dans les salons des deux equipes sur `match.scheduled`).

**Admin** : les presets se gerent sur `/admin/custom-game-presets`
(`GET|POST /api/admin/custom-game-presets`,
`PATCH|DELETE /api/admin/custom-game-presets/:presetId`), table
`custom_game_presets`, un seul preset par perimetre (index unique
`uq_custom_game_presets_scope`).

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

#### `POST /api/bot/v1/matches/:matchId/evidence`

Feature « Intégrité des résultats & anti-triche » (slice 1). Un capitaine
attache une preuve à un de ses matches depuis Discord : capture d'écran,
fichier replay, ou lien externe (VOD / replay hébergé). Le binaire est validé
(taille + magic bytes + extension allowlistée), haché (sha256), uploadé dans le
bucket **privé** `match-evidence` via le service role ; puis une row
`match_evidence` est insérée avec `team_side` = camp du capitaine appelant.

**Auth** : `x-api-key` + `discordUserId` (body) doit être capitaine d'une des
deux équipes (résolu via `user_discord_links` → `teams.captain_id`, même
convention que `/report`). Pas de gate Régie+.

**Body** — union discriminée sur `kind` ; `discordUserId` toujours requis.
Limite de corps **15 Mo** (`bodyParser.sizeLimit`).

| `kind`        | Champs                                              |
| ------------- | --------------------------------------------------- |
| `screenshot`  | `discordUserId`, `file_base64`, `filename`, `note?` |
| `replay_file` | `discordUserId`, `file_base64`, `filename`, `note?` |
| `replay_url`  | `discordUserId`, `external_url`, `note?`            |

`file_base64` = contenu binaire encodé base64. `note` = string 1–1000.

**Response 201**

```json
{ "id": "uuid", "kind": "screenshot" }
```

**Errors** : `400` (`INVALID_BODY`, base64 invalide, magic bytes / extension
non allowlistés, match incomplet), `401`, `403` (non capitaine), `404` (match
introuvable), `429`, `500` (échec upload / insert).
**Rate limit** : global `bot-match-evidence` 40/min par IP + **10/min par
acteur** (`discordUserId`). **Idempotency** : oui (`Idempotency-Key`, 2xx
cachés).

#### `GET /api/bot/v1/matches/:matchId/evidence`

Vue _capitaine_ des preuves attachées à un match. Chaque preuve binaire est
accompagnée d'une **URL signée courte-durée (~10 min)** — jamais le chemin de
stockage brut ; les liens externes exposent `externalUrl`.

**Auth** : `x-api-key` + `actorDiscordUserId` (query) capitaine.

**Query** : `actorDiscordUserId` (requis).

**Response 200**

```json
{
  "matchId": "uuid",
  "evidence": [
    {
      "id": "uuid",
      "teamSide": 1,
      "kind": "screenshot",
      "externalUrl": null,
      "signedUrl": "https://…/object/sign/…?token=…",
      "mimeType": "image/png",
      "sizeBytes": 184213,
      "sha256": "a1b2…",
      "note": "map 2 scoreboard",
      "createdAt": "2026-07-13T20:00:00.000Z"
    }
  ]
}
```

`teamSide` est `1 | 2 | null` (null = preuve neutre staff). `signedUrl` est
null pour `replay_url` (voir `externalUrl`), et `externalUrl` est null pour les
binaires.

**Errors** : `400` (`actorDiscordUserId` manquant), `403` (non capitaine),
`404` (match introuvable). **Rate limit** : `bot-match-evidence` 40/min global.
**Idempotency** : non (GET).

#### `GET /api/admin/matches/:matchId/evidence` (staff)

Vue arbitrage staff de toutes les preuves d'un match, avec URLs signées
courte-durée (~10 min) pour les binaires **et** l'identité du soumetteur.
C'est ce que consomme l'UI d'arbitrage admin.

**Auth** : session staff Supabase, rôle **`admin`** minimum
(`withStaffRoute(handler, 'admin')`).

**Response 200** — même item que le GET bot, plus deux champs :

```json
{
  "matchId": "uuid",
  "evidence": [
    {
      "id": "uuid",
      "teamSide": null,
      "kind": "replay_url",
      "externalUrl": "https://vod.example/…",
      "signedUrl": null,
      "mimeType": null,
      "sizeBytes": null,
      "sha256": null,
      "note": null,
      "submittedByDiscordUserId": null,
      "submittedByAuthUserId": "uuid",
      "createdAt": "2026-07-13T20:05:00.000Z"
    }
  ]
}
```

**Errors** : `400` (matchId invalide), `401`, `403` (rôle insuffisant),
`404` (match introuvable), `500`.

#### `POST /api/admin/matches/:matchId/evidence` (staff)

Le staff attache une preuve **neutre** (`team_side = null`) pendant
l'arbitrage. Mêmes mécaniques d'upload / validation que le POST bot. Journalise
l'action staff `attach_match_evidence` (dans `staff_logs`).

**Auth** : session staff Supabase, rôle **`admin`** minimum.

**Body** — même union discriminée que le POST bot **sans** `discordUserId`.
Limite de corps **15 Mo**.

| `kind`        | Champs                             |
| ------------- | ---------------------------------- |
| `screenshot`  | `file_base64`, `filename`, `note?` |
| `replay_file` | `file_base64`, `filename`, `note?` |
| `replay_url`  | `external_url`, `note?`            |

**Response 201**

```json
{ "id": "uuid", "kind": "replay_url" }
```

**Errors** : `400` (body invalide, base64 / magic bytes / extension),
`401`, `403` (rôle insuffisant), `404` (match introuvable), `500`.

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

> **Manager multi-equipes (2026-08-20).** Un compte au role d'equipe `manager`
> peut appartenir a PLUSIEURS equipes (index unique partiel, cf.
> `MANAGER_MULTI_EQUIPES.md`). Les routes `.../team` et `.../next-match`
> continuent d'en renvoyer **une seule** — contrat inchange : l'appartenance qui
> « prend » le compte (tout sauf `manager`), a defaut la plus ancienne. Avant ce
> choix explicite, la lecture ligne unique tombait en `PGRST116` (500) sur ces
> comptes.

#### `GET /api/bot/v1/players/by-discord/:discordUserId/actions-todo`

Liste agregee des "actions a faire" pour une joueuse (commande Discord
`/moi actions` et hub DM T-30). Vue derivee de l'etat DB courant (matches en
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
de sa liste `/moi actions`. Upsert sur `player_action_snoozes` (PK
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
| [`role-sync/presence.ts`](../pages/api/bot/v1/role-sync/presence.ts) | POST    | yes   | `bot-role-sync-presence` |

#### `GET /role-sync/snapshot`

Etat complet « qui doit avoir quel role Discord » pour le tenant. Reponse
`{ generatedAt, count, users: SnapshotUser[] }` :

```json
{
  "authUserId": "…",
  "discordUserId": "236889…",
  "discordUsername": "_amissa_",
  "teams": [
    {
      "id": "…",
      "name": "LVN ASHES",
      "discordRoleId": "1542211…",
      "isCaptain": false,
      "isSubstitute": false,
      "role": "manager"
    },
    { "id": "…", "name": "LVN EMBERS", "discordRoleId": "1543351…", "role": "manager" }
  ],
  "team": { "…": "appartenance principale (compat descendante)" },
  "staffRole": "admin"
}
```

- **`teams[]` porte TOUTES les appartenances** — un compte peut en avoir
  plusieurs : l'index unique `(tenant_id, user_id)` est PARTIEL et exempte le
  role `manager`, donc une manager peut encadrer deux equipes. Le bot attend
  alors les DEUX roles d'equipe simultanement
  (`services/discord-bot/role-sync.js`, `teamsOf()`), et les etiquettes
  transverses (Capitaine / Manager / Remplacante) valent des UNE equipe.
  N'en servir qu'une faisait retirer le role de l'autre a chaque cycle.
- **`team`** reste servi : c'est l'appartenance principale (cf.
  `utils/teams/memberships.ts#pickMembership`), lue en repli par un bot pas
  encore deploye. Elle fait toujours partie de `teams[]`.

Les memes champs sont pousses dans le payload des events `team.member.added` /
`team.member.removed` / `team.captain.changed` / `staff.role.changed` (cf.
`utils/botRoleSync.ts`), scopes au tenant de l'event.

**Rate limit** : 12/min, bucket `bot-role-sync-snapshot`.

#### `POST /role-sync/presence`

Le bot rapporte QUI est effectivement sur le serveur Discord (le site ne sait
que si un compte est LIE). Alimente le badge « a quitte le Discord » de
l'espace equipe.

```json
{
  "members": [{ "discordUserId": "1027928…", "inGuild": true }],
  "mode": "replace"
}
```

- `mode: "replace"` (defaut, champ optionnel) — **fin de cycle role-sync**. Le
  bot vient de parcourir tous les comptes lies : sa vue est complete, le site
  purge le tenant et reecrit le constat. Un bot d'une version anterieure, qui
  n'envoie pas le champ, garde donc son comportement historique.
- `mode: "upsert"` — **evenement ponctuel** (`GuildMemberAdd` /
  `GuildMemberRemove`). Seules les lignes envoyees sont ecrites ; aucune purge.
  A utiliser des que le bot ne rapporte qu'une partie du roster, sinon le full
  replace efface tout le tenant sur la foi d'un membre.

Reponse 200 : `{ count, present, absent, mode }`.
**Rate limit** : 120/min, bucket `bot-role-sync-presence` (le mode `upsert`
ajoute un POST par arrivee/depart, en plus du POST par cycle).

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

#### Broadcast console & auto-director (Lot 7 — Production broadcast automatisée)

The broadcast console operates on the SINGLE live `event_run` of the tenant
(`status='live'`). Overlay state lives in the freeform `event_runs.broadcast_state`
JSONB (no dedicated columns) and is normalised on read. Shape (v1):

```json
{
  "v": 1,
  "on_air": false,
  "lower_third": null,
  "pip": { "enabled": false },
  "scene": "starting",
  "auto_director": true,
  "scene_updated_at": null
}
```

`scene` ∈ `starting | match | pause | results | end | custom`. Absent fields are
backfilled on read (`scene`→`starting`, `auto_director`→`true`, `on_air`→`false`,
`pip.enabled`→`false`). `scene` and `auto_director` were added by Lot 7 and only
extend the JSONB — no migration.

**Auto-director reactor.** When `auto_director` is `true` (default), the reactor
auto-switches `scene` on match status changes: `ongoing`→`match`,
`finished`/`walkover`→`results`, `disputed`→`pause` (where wired). Setting
`auto_director=false` freezes the scene for a manual operator override; the
reactor becomes a no-op.

**Overlay renderer.** `GET /api/overlay/{runId}` (below) is the chrome-less OBS
browser-source feed. The overlay page subscribes to `event_runs.broadcast_state`
via Supabase Realtime, so scene/lower-third/PiP changes render live without
polling; the JSON endpoint is the cacheable fallback.

##### `GET /api/admin/broadcast/state` (staff, `caster`+)

Aggregate live state: `{ run, currentSegment, match, casters, state, generatedAt }`
where `state` is the v1 broadcast_state above. Read-only for `caster`.
**Errors** : `401`, `403`. **Rate limit** : staff. **Idempotency** : non (GET).

##### `POST /api/admin/broadcast/state` (staff, `admin`+)

Partial patch of `broadcast_state` on the live run. Body (all optional, ≥1
required): `on_air: boolean`, `lower_third: string|null` (≤500), `pip: { enabled }`,
`scene: <scene enum>`, `auto_director: boolean`. `caster` is `403` (read-only).
Returns the refreshed aggregate state and emits `broadcast.state_changed`.
**Errors** : `400` (validation / empty patch), `401`, `403` (caster),
`409 { code: 'NO_LIVE_RUN' }`. **Idempotency** : oui (`Idempotency-Key`).

##### `POST /api/admin/broadcast/next-match` (staff, `admin`+)

One-click advance to the next match. No request body. Resolves the live run + its
current live segment, finds the next `type='match'` `upcoming` segment by `ord`
(skipping breaks/intros/outros), and performs the atomic single-live-segment swap
(same code path as `segments/{segId}/start`). Resets the overlay scene to
`starting` (best-effort) so the auto-director flips it to `match` when the new
match goes ongoing. Emits `event_segment.transitioned`.

**Response 200** : `{ segment: { …event_segment… }, alreadyStarted: boolean, runId }`.
**Errors** : `401`, `403`, `404` (target segment vanished), `405`,
`409 { code }` where `code` ∈ `NO_LIVE_RUN | NO_CURRENT_SEGMENT | NO_NEXT_MATCH | SEGMENT_NOT_UPCOMING`.
**Rate limit** : `admin-broadcast-next-match` (30/min). **Idempotency** : oui.

##### `GET /api/overlay/{runId}` (PUBLIC — no auth)

OBS browser-source overlay feed for a run. `Cache-Control: s-maxage=5,
stale-while-revalidate`, CORS-friendly, no auth. Never exposes staff-only fields
(`auto_director`, casters, stream URLs, checklists, broadcast messages).

**Response 200**

```json
{
  "scene": "match",
  "onAir": true,
  "lowerThird": null,
  "pip": { "enabled": false },
  "match": {
    "team1": { "name": "Chaos Theory", "logoUrl": "https://…", "score": 1 },
    "team2": { "name": "Phoenix Rising", "logoUrl": "https://…", "score": 0 },
    "format": "bo3",
    "status": "ongoing"
  },
  "sponsors": [
    { "name": "Acme", "logoUrl": "https://…", "websiteUrl": "https://…" }
  ]
}
```

When the run is unknown or not live, a safe empty-ish shape is returned with a
`200` (`scene: "starting"`, `match: null`, `onAir: false`, sponsors still
included) so the browser source never errors mid-broadcast. A malformed `runId`
→ `400`. **Rate limit** : `overlay` (120/min). **Idempotency** : non (GET).

#### Twitch broadcaster actions (régie — écriture sur la chaîne)

Socle OAuth « broadcaster » + Predictions. L'app token (`client_credentials`,
read-only) ne suffit pas pour écrire sur la chaîne : on stocke un token OAuth du
broadcaster (access + refresh) **chiffré au repos** (AES-256-GCM,
[`utils/crypto.ts`](../utils/crypto.ts)) dans `twitch_broadcaster_connections`
(1 row par tenant, RLS default-deny, `supabaseAdmin` only — voir
[migration](../database/migrations/create_twitch_broadcaster_connections.sql)).
Les tokens ne sont **jamais** renvoyés à un client ni placés dans une URL. Toute
la logique vit dans [`utils/twitchBroadcaster.ts`](../utils/twitchBroadcaster.ts).
Feature dormante (503) sans `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` +
`TWITCH_REDIRECT_URI` + `TWITCH_TOKEN_ENC_KEY`.

Scopes demandés au consentement (union, pour éviter un re-consentement futur ;
V1 n'utilise que `channel:manage:predictions`) : `channel:manage:predictions`,
`clips:edit`, `user:write:chat`, `channel:manage:redemptions`,
`channel:read:redemptions`, `moderator:manage:banned_users`,
`moderator:manage:chat_messages`, `moderator:manage:chat_settings`.

##### `GET /api/admin/twitch/connect` (staff, `admin`+)

Démarre le flux OAuth. Signe un state (`tenantId + userId + nonce + returnTo`,
HMAC, TTL 10 min), pose un cookie httpOnly `tw_bc_oauth_state` (double-submit
CSRF) et renvoie `{ url }` (l'authorize Twitch, `force_verify=true`). L'UI ouvre
cette URL. **Errors** : `401`, `403`, `503 { code: 'TWITCH_NOT_CONFIGURED' }`.

##### `GET /api/twitch/broadcaster-callback?code&state` (PUBLIC — state signé)

Callback OAuth. Pas de session cookie : la confiance vient du state signé +
cookie nonce. Vérifie le state (signature + TTL + nonce), échange le code, lit
l'identité (`GET helix/users`), UPSERT la connexion (tokens chiffrés), puis
**redirige 302** vers `returnTo` avec `?twitch=connected` ou `?twitch=error`.
Jamais de token dans l'URL ; toute erreur est loggée serveur sans secret.
**Errors** : `503` (dormant). Sinon 302 (statut porté par le query param).

##### `GET /api/admin/twitch/connection` (staff, `caster`+)

Statut de la connexion : `{ connected: boolean, broadcaster_login?, scope?,
expires_at? }`. **Ne renvoie jamais les tokens** (même chiffrés). **Errors** :
`401`, `403`. **Idempotency** : non (GET).

##### `DELETE /api/admin/twitch/connection` (staff, `admin`+)

Déconnecte la chaîne (supprime la row). Renvoie `{ connected: false }`.
**Errors** : `401`, `403`.

##### `POST /api/admin/twitch/predictions` (staff, `admin`+)

Crée une prediction. Body zod : `title` (1..45), `outcomes` (`string[]`, 2..10,
chaque 1..25), `prediction_window` (int, 30..1800). Passe par
`getValidBroadcasterToken` (refresh proactif si expiré, marge 60 s) puis
`POST helix/predictions`. **Response 201** : `{ prediction }`. **Errors** :
`400 { code: 'INVALID_PAYLOAD' }`, `401`, `403 { code: 'MISSING_SCOPE' }`
(scope `channel:manage:predictions` absent), `409 { code: 'NOT_CONNECTED' }`
(aucune chaîne connectée), `502 { code: 'TWITCH_HELIX_ERROR' | 'TWITCH_TOKEN_ERROR' }`.

##### `GET /api/admin/twitch/predictions` (staff, `admin`+)

Renvoie la prediction la plus récente : `{ prediction: <la plus récente|null> }`
(`GET helix/predictions?first=1`). **Errors** : `401`, `403`,
`409 { code: 'NOT_CONNECTED' }`, `502`.

##### `PATCH /api/admin/twitch/predictions/{id}` (staff, `admin`+)

Verrouille / résout / annule. Body zod : `status` ∈ `LOCKED | RESOLVED |
CANCELED`, `winning_outcome_id?` (**requis** si `RESOLVED`). `PATCH
helix/predictions`. **Response 200** : `{ prediction }`. **Errors** :
`400 { code: 'INVALID_PAYLOAD' }` (dont RESOLVED sans `winning_outcome_id`),
`401`, `403 { code: 'MISSING_SCOPE' }`, `409 { code: 'NOT_CONNECTED' }`, `502`.

##### `POST /api/admin/twitch/chat` (staff, `admin`+)

Envoie un message dans le chat de la chaîne. Body zod : `message` (1..500).
`POST helix/chat/messages` avec `{ broadcaster_id, sender_id: broadcasterId,
message }`. Scope requis : **`user:write:chat`**. **Response 200** :
`{ result }`. **Errors** : `400 { code: 'INVALID_PAYLOAD' }`, `401`,
`403 { code: 'MISSING_SCOPE' }`, `409 { code: 'NOT_CONNECTED' }`, `502`.

##### `POST /api/admin/twitch/moderation/ban` (staff, `admin`+)

Ban permanent ou timeout d'un utilisateur. Body zod : `login` (1..25),
`duration?` (int, 1..1209600 s ; absent = ban permanent), `reason?` (0..500).
Résout d'abord `login → user_id` via `GET helix/users?login=` (**`400 { code:
'USER_NOT_FOUND' }`** si introuvable), puis `POST
helix/moderation/bans?broadcaster_id=&moderator_id=<broadcasterId>` avec
`{ data: { user_id, duration?, reason? } }`. Scope requis :
**`moderator:manage:banned_users`**. **Response 200** : `{ result }`.
**Errors** : `400 { code: 'INVALID_PAYLOAD' | 'USER_NOT_FOUND' }`, `401`,
`403 { code: 'MISSING_SCOPE' }`, `409 { code: 'NOT_CONNECTED' }`, `502`.

##### `POST /api/admin/twitch/moderation/clear` (staff, `admin`+)

Vide le chat de la chaîne. Pas de body. `DELETE
helix/moderation/chat?broadcaster_id=&moderator_id=<broadcasterId>`. Scope
requis : **`moderator:manage:chat_messages`**. **Response 200** :
`{ cleared: true }`. **Errors** : `401`, `403 { code: 'MISSING_SCOPE' }`,
`409 { code: 'NOT_CONNECTED' }`, `502`.

##### `PATCH /api/admin/twitch/moderation/chat-settings` (staff, `admin`+)

Met à jour les réglages de chat. Body zod (tous optionnels, **au moins un
requis**) : `emote_mode?`, `subscriber_mode?`, `follower_mode?`,
`follower_mode_duration?` (int), `slow_mode?`, `slow_mode_wait_time?` (int).
`PATCH helix/chat/settings?broadcaster_id=&moderator_id=<broadcasterId>`. Scope
requis : **`moderator:manage:chat_settings`**. **Response 200** :
`{ settings }`. **Errors** : `400 { code: 'INVALID_PAYLOAD' }`, `401`,
`403 { code: 'MISSING_SCOPE' }`, `409 { code: 'NOT_CONNECTED' }`, `502`.

##### `GET /api/admin/twitch/channel-points/rewards` (staff, `admin`+)

Liste les rewards de points de chaîne **gérables**. `GET
helix/channel_points/custom_rewards?broadcaster_id=&only_manageable_rewards=true`.
Scope requis : **`channel:read:redemptions`**. **Response 200** :
`{ rewards: [] }`. **Errors** : `401`, `403 { code: 'MISSING_SCOPE' }`,
`409 { code: 'NOT_CONNECTED' }`, `502`.

> ⚠️ **Caveat points de chaîne** : l'API Helix ne permet de gérer (lister
> demandes, FULFILLED/CANCELED, éditer, supprimer) que les rewards **créés par
> NOTRE `client_id`** (`only_manageable_rewards`). Les rewards créés par le
> streamer lui-même ou d'autres apps ne sont ni listables ni gérables via ces
> endpoints (Helix renvoie alors `400`/`403`, remonté proprement).

##### `POST /api/admin/twitch/channel-points/rewards` (staff, `admin`+)

Crée un reward de points de chaîne. Body zod : `title` (`string` 1..45),
`cost` (`int` ≥ 1), `prompt?` (`string` 0..200), `is_enabled?` (`bool`, défaut
`true`), `is_user_input_required?` (`bool`), `background_color?` (hex
`#RRGGBB`), `should_redemptions_skip_request_queue?` (`bool`). `POST
helix/channel_points/custom_rewards?broadcaster_id=`. Scope requis :
**`channel:manage:redemptions`**. **Response 200** : `{ reward }`. **Errors** :
`400 { code: 'INVALID_PAYLOAD' | 'TWITCH_HELIX_BAD_REQUEST' }`, `401`,
`403 { code: 'MISSING_SCOPE' }`, `409 { code: 'NOT_CONNECTED' }`, `502`.

##### `PATCH /api/admin/twitch/channel-points/rewards/{id}` (staff, `admin`+)

Met à jour un reward (≥1 champ). Body zod : `is_enabled?`, `is_paused?`,
`title?` (1..45), `cost?` (`int` ≥ 1), `prompt?` (0..200). `PATCH
helix/channel_points/custom_rewards?broadcaster_id=&id=`. Scope requis :
**`channel:manage:redemptions`**. `400` si l'id manque. **Response 200** :
`{ reward }`. **Errors** : `400 { code: 'INVALID_PAYLOAD' |
'TWITCH_HELIX_BAD_REQUEST' }`, `401`, `403 { code: 'MISSING_SCOPE' |
'TWITCH_HELIX_FORBIDDEN' }`, `409 { code: 'NOT_CONNECTED' }`, `502`.

##### `DELETE /api/admin/twitch/channel-points/rewards/{id}` (staff, `admin`+)

Supprime un reward. `DELETE
helix/channel_points/custom_rewards?broadcaster_id=&id=`. Scope requis :
**`channel:manage:redemptions`**. `400` si l'id manque. **Response 200** :
`{ ok: true }`. **Errors** : `400 { code: 'INVALID_PAYLOAD' |
'TWITCH_HELIX_BAD_REQUEST' }`, `401`, `403 { code: 'MISSING_SCOPE' |
'TWITCH_HELIX_FORBIDDEN' }`, `409 { code: 'NOT_CONNECTED' }`, `502`.

> Seuls les rewards créés par notre `client_id` sont éditables/supprimables ;
> Helix renvoie `400`/`403` sinon, remonté tel quel
> (`TWITCH_HELIX_BAD_REQUEST` / `TWITCH_HELIX_FORBIDDEN`).

##### `GET /api/admin/twitch/channel-points/redemptions` (staff, `admin`+)

Liste les demandes (redemptions) d'un reward. Query zod : `reward_id` (requis),
`status?` ∈ `UNFULFILLED | FULFILLED | CANCELED` (défaut `UNFULFILLED`). `GET
helix/channel_points/custom_rewards/redemptions`. Scope requis :
**`channel:read:redemptions`**. **Response 200** : `{ redemptions: [] }`.
**Errors** : `400 { code: 'INVALID_PAYLOAD' }`, `401`,
`403 { code: 'MISSING_SCOPE' }`, `409 { code: 'NOT_CONNECTED' }`, `502`.

##### `PATCH /api/admin/twitch/channel-points/redemptions` (staff, `admin`+)

Résout (FULFILLED) ou refuse (CANCELED) un lot de demandes. Body zod :
`reward_id`, `redemption_ids` (`string[]`, 1..50), `status` ∈ `FULFILLED |
CANCELED`. `PATCH
helix/.../redemptions?broadcaster_id=&reward_id=&id=<...>&id=<...>`. Scope
requis : **`channel:manage:redemptions`**. **Response 200** :
`{ redemptions: [] }`. **Errors** : `400 { code: 'INVALID_PAYLOAD' }`, `401`,
`403 { code: 'MISSING_SCOPE' }`, `409 { code: 'NOT_CONNECTED' }`, `502`.

##### `POST /api/admin/twitch/clip` (staff, `admin`+)

Capture un clip (~30 dernières secondes). Pas de body. `POST
helix/clips?broadcaster_id=<broadcasterId>`. Scope requis : **`clips:edit`**.
**Response 200** : `{ id, edit_url }`. **Errors** : `401`,
`403 { code: 'MISSING_SCOPE' }`, `409 { code: 'NOT_CONNECTED' }`, `502`.

##### `POST /api/admin/twitch/marker` (staff, `admin`+)

Pose un stream marker sur le live en cours (repère un temps fort pour le montage
du VOD). Body zod : `description?` (`string` 0..140). `POST
helix/streams/markers` avec `{ user_id: broadcasterId, description? }`. Scope
requis : **`channel:manage:broadcast`**. **Response 200** : `{ marker }`.
Helix renvoie `404` si la chaîne n'est **pas en live** → mappé en
`409 { code: 'NOT_LIVE' }`. **Errors** : `400 { code: 'INVALID_PAYLOAD' }`,
`401`, `403 { code: 'MISSING_SCOPE' }`, `409 { code: 'NOT_CONNECTED' | 'NOT_LIVE' }`,
`502`.

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
          "name": "tournoi creer",
          "signature": "/tournoi creer nom:<str> [statut] [debut] …",
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

> **Effet de bord — `POST /api/bot/v1/scrims`** : si `team1_id` ET `team2_id`
> sont fournis (même en statut `draft`), un email best-effort est envoyé aux
> capitaines des deux équipes (`kind=scheduled`). Fire-and-forget : un échec
> email ne modifie jamais la réponse `201`.

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
    "news_ingest_channel_id": null,
    "scrims_announce_channel_id": null,
    "captain_role_id": null,
    "substitute_role_id": null,
    "staff_role_owner_id": null,
    "staff_role_admin_id": null,
    "staff_role_caster_id": null,
    "teams_voice_category_id": null,
    "disputes_forum_tag_open_id": null,
    "disputes_forum_tag_pending_id": null,
    "disputes_forum_tag_resolved_id": null,
    "welcome_enabled": false,
    "welcome_channel_id": null,
    "welcome_message": null,
    "welcome_dm_message": null,
    "extras": {}
  }
}
```

Si aucune row n'existe dans `tenant_discord_config` pour ce guild, toutes les
colonnes config retournent `null` / `{}` (defauts). Le bot doit alors
appliquer son fallback env vars sur les valeurs `null` (mode V1 progressif).

> **Breaking change** (2026-05-21) : l'ancien tableau `staff_role_ids:
string[]` est remplace par des colonnes typees
> (`staff_role_owner_id`, `staff_role_admin_id`,
> `staff_role_caster_id`), chacune un snowflake Discord nullable. La colonne
> SQL `staff_role_ids` est droppee. Cote bot, lire ces cles dans
> `discord_config` et choisir le role correspondant a la hierarchie
> staff (`owner > admin > caster`).
>
> **Suivi (2026-07-19)** : le role staff `admin` est supprime ; la colonne
> `staff_role_manager_id` est droppee et n'est plus exposee dans
> `discord_config`.

> **Accueil des nouveaux arrivants** (2026-07-01) : `discord_config` expose
> 4 nouvelles cles pour l'onboarding par serveur :
>
> - `welcome_enabled` (boolean, defaut `false`) — active/desactive l'accueil.
> - `welcome_channel_id` (snowflake nullable) — salon ou poster le message.
> - `welcome_message` (string nullable) — gabarit du message in-channel.
> - `welcome_dm_message` (string nullable) — gabarit du DM optionnel.
>
> Le bot n'accueille que si `welcome_enabled === true`. Il poste dans
> `welcome_channel_id` si celui-ci ET `welcome_message` sont non-null, et DM
> le nouvel arrivant si `welcome_dm_message` est non-null. Ces valeurs sont
> editees cote site via `PUT /api/admin/tenants/:id/discord-config/:guildId`.

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
        "staff_role_caster_id": null,
        "welcome_enabled": false,
        "welcome_channel_id": null,
        "welcome_message": null,
        "welcome_dm_message": null,
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

### Free players

| Route                                                              | Methods | Idem. | Rate-key                |
| ------------------------------------------------------------------ | ------- | ----- | ----------------------- |
| [`free-players/sync.ts`](../pages/api/bot/v1/free-players/sync.ts) | POST    | yes   | `bot-free-players-sync` |

#### `POST /api/bot/v1/free-players/sync`

Full-replace, **par tenant**, des « joueuses libres » de provenance Discord —
les membres portant le rôle « Recherche une équipe ». Le bot lit ce rôle côté
Discord et pousse la liste complète ; le site remplace la portion Discord de la
table `free_players` du tenant par la liste reçue :

- chaque joueuse présente est upsertée (insert/update de `discord_username` +
  `auth_user_id` + `updated_at` ; `marked_at` préservé si elle était déjà là),
- les rows **`source='discord'`** du tenant absentes du payload sont supprimées
  (le membre a perdu le rôle côté Discord),

> ⚠ **Portée du full-replace.** Depuis le lot 1 d'acquisition, `free_players`
> contient aussi des inscriptions faites depuis le site
> (`source = 'web'`, formulaire public `/rejoindre`, sans compte). Elles
> n'appartiennent pas au bot : la purge est filtrée sur `source = 'discord'` et
> ne doit JAMAIS les toucher. Le bot n'a aucune visibilité sur ces rows et n'a
> rien à en faire — c'est purement une garantie côté site.

- pour chaque joueur, `auth_user_id` est résolu via `user_discord_links` sur
  `discord_user_id` (`null` si le compte Discord n'est pas lié au site).

Auth : `x-api-key` (tenant-scopé). Le tenant est déterminé par la clé.

Body :

```json
{
  "players": [
    {
      "discordUserId": "1234567890123456789",
      "discordUsername": "Pseudo",
      "displayName": "Pseudo affiché"
    }
  ]
}
```

- `discordUserId` (requis) : snowflake Discord.
- `discordUsername` (optionnel) : pseudo Discord persisté.
- `displayName` (optionnel) : utilisé en repli si `discordUsername` est absent.

Réponse `200` :

```json
{
  "count": 12,
  "linked": 9,
  "unlinked": 3,
  "unlinkedDiscordIds": [
    "1234567890123456789",
    "9876543210987654321",
    "5555555555555555555"
  ]
}
```

- `count` : nombre de joueurs libres après synchronisation.
- `linked` : joueurs dont le compte Discord est lié au site (`auth_user_id` non null).
- `unlinked` : joueurs sans compte site lié.
- `unlinkedDiscordIds` : les `discordUserId` du set reçu sans compte site lié
  (sous-ensemble du payload, `unlinked` = `unlinkedDiscordIds.length`). Le bot
  s'en sert pour n'afficher le CTA « lance `/inscription` pour être recrutable »
  qu'aux joueuses non liées.

```bash
curl -sS -X POST https://site.example/api/bot/v1/free-players/sync \
  -H "x-api-key: $BOT_API_KEY" \
  -H "content-type: application/json" \
  -H "Idempotency-Key: free-players-sync-2026-06-28T00:00:00Z" \
  -d '{
    "players": [
      { "discordUserId": "1234567890123456789", "discordUsername": "Alice" },
      { "discordUserId": "9876543210987654321", "discordUsername": "Bob" }
    ]
  }'
```

> Les surfaces côté site qui consomment ces données (liste capitaine
> `GET /api/teams/free-players`, invitation `POST /api/teams/invite-free-player`)
> ne sont **pas** des endpoints bot — elles sont authentifiées par session
> joueur (Bearer) et ne figurent donc pas dans ce contrat.

#### Event `free_player.registered` (site → bot, via outbox/webhook)

Émis quand une joueuse **se signale depuis le site** (`POST /api/public/free-players`,
formulaire `/rejoindre`). Sert à annoncer la nouvelle venue dans le salon de
recrutement : sans ça, l'inscription attend passivement qu'une capitaine vienne
la lire.

Payload :

```json
{
  "displayName": "Nova",
  "roles": ["tank", "support"],
  "level": "gold",
  "availability": "en semaine après 20h"
}
```

- `roles` : sous-ensemble ordonné de `tank | dps | support | flex`.
- `level` : `unknown` quand la joueuse ne l'a pas renseigné (cas fréquent et
  assumé — il n'y a aucun rang minimum pour participer).
- `availability` : texte libre, `null` si non renseigné.

> **Aucune donnée de contact dans cet event** — ni email, ni pseudo Discord. Le
> bot annonce, il ne distribue pas de carnet d'adresses ; la prise de contact
> passe par une capitaine authentifiée sur le site.

### Tickets

| Route                                                              | Methods | Idem. | Rate-key                |
| ------------------------------------------------------------------ | ------- | ----- | ----------------------- |
| [`tickets/close-log.ts`](../pages/api/bot/v1/tickets/close-log.ts) | POST    | —     | `bot-tickets-close-log` |

#### `POST /api/bot/v1/tickets/close-log`

Le bot Discord possède un système de tickets. À la **fermeture** d'un ticket, il
pousse ici un enregistrement d'audit ; le site l'archive dans `staff_logs`
(action `ticket_closed`, visible dans `/admin/logs`) avec `via: 'discord_bot'`.

Le Discord id de la personne qui ferme (`closedByDiscordId`) est résolu vers son
compte site via `user_discord_links` (table **globale** — pas de scope tenant).
L'`auth_user_id` lié devient le `staff_id` de la row de log. **Si le compte
Discord n'est pas lié au site, aucune row n'est écrite** (l'audit n'a pas
d'acteur staff identifiable).

Auth : `x-api-key` (tenant-scopé). Le tenant est déterminé par la clé.

Body :

```json
{
  "closedByDiscordId": "1234567890123456789",
  "number": 42,
  "category": "support",
  "openerDiscordId": "9876543210987654321",
  "claimedByDiscordId": "5555555555555555555",
  "messageCount": 17,
  "channelName": "ticket-0042"
}
```

- `closedByDiscordId` (requis) : snowflake de la personne qui ferme le ticket.
- `number` (requis) : numéro du ticket (entier ≥ 0). Devient `entity_id` du log.
- `category` (requis) : catégorie du ticket (1–100 car.).
- `openerDiscordId` (requis) : snowflake de l'ouvreur du ticket.
- `claimedByDiscordId` (optionnel, nullable) : snowflake du staff ayant pris le
  ticket.
- `messageCount` (optionnel, nullable) : nombre de messages dans le ticket.
- `channelName` (optionnel, nullable) : nom du salon du ticket (1–200 car.).

Tout sauf `closedByDiscordId`/`number` est repris tel quel dans le `payload` du
log (`category`, `openerDiscordId`, `claimedByDiscordId`, `messageCount`,
`channelName`), aux côtés de `via: 'discord_bot'`.

Réponse `200` :

```json
{ "logged": true }
```

- `logged` : `true` si une row `staff_logs` a été écrite (closer lié au site),
  `false` si le closer n'est pas lié (aucune row écrite). L'écriture du log ne
  fait jamais échouer la requête — un échec d'insertion est swallow côté site et
  renvoie quand même `logged: true` (best-effort audit).

```bash
curl -sS -X POST https://site.example/api/bot/v1/tickets/close-log \
  -H "x-api-key: $BOT_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "closedByDiscordId": "1234567890123456789",
    "number": 42,
    "category": "support",
    "openerDiscordId": "9876543210987654321"
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

> `POST teams/leave` : nouveau `409 TEAM_AMBIGUOUS` quand l'appelant encadre
> plusieurs equipes. La commande `/equipe quitter` ne porte pas d'equipe, et
> quitter est destructeur — le bot renvoie vers l'espace du site, ou le
> selecteur d'equipe rend le choix explicite (`?teamId=` sur
> `/api/teams/leave`).
| [`teams/messages.ts`](../pages/api/bot/v1/teams/messages.ts)                                   | POST       | yes   | `bot-team-messages`         |

#### `PATCH /api/bot/v1/teams/:teamId/discord`

Writeback bot → site des IDs Discord natifs d'une equipe, pose par le
provisioning `team-voice.js` (event `team.created`) pour assurer l'idempotence
des runs suivants. **Auth** : `x-api-key` + `actorDiscordUserId` (staff
admin/owner ; le bot agit via `DISCORD_BOT_ACTOR_ID`).

**Body** — toutes les cles sont optionnelles ; chacune accepte un snowflake
valide **ou** `null` (pour vider la colonne). Cle absente = champ non touche.

| Cle body                | Colonne DB                 | Objet Discord              |
| ----------------------- | -------------------------- | -------------------------- |
| `discordRoleId`         | `discord_role_id`          | Role d'equipe (mentions)   |
| `discordChannelId`      | `discord_channel_id`       | Salon TEXTE prive d'equipe |
| `discordVoiceChannelId` | `discord_voice_channel_id` | Salon VOCAL prive d'equipe |

**Rate limit** : 30/min (`bot-team-discord`). **Idempotency** : oui.

#### Events `team.created` / `team.dissolved` (site → bot, via outbox/webhook)

Le site n'appelle pas le bot directement : il emet ces events dans
`bot_event_outbox` (+ push HMAC optionnel). Le handler `team-voice.js` les
consomme.

**`team.created`** — payload : `{ teamId, name, slug, captainAuthUserId,
captainDiscordUserId, creatorAuthUserId, creatorDiscordUserId, creatorRole,
discordRoleId }` (`discordRoleId` est `null` a la creation ; il n'existe
qu'apres le writeback ci-dessus).

`creatorRole` vaut `'captain'` (flux historique : la creatrice joue et prend le
capitanat) ou `'manager'` — equipe creee depuis `/team/create` par une personne
qui l'encadre sans y jouer. En mode `manager`, `captainAuthUserId` /
`captainDiscordUserId` sont **`null`** : la capitaine designee n'est
qu'**invitee** tant qu'elle n'a pas accepte (`teams.captain_id` reste NULL), il
ne faut donc pas lui assigner le role d'equipe. Le bot assigne le role a
`creatorDiscordUserId` a la place. Le champ `set_captain` du payload
d'invitation lui donne le capitanat au moment ou elle accepte.

Le bot provisionne, de maniere **idempotente** :

1. **Role d'equipe** — scan de l'existant AVANT creation : reuse par
   `discordRoleId` (si deja writeback), sinon par **nom** (insensible a la
   casse). Si plusieurs roles portent ce nom (ambigu) → **aucune creation**,
   une demande de resolution manuelle est postee (voir plus bas). Sinon le role
   est cree et assigne a la capitaine (`captainDiscordUserId`).
2. **Salon vocal + salon texte** — parentes sous `teams_voice_category_id`
   (texte : `teams_text_category_id`, defaut = meme categorie). Overwrites :
   `@everyone` ferme (deny View/Connect), role d'equipe + roles staff ouverts.
3. **Writeback** des IDs role/texte/vocal via le PATCH ci-dessus.

**`team.dissolved`** — payload inclut `discordRoleId`, `discordChannelId`,
`discordVoiceChannelId` (enrichis depuis `teams`). Le bot **ne supprime plus
rien** : role et salons sont CONSERVES, et une demande de decision est postee
dans le salon de resolution. Les 3 colonnes restent renseignees — les vider
ferait passer des salons bien vivants pour des inconnus.

La politique « on ne supprime jamais un role automatiquement » existait deja
pour les roles ; elle couvre desormais les salons, apres qu'un cron a detruit
ceux d'une equipe vivante. Un salon Discord emporte son historique et rien ne le
rend : aucune heuristique ne merite ce pouvoir en autonomie. La suppression est
devenue une action admin explicite (voir ci-dessous).

#### Events de gestion des salons d'equipe (admin -> bot)

Emis par `/admin/discord/team-channels`, ou un humain clique. Ils remplacent le
cron `team-channel-reconcile`, supprime. Chaque evenement est UN geste nomme —
pas de « reconcilie », qui est le mot qui laisse la machine decider.

Tous portent `teams[]` (contexte Discord enrichi depuis `teams` : `teamId`,
`name`, `slug`, `discordRoleId`, `discordChannelId`, `discordVoiceChannelId`) et
`requestedByStaffId`. Le contexte voyage AVEC l'evenement plutot que d'etre
rappele au site : un aller-retour de moins, une occasion de moins de travailler
sur une vue perimee.

| Event | Effet cote bot |
| --- | --- |
| `team.channels.snapshot.request` | LECTURE seule : observe le guild et POST `/team-channels/snapshot`. |
| `team.channels.provision` | Cree ce qui manque (idempotent : reutilise role et salons vivants). |
| `team.channels.repair` | Repose les overwrites cibles sur les 2 salons. Ne cree rien. |
| `team.role.deleted` | Supprime le ROLE d'equipe et vide son mapping. Meme regle que les salons : jamais automatique, mais possible sur demande — sinon un role cree par erreur reste a vie. |
| `team.channel.deleted` | Supprime UN salon (`channel: text\|voice`) et vide son mapping. Seule suppression que le bot pratique encore, et elle vient d'un clic. |
| `team.channel.access.granted` / `.revoked` | Permission INDIVIDUELLE sur un salon (coach externe, casteuse invitee). Le revoke RETIRE l'overwrite au lieu de poser un `deny`, qui survivrait au role et bloquerait sans explication. |
| `team.role.granted` / `.revoked` | Role d'equipe : ouvre ou ferme les deux salons d'un coup. |

Chaque action rejoue une photo apres coup, pour que l'ecran reflete le resultat.

**Resolution manuelle** — tout conflit/probleme bloquant (perms bot
insuffisantes sur la categorie, role ambigu, hierarchie du role du bot trop
basse, echec de creation d'un salon, assignation capitaine impossible) est
poste dans un salon dedie (`TEAM_PROVISION_RESOLUTION_CHANNEL_ID` cote bot)
plutot que d'echouer en silence. Aucun retry auto, aucun re-throw vers
l'outbox.

#### `POST /api/bot/v1/teams/messages`

Envoi d'un message PERSONNALISE dans le salon textuel de chaque equipe inscrite
au tournoi (`teams.discord_channel_id`, provisionne par `team.created`).
**Auth** : `x-api-key` + `actorDiscordUserId` (staff admin/owner).

Le site est la source de verite : il lit l'etat reel du roster (titulaires,
remplacantes, comptes jamais connectes, BattleTags manquants), rend un message
par equipe (`utils/teamMessages.ts`), puis emet un event `team.message` par
equipe livrable. Le bot ne fait que poster.

**Body**

| Cle                  | Type                                        | Defaut            | Role                                        |
| -------------------- | ------------------------------------------- | ----------------- | ------------------------------------------- |
| `actorDiscordUserId` | snowflake                                   | —                 | staff admin/owner (requis)                  |
| `preset`             | `roster-reminder` \| `custom`               | `roster-reminder` | gabarit auto ou libre                       |
| `template`           | string (<= 4000)                            | —                 | requis si `preset=custom`                   |
| `teamIds`            | uuid[] (<= 200)                             | toutes            | restreint le ciblage                        |
| `only`               | `all` \| `incomplete` \| `needs_attention` | `all`             | filtre sur l'etat du roster                 |
| `mention`            | bool                                        | `false`           | ping le role d'equipe                       |
| `tournamentId`       | uuid                                        | tournoi en cours  | cible un autre tournoi                      |
| `dryRun`             | bool                                        | **`true`**        | `true` = apercu seul, rien n'est poste      |

Variables de gabarit (`preset=custom`) : `{equipe}`, `{tournoi}`,
`{titulaires}`, `{remplacantes}`, `{manquants}`, `{minimum}`,
`{sans_battletag}`, `{jamais_connectees}`, `{deadline}`, `{debut}`,
`{lien_equipe}`. Une variable inconnue est laissee VISIBLE dans le rendu
(jamais remplacee par du vide).

**Reponse** : `{ dryRun, tournament, messages[] }` en apercu ; en envoi reel
s'y ajoutent `sent`, `skipped` et `teams[]` (statut par equipe :
`sent` / `skipped_no_channel` / `error`). Une equipe sans salon provisionne est
comptee dans `skipped`, jamais droppee en silence.

**Rate limit** : 10/min (`bot-team-messages`), 3/min par acteur.
**Idempotency** : oui.

Cote docker-box, le script one-shot
`services/discord-bot/scripts/send-team-roster-reminder.js` appelle cet endpoint
(`--send` pour sortir du dry-run, `--mention`, `--only=`, `--teams=`,
`--template-file=`).

#### Event `team.message` (site → bot, via outbox/webhook)

Emis par `/api/admin/team-messages`, `/api/bot/v1/teams/messages` et le cron
`/api/cron/team-roster-reminders`. Consomme par `team-message.js`.

**Payload** : `{ teamId, teamName, channelId, roleId, content, mentionRole,
kind, source, tournamentId }`.

- `content` est **deja rendu** cote site (mention du role incluse si demandee).
- `mentionRole` autorise le ping : le bot passe
  `allowedMentions: { parse: [], roles: [roleId] }` si vrai, `{ parse: [] }`
  sinon — donc un `@everyone` glisse dans un gabarit admin reste inerte.
- `kind` : `incomplete` / `complete_with_warnings` / `complete` / `custom`.
- `source` : `admin` / `bot` / `cron`.
- Contenu tronque a 1900 caracteres cote site ET cote bot.

**Automatisation** — le cron `/api/cron/team-roster-reminders` (Netlify,
quotidien 09:00 UTC) n'envoie qu'aux jalons **J-21 / J-14 / J-7 / J-3 / J-1**
avant `site_settings.roster_lock_deadline` (fallback `tournaments.start_date`).
Le ciblage sur un jour exact tient lieu de deduplication (pas de table d'etat).
Par defaut seules les equipes avec un motif reel sont notifiees
(`only=needs_attention`).

#### Event `social.mirror` (site → bot, via outbox/webhook)

Consomme par `services/discord-bot/social-mirror.js`.

**Payload** : `{ source, channelId, content, url, postedAt }`.

`source` vaut `bluesky` ou `youtube`. Emis par le cron `/api/cron/social-mirror`.

- **Le salon est DANS le payload**, contrairement a tous les autres handlers qui
  resolvent leurs canaux eux-memes. Un miroir vise un salon choisi par qui le
  configure (`site_settings.bluesky_mirror_channel_id`) et il pourra y en avoir
  plusieurs ; un salon d'annonces ou de logs, lui, est unique par tenant.
- `allowedMentions: { parse: [] }` : un post public recopie ne doit pas pouvoir
  pinger le serveur.
- Le message se termine par le lien du post : Discord en tire une carte avec
  texte et image, donc le bot ne joint pas l'image lui-meme.
- Contenu tronque a 1900 caracteres cote site ET cote bot.

**Sens du flux.** `social.post` va de l'admin VERS les reseaux ; `social.mirror`
en REVIENT. Les deux coexistent, et un post compose dans l'admin qui part sur
Bluesky sera donc aussi recopie par le miroir dans son salon — un salon
different de `#annonces`, donc sans doublon visible au meme endroit.

#### Cible Instagram (site → Meta, sans passer par le bot)

Depuis `/api/admin/social-posts`, la cible `instagram` publie DIRECTEMENT via
l'API Meta — le bot n'est pas dans la boucle, contrairement a la cible Discord.

- **Aucune review Meta a passer** : on ne publie que sur NOTRE compte, l'app
  reste en mode developpement et `@womenscup_asso` y a le role
  « testeur Instagram ». La review n'est exigee que pour publier sur des comptes
  qu'on ne possede pas.
- Connexion : `GET /api/admin/instagram/authorize` → consentement Meta →
  `GET /api/admin/instagram/callback`. Jeton longue duree CHIFFRE dans
  `social_accounts`.
- Publication en TROIS temps, le deuxieme non optionnel : conteneur media →
  attente de `status_code = FINISHED` → `media_publish`. Publier un conteneur
  encore `IN_PROGRESS` echoue, et l'echec est intermittent (passe avec une
  petite image, casse avec une grande).
- **L'image doit rester en ligne apres l'appel** : Meta la telecharge de facon
  asynchrone. Une URL signee a duree courte donne un post sans visuel, sans
  aucune erreur cote serveur.
- Instagram REFUSE un post sans image : `requiresImage` dans le catalogue fait
  echouer la validation a l'apercu, pas en pleine publication.
- Le jeton meurt a ~60 jours et ne se rafraichit qu'avec un jeton encore
  valide : `/api/cron/social-token-refresh` (quotidien) s'y prend 10 jours a
  l'avance.

#### Event `social.post` (site → bot, via outbox/webhook)

Emis par `/api/admin/social-posts` (onglet « Reseaux » de
/admin/communications). Consomme par `services/discord-bot/social-post.js`.

**Payload** : `{ postId, platform, content, imageUrl }`.

- Le **salon n'est PAS dans le payload** : le bot le resout lui-meme via
  `tenant_discord_config.news_ingest_channel_id` (override d'env
  `SOCIAL_ANNOUNCE_CHANNEL_ID`), comme tous ses autres handlers.
- `allowedMentions: { parse: [] }` toujours : ni `@everyone` ni `@here` ne sont
  resolus, meme presents dans le texte. Une annonce composee dans un formulaire
  ne doit pas pouvoir pinger tout le serveur par accident.
- `imageUrl` est jointe en `files: [url]` si elle est en http(s). Discord
  rapatrie l'image au POST, contrairement a Meta qui la recupere plus tard.
- Contenu tronque a 1900 caracteres cote site ET cote bot.

**Sens du flux — a ne pas confondre avec `news-forwarder.js`.** Ce dernier fait
l'INVERSE : il surveille le meme salon et transforme chaque message en actualite
sur le site. Les deux coexistent sans boucle parce que `forwardMessage` ignore
les messages dont l'auteur est le bot lui-meme.

> **Ne jamais poster via un webhook Discord.** Un webhook porte un autre
> identifiant d'auteur : la garde anti-boucle ne s'y applique plus, le message
> est re-ingere, et chaque annonce cree une seconde actualite en doublon.

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

| Commande / interaction                                                                                                                           | Rôle    | Endpoint                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `/tournoi creer`                                                                                                                                 | admin   | `POST /api/bot/v1/tournaments`                                                                                                        |
| `/tournoi publier`                                                                                                                               | admin   | `POST /api/bot/v1/tournaments/:tournamentId/status`                                                                                   |
| `/tournoi cloner`                                                                                                                                | admin   | `POST /api/bot/v1/tournaments/:tournamentId/clone`                                                                                    |
| `/phase creer`                                                                                                                                   | admin   | `POST /api/bot/v1/tournaments/:tournamentId/stages`                                                                                   |
| `/phase bracket-vide`                                                                                                                            | admin   | `POST /api/bot/v1/tournaments/:tournamentId/matches`                                                                                  |
| `/tournoi liste`                                                                                                                                 | public  | `GET /api/bot/v1/tournaments`                                                                                                         |
| `/equipe creer`                                                                                                                                  | captain | `POST /api/bot/v1/teams`                                                                                                              |
| `/equipe modifier`                                                                                                                               | captain | `PATCH /api/bot/v1/teams/:teamId`                                                                                                     |
| `/modifier-equipe-admin`                                                                                                                         | admin   | `PATCH /api/bot/v1/teams/:teamId` _(body `actorIsStaff: true` → bypass capitaine)_                                                    |
| `/inscrire-equipe`                                                                                                                               | admin   | `POST /api/bot/v1/tournaments/:tournamentId/teams`                                                                                    |
| `/inscrire-membre`                                                                                                                               | admin   | `POST /api/bot/v1/register-user`                                                                                                      |
| `/inscription`                                                                                                                                   | player  | `POST /api/bot/v1/register-user`                                                                                                      |
| `/equipe inviter`                                                                                                                                | captain | `POST /api/bot/v1/teams/:teamId/invitations`                                                                                          |
| `/equipe annuler-invitation`                                                                                                                     | captain | `POST /api/bot/v1/invitations/:demandeId`                                                                                             |
| Bouton DM `invite:accept:<id>` / `invite:reject:<id>`                                                                                            | player  | `POST /api/bot/v1/invitations/:demandeId`                                                                                             |
| `/equipe quitter`                                                                                                                                | player  | `POST /api/bot/v1/teams/leave`                                                                                                        |
| `/equipe voir` / `/equipe membre` / `/equipe roster`                                                                                             | public  | `GET /api/bot/v1/teams/:teamId`                                                                                                       |
| `/cast liste`                                                                                                                                    | public  | `GET /api/bot/v1/cast/assignments`                                                                                                    |
| `/cast assigner`                                                                                                                                 | admin   | `POST /api/bot/v1/matches/:matchId/cast`                                                                                              |
| `/cast retirer`                                                                                                                                  | admin   | `DELETE /api/bot/v1/matches/:matchId/cast`                                                                                            |
| Job DM T-30 caster + bouton `cast:ack:<id>`                                                                                                      | caster  | `GET /api/bot/v1/cast/upcoming`, `POST /api/bot/v1/cast/:assignmentId/ack`                                                            |
| `/checkin` + bouton DM `checkin:<matchId>`                                                                                                       | captain | `POST /api/bot/v1/matches/:matchId/checkin`                                                                                           |
| `/preset`                                                                                                                                        | public  | `GET /api/bot/v1/matches/:matchId/preset`                                                                                             |
| Bouton DM `veto:<matchId>`                                                                                                                       | captain | `GET`/`POST`/`DELETE /api/bot/v1/matches/:matchId/veto`                                                                               |
| `/report-score` + bouton DM `report:<matchId>`                                                                                                   | captain | `POST /api/bot/v1/matches/:matchId/report`                                                                                            |
| `/match-meta`                                                                                                                                    | admin   | `PATCH /api/bot/v1/matches/:matchId`                                                                                                  |
| `/tournoi participants`                                                                                                                          | public  | `GET /api/bot/v1/tournaments/:tournamentId/teams`                                                                                     |
| `/tournoi bracket`                                                                                                                               | public  | `GET /api/bot/v1/tournaments/:tournamentId/bracket`                                                                                   |
| `/phase next-round`                                                                                                                              | admin   | `POST /api/bot/v1/stages/:stageId/next-round`                                                                                         |
| `/dispute liste`                                                                                                                                 | admin   | `GET /api/bot/v1/disputes`                                                                                                            |
| `/dispute board`                                                                                                                                 | admin   | `GET /api/bot/v1/disputes/escalations?breached=true`                                                                                  |
| `/dispute resoudre`                                                                                                                              | admin   | `POST /api/bot/v1/matches/:matchId/resolve-dispute`                                                                                   |
| `/forfait`                                                                                                                                       | admin   | `POST /api/bot/v1/matches/:matchId/forfeit`                                                                                           |
| `/reset-match`                                                                                                                                   | admin   | `POST /api/bot/v1/matches/:matchId/reset`                                                                                             |
| `/signalement`                                                                                                                                   | public  | _(pas d'endpoint — Discord-only, post staff channel)_                                                                                 |
| `/phase finaliser`                                                                                                                               | admin   | `POST /api/bot/v1/stages/:stageId/finalize`                                                                                           |
| `/phase auto-byes`                                                                                                                               | admin   | `POST /api/bot/v1/stages/:stageId/auto-byes`                                                                                          |
| `/equipe transferer-capitaine`                                                                                                                   | captain | `POST /api/bot/v1/teams/:teamId/transfer-captain`                                                                                     |
| `/equipe kicker`                                                                                                                                 | captain | `DELETE /api/bot/v1/teams/:teamId/members`                                                                                            |
| `/classement`                                                                                                                                    | public  | `GET /api/bot/v1/leaderboards/teams`                                                                                                  |
| `/sync-roles` / `/rs`                                                                                                                            | admin   | `GET /api/bot/v1/role-sync/snapshot`                                                                                                  |
| `/repost-news`                                                                                                                                   | admin   | _(pas d'endpoint — re-poste depuis l'état interne du bot)_                                                                            |
| `/lives`                                                                                                                                         | public  | `GET /api/bot/v1/twitch/live`                                                                                                         |
| `/logs`                                                                                                                                          | admin   | `GET /api/bot/v1/staff-logs`                                                                                                          |
| `/demandes`                                                                                                                                      | admin   | `GET /api/bot/v1/demandes`                                                                                                            |
| `/moi apercu` / `/moi prochain-match` / `/moi stats` / `/moi historique` / `/moi rappels` / `/moi invitations` / `/moi profil` / `/profil-admin` | player  | `GET/PATCH /api/bot/v1/players/by-discord/:discordUserId/*`                                                                           |
| `/moi actions` + bouton `snooze:<actionKey>`                                                                                                     | player  | `GET /api/bot/v1/players/by-discord/:discordUserId/actions-todo`, `POST /api/bot/v1/players/by-discord/:discordUserId/actions/snooze` |
| `/ma-dispute`                                                                                                                                    | captain | `GET /api/bot/v1/matches/:matchId/dispute`                                                                                            |
| `/scrim create / show / start / finish / score`                                                                                                  | admin   | `GET`/`POST`/`PATCH /api/bot/v1/scrims*`                                                                                              |
| Autocomplete (tournois, équipes, matchs, phases, cast-members)                                                                                   | —       | `GET /api/bot/v1/autocomplete/*`                                                                                                      |
| `outbox-poller` (jobs internes)                                                                                                                  | —       | `GET /api/bot/v1/events/pending`, `POST /api/bot/v1/events/handled`, `POST /api/bot/v1/events/:id/ack`                                |
| `reconciliation` (jobs internes)                                                                                                                 | —       | `GET /api/bot/v1/reconcile/discord-orphans`, `GET /api/bot/v1/reconcile/team-channels`                                                |
| `match-thread` / `team-voice` / `dispute-forum` (event-driven, pas de slash)                                                                     | —       | `PATCH /api/bot/v1/matches/:matchId/discord`, `PATCH /api/bot/v1/teams/:teamId/discord`                                               |
| `/aide-tournoi` _(à venir, conso de cette fixture)_                                                                                              | public  | `GET /api/bot/v1/tournament-help/inventory`                                                                                           |

---

## Permissions accordees a l'unite

`GET|PUT /api/admin/users/:userId/permissions` — accorder une permission staff
a quelqu'un SANS lui donner un role entier. **Pas un endpoint bot.**

Auth : `manage_staff`. Cle = l'id du compte auth (l'ecran appelant,
`/admin/users/manage`, manipule des comptes, pas des `staff.id`).

Modele : **permissions effectives = celles du ROLE UNION celles accordees**
(colonne `staff.extra_permissions`, `text[]`). Les accordees n'AJOUTENT que ;
retirer un droit se fait en changeant de role. Une valeur inconnue du catalogue
est ignoree a la lecture — la colonne n'a volontairement pas de CHECK, sinon
chaque nouveau droit imposerait une migration.

**Regle centrale : on ne peut accorder ni retirer qu'un droit qu'on detient
soi-meme** (403 sinon). Sans elle, `manage_staff` serait le seul droit qui
existe : un admin s'accorderait `manage_tenant` — qu'aucun role sauf `owner` ne
porte — et se hisserait au-dessus de son propre role. Un droit ne se cree pas,
il se delegue. Un droit recu a l'unite est redelegable : c'est une delegation,
pas un privilege de second rang.

Deux finesses qui evitent des faux etats :

- **Seul le DELTA est juge.** Une liste heritee peut contenir un droit que
  l'appelant n'a pas ; le lui faire retirer par accident, ou lui interdire
  toute modification a cause de lui, seraient tous deux faux.
- **Un droit deja couvert par le role n'est pas stocke.** Il survivrait a une
  retrogradation en donnant plus que le nouveau role.

Journalisation : `update_staff_permissions` (`entity_type: 'staff'`, payload =
cible, `added`, `removed`, `result`).

Cote lecture, `/api/admin/me` renvoie `permissions` (effectives) : la navbar et
les cartes du dashboard filtrent dessus. Le role seul ne suffit plus — sans ca,
une personne a qui on a confie une tache ne verrait pas l'entree de menu
correspondante.

---

## Documents de l'asso (Drive)

`GET /api/admin/documents` — liste le Drive de l'association (statuts, PV
d'AG, rapports, factures, dossier de partenariat). **Pas un endpoint bot** :
admin uniquement.

**DEUX DROITS, pas un.** Consulter les statuts et deposer une piece ne sont pas
le meme geste : la tresoriere depose, le reste du bureau consulte.

| Methode  | Droit exige        | Geste                                       |
| -------- | ------------------ | ------------------------------------------- |
| `GET`    | `read_documents`   | Lister un dossier                           |
| `POST`   | `manage_documents` | Deposer un fichier (25 Mo, types fermes)    |
| `PUT`    | `manage_documents` | Enregistrer la cle privee, chiffree en base |
| `DELETE` | `manage_documents` | Mettre a la CORBEILLE (pas de suppression)  |

La route se garde sur `read_documents` ; les deux ecritures re-verifient
`manage_documents` et repondent 403 sinon. La reponse du GET porte
`canWrite`, que la page utilise pour afficher ou non le bouton de depot — un
bouton masque n'est pas un controle d'acces, c'est une politesse.

Aucun role etroit ne porte l'un ou l'autre — ni `caster`, ni `referee`, ni
`helper` : un PV d'AG nomme des personnes physiques et un rapport financier
donne des montants.

| Parametre  | Type   | Methode | Notes                                                                                      |
| ---------- | ------ | ------- | ------------------------------------------------------------------------------------------ |
| `folderId` | string | GET     | Sous-dossier a lister. Defaut : la racine configuree. Verifie comme descendant de celle-ci. |
| `search`   | string | GET     | Filtre plein texte sur le nom, applique par Google (`name contains`).                       |
| `fileId`   | string | DELETE  | Fichier a jeter. Doit vivre dans l'arborescence configuree.                                 |

Reponse GET : `{ configured, canWrite, files[], folderId, folderName, breadcrumb[] }`.
`configured: false` (200, pas une erreur) quand `GOOGLE_DRIVE_SA_KEY` ou
`GOOGLE_DRIVE_FOLDER_ID` manque — la fonctionnalite est eteinte, elle n'est
pas en panne.

### Telechargement

`GET /api/admin/documents/download?fileId=&folderId=` — sert le fichier a
travers le site (flux binaire, route separee).

La v1 s'y refusait : ne renvoyer que des `webViewLink` laissait Google
appliquer le partage, une defense de plus. Ce qui a fait pencher : quelqu'un
qui a `read_documents` mais n'est pas dans la liste de partage Google se
prenait un refus en cliquant « Ouvrir dans Drive ». Le site disait oui, Google
non — un droit qui ne donne pas acces n'est pas un droit.

Ce que ca deplace : `read_documents` devient la seule chose entre un PV d'AG et
Internet. Trois precautions le compensent — meme confinement que la liste et la
corbeille, jeton Google en LECTURE SEULE, journalisation nominative
(`download_association_document`).

Les formats natifs Google (Docs, Slides, Sheets, Drawings) n'ont pas de contenu
binaire : ils sont EXPORTES (PDF, XLSX, PNG), et le nom de fichier prend
l'extension d'arrivee — sinon le fichier telecharge porte une extension qui
ment.

**Journalisation** : les trois gestes ecrivent dans `staff_logs` —
`read_association_documents` (`entity_type: 'drive_folder'`),
`upload_association_document` et `trash_association_document`
(`entity_type: 'drive_file'`). Le NOM d'un fichier divulgue autant que son
contenu : une consultation se journalise comme n'importe quelle lecture
sensible.

**Ou vit la cle privee** : en BASE, chiffree (`integration_secrets`, AES-256-GCM
via `utils/crypto.ts`), PAS dans les variables d'environnement. Netlify y
plafonne l'ensemble a 4 Ko en mode compatibilite Lambda ; ce budget etait deja
presque plein, et y ajouter la cle (1,7 Ko) a fait echouer la creation des
dix-neuf fonctions cron — donc le deploiement entier — trois fois le
2026-09-01. L'environnement ne garde que `GOOGLE_DRIVE_SA_EMAIL`,
`GOOGLE_DRIVE_FOLDER_ID` et `SECRETS_ENC_KEY` : moins de 200 octets.

La cle se colle depuis `/admin/documents` (methode `PUT`). Elle n'est jamais
relue, jamais journalisee, jamais renvoyee — on ne peut que la remplacer. Les
formes « tout en environnement » restent acceptees en developpement local, ou
ce budget n'existe pas ; l'environnement l'emporte alors sur la base.

**Acces Google** : compte de service, pas OAuth utilisateur — un token OAuth
appartient a une personne et meurt avec son depart.

**Un jeton par portee** : le chemin de lecture ne detient qu'un jeton
`drive.readonly`, le chemin d'ecriture un jeton `drive`. La separation des
droits staff est ainsi rejouee un cran plus bas, la ou une erreur de code ne
peut plus la contourner : le code de lecture ne PEUT pas ecrire, Google
refuse.

Cote Drive : partager le dossier en **Lecteur** suffit a la lecture ; le depot
exige **Editeur**. Un 403 sur un depot veut presque toujours dire cela, et la
route le dit explicitement plutot que de relayer le message de Google.

Cf. [`docs/ETUDE-drive-et-chat.md`](./ETUDE-drive-et-chat.md) et
[`docs/GUIDE-drive-asso.md`](./GUIDE-drive-asso.md).

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

| Route                                                                                                     | Methods            | Min role     | Notes                                                                                                                         |
| --------------------------------------------------------------------------------------------------------- | ------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| [`active-tenant.ts`](../pages/api/admin/active-tenant.ts)                                                 | GET, POST          | caster       | GET → tenant courant + source. POST → switch + Set-Cookie.                                                                    |
| [`tenants/accessible.ts`](../pages/api/admin/tenants/accessible.ts)                                       | GET                | caster       | Tenants accessibles au staff (pour dropdown switcher).                                                                        |
| [`tenants/index.ts`](../pages/api/admin/tenants/index.ts)                                                 | GET, POST          | admin        | GET liste globale + guild_count/staff_count. POST cree tenant.                                                                |
| [`tenants/[id].ts`](../pages/api/admin/tenants/[id].ts)                                                   | GET, PATCH, DELETE | caster/admin | GET = admin+ OU staff du tenant. PATCH/DELETE = admin+. Slug immuable. DELETE = soft (is_active=false), `conference` protege. |
| [`tenants/[id]/overview.ts`](../pages/api/admin/tenants/[id]/overview.ts)                                 | GET                | caster/admin | Vue d'ensemble d'un espace : 4 signes de vie (bot, match, staff, API), volumetrie par domaine (`utils/tenants/tenantScope.ts`), plan effectif et manques de mise en service (memes regles que le hub d'onboarding). Acces = admin+ OU staff du tenant. |
| [`tenants/[id]/discord-config/index.ts`](../pages/api/admin/tenants/[id]/discord-config/index.ts)         | GET                | caster       | Liste configs par guild du tenant.                                                                                            |
| [`tenants/[id]/discord-config/[guildId].ts`](../pages/api/admin/tenants/[id]/discord-config/[guildId].ts) | PUT                | caster       | Upsert config Discord. Verifie que guildId est dans le tenant.                                                                |
| [`tenants/[id]/staff/index.ts`](../pages/api/admin/tenants/[id]/staff/index.ts)                           | GET, POST          | caster/admin | GET = staff du tenant ou admin+. POST = admin+.                                                                               |
| [`tenants/[id]/staff/[staffId].ts`](../pages/api/admin/tenants/[id]/staff/[staffId].ts)                   | DELETE             | admin        | 409 si on retire le dernier admin du tenant.                                                                                  |
| [`pending-guild-links/index.ts`](../pages/api/admin/pending-guild-links/index.ts)                         | GET                | admin        | Guilds en attente de linkage (rempli par `POST /bot/v1/tenants/link-guild`).                                                  |
| [`pending-guild-links/[guildId]/claim.ts`](../pages/api/admin/pending-guild-links/[guildId]/claim.ts)     | POST               | admin        | Body `{ tenant_id }` OU `{ new_tenant: { slug, name, default_locale? } }`. Cree row dans `discord_guilds` + delete pending.   |
| [`pending-guild-links/[guildId]/index.ts`](../pages/api/admin/pending-guild-links/[guildId]/index.ts)     | DELETE             | admin        | Rejette la demande (delete pending). V2 TODO : signaler au bot pour `guild.leave()`.                                          |

Idempotence : les mutations POST/PATCH/PUT/DELETE supportent
l'header `Idempotency-Key` via `withAdminIdempotency` (cache scope =
tenant courant + staff + route + body hash, TTL 5 min, 2xx only).

---

## MOBA Draft system (LoL + Dota 2)

Lots 1-3 — pool de héros global + moteur de draft + timer serveur, le
tout pour les tournois `lol` / `dota2`. **Pas un endpoint bot** :
exposé en HTTP standard côté admin (`withStaffRoute`) et public
(spectator-friendly cache), avec un cron Netlify pour le timer.

Tables sous-jacentes : `game_heroes` (pool global, RLS lecture
publique), `match_drafts` (UNIQUE(match_id, game_index), scoped par
tenant), `match_draft_steps` (FK vers `game_heroes`, séquence
ban/pick avec `deadline_at` et `auto_picked`).

Migrations :

- [`create_draft_tables_for_lol_dota.sql`](../database/migrations/create_draft_tables_for_lol_dota.sql) (Lot 0).
- [`extend_game_check_constraint_lol_dota.sql`](../database/migrations/extend_game_check_constraint_lol_dota.sql) (Lot 0).
- [`enable_realtime_on_match_drafts.sql`](../database/migrations/enable_realtime_on_match_drafts.sql) (Lot 3, REPLICA IDENTITY FULL + publication).

### Pool de héros (Lot 1)

| Route                                                                         | Methods   | Auth       | Notes                                                                                                                                                                                         |
| ----------------------------------------------------------------------------- | --------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`pages/api/games/[slug]/heroes.ts`](../pages/api/games/[slug]/heroes.ts)     | GET       | public     | Liste les heroes du slug (`lol` ou `dota2`). 404 pour les jeux sans pool (ex. `overwatch`). `?includeDisabled=1` inclut les soft-disabled. Cache `s-maxage=3600, stale-while-revalidate=600`. |
| [`pages/api/cron/sync-game-heroes.ts`](../pages/api/cron/sync-game-heroes.ts) | POST, GET | CronSecret | 1×/jour à 04:00 UTC. Fetch Data Dragon (LoL) + OpenDota (Dota 2), upsert `(game, external_id)`. Retourne `207` en succès partiel. Heartbeat `site_settings.last_cron_sync_game_heroes_at`.    |

Source de mapping pure : [`utils/gameHeroesSync.ts`](../utils/gameHeroesSync.ts)
(helpers `mapLolChampionToRow`, `mapDotaHeroToRow`, `dotaPrimaryAttrToAttribute`).

### Engine + endpoints admin (Lot 2)

Tous sous `pages/api/admin/matches/[matchId]/drafts/...`, wrappés par
`withStaffRoute(handler, 'admin') + withAdminIdempotency(...)`.
Erreurs structurées : `DraftEngineError` (18 codes machine-readable,
détaillés dans `components.schemas.DraftEngineError` de `openapi.yaml`).

| Route                                                                                               | Methods     | Min role | Notes                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------- | ----------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`drafts/index.ts`](../pages/api/admin/matches/[matchId]/drafts/index.ts)                           | POST        | admin    | Init draft pour `gameIndex`. Résout le `game` depuis `tournaments.game`. Seed les `match_draft_steps` depuis `config/games/<slug>.draftFlows[format]`. 409 si déjà existant.                 |
| [`drafts/[gameIndex]/index.ts`](../pages/api/admin/matches/[matchId]/drafts/[gameIndex]/index.ts)   | GET, DELETE | admin    | GET = read assemblé du `DraftState`. DELETE = drop le draft + ses steps (recovery sans SQL). Refuse `in_progress` sauf `?force=1` → 409 `DRAFT_NOT_PENDING`.                                 |
| [`drafts/[gameIndex]/side.ts`](../pages/api/admin/matches/[matchId]/drafts/[gameIndex]/side.ts)     | PATCH       | admin    | Assigne `team1_side` + `team2_side`. Enum game-specific (lol `blue/red`, dota2 `radiant/dire`). Pre-step uniquement.                                                                         |
| [`drafts/[gameIndex]/commit.ts`](../pages/api/admin/matches/[matchId]/drafts/[gameIndex]/commit.ts) | POST        | admin    | Commit un ban/pick. Transition `pending → in_progress` sur step 1, auto-complete sur dernier step. Stamp `deadline_at` du step suivant. Bloque hero déjà banni/picked + fearless cross-game. |

### Timer serveur + auto-pick (Lot 3)

Captain UI (Lot 4) drive le countdown via Supabase Realtime (la
migration `enable_realtime_on_match_drafts.sql` ajoute `match_drafts`

- `match_draft_steps` à la publication `supabase_realtime` avec
  `REPLICA IDENTITY FULL`). Le cron Netlify est le catch-all quand
  personne ne regarde.

| Route                                                                                                     | Methods   | Auth       | Notes                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------- | --------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`drafts/[gameIndex]/start.ts`](../pages/api/admin/matches/[matchId]/drafts/[gameIndex]/start.ts)         | POST      | admin      | Transition explicite `pending → in_progress`. Stamp `started_at` + `deadline_at` sur step 1. Exige sides set.                                                                    |
| [`drafts/[gameIndex]/auto-pick.ts`](../pages/api/admin/matches/[matchId]/drafts/[gameIndex]/auto-pick.ts) | POST      | admin      | Trigger manuel : si `deadline_at < now()`, pick le premier hero éligible (alphabétique) avec `auto_picked=true`. Sinon `{ autoPicked: false }`.                                  |
| [`pages/api/cron/draft-auto-pick.ts`](../pages/api/cron/draft-auto-pick.ts)                               | POST, GET | CronSecret | Schedule `* * * * *` (1 min). Scan cross-tenant des steps `deadline_at < now AND hero_id IS NULL`, applique l'auto-pick. Heartbeat `site_settings.last_cron_draft_auto_pick_at`. |

Mécanique :

- `commitDraftStep` stamp `deadline_at = now + pick_timer_seconds` sur le
  step **suivant** après chaque commit (sauf dernier step).
- `startDraft` fait pareil pour le step 1 (autrement le timer ne
  démarrerait qu'au premier commit, ce qui défie le concept).
- `applyAutoPickIfExpired` filtre les heroes éligibles : `game = draft.game`,
  `enabled = true`, exclut bans + picks du draft courant, et si
  `fearless && game_index > 1` exclut aussi les picks des games précédentes
  du même match.
- Stratégie de sélection : **premier alphabétique** (déterministe, équitable
  en pratique). Pas de random pour rester testable.

Idempotence : `commitDraftStep` est explicitement crash-safe. Si un tick
crashe après l'UPDATE du step mais avant l'UPDATE du draft (le cas
"hero_id set, current_step pas incrémenté") :

- **retry avec le même heroId** : l'engine détecte le replay, saute la
  collision dedup, et ré-exécute l'UPDATE draft → état healed.
- **retry avec un heroId différent** : l'engine refuse explicitement avec
  `STEP_ALREADY_COMMITTED` (409) plutôt que d'écraser silencieusement la
  valeur committed. Force l'opérateur à utiliser `DELETE /drafts/:gameIndex`
  pour reset le draft proprement.

Tests dédiés couvrent les deux scénarios dans `tests/unit/apiAdminMatchDrafts.test.ts`
(describe `commitDraftStep partial-failure retry idempotency`).

### Captain UI (Lot 4)

Page admin staff-protected qui pilote un draft en live, branchée sur
Supabase Realtime pour fan-out immédiat des bans/picks. Pas de bot, pas
d'endpoint nouveau — purement orchestration côté client des Lots 0-3.

| Route                                                                                                           | Auth                                  | Notes                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`pages/admin/matches/[matchId]/draft/[gameIndex].tsx`](../pages/admin/matches/[matchId]/draft/[gameIndex].tsx) | `withStaffPage('admin')` + loader SSR | Captain UI : init → sides → start → boucle commit (clic sur hero) avec auto-pick fallback. Hero pool fetch via `/api/games/[slug]/heroes`. **SSR pré-valide** que le match existe + tournament.game ∈ {lol, dota2} ; sinon `blockReason` prop → vue "Draft indisponible" propre (au lieu d'un toast 400 après clic). |

Hooks dédiés :

- [`useDraftState`](../hooks/useDraftState.ts) — fetch `/api/admin/.../drafts/:gameIndex` + abonnement `useRealtimeChannel` sur `match_drafts` (filter `id=eq.X`) ET `match_draft_steps` (filter `draft_id=eq.X`). Refetch sur chaque event. Accepte un `fetcher` override (Lot 5 spectator l'utilise pour passer un fetch non-authentifié).
- [`useDraftTimer`](../hooks/useDraftTimer.ts) — countdown local 1s tick basé sur `deadline_at` du step courant. Couleurs : neutre > 10s, ambre 4-10s, rouge ≤3s, "AUTO-PICK" pulse quand expiré.

Composants (`components/admin/draft/`) : `DraftStatusPanel`, `SidePicker`, `DraftBoard`, `HeroPool`, `DraftTimer`. Tous Tailwind-inline, pas de design system dédié.

Toutes les mutations (init/sides/start/commit/auto-pick) passent par `useIdempotentMutation` → header `Idempotency-Key` auto-injecté + regen après chaque 2xx, donc retries safe.

### Bot endpoint + slash command (Lot 6)

Le bot Discord initialise les drafts via une commande slash
`/draft-init` (sibling repo `docker-box/services/discord-bot`). Le
endpoint bot côté site est un wrapper de `initDraft` qui résout en
plus les Discord IDs des deux capitaines, pour permettre au bot de
DM directement.

| Route                                                                                             | Methods | Auth                           | Notes                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------- | ------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`pages/api/bot/v1/matches/[matchId]/drafts.ts`](../pages/api/bot/v1/matches/[matchId]/drafts.ts) | POST    | `withBotRoute({ idempotent })` | Body `{ gameIndex, fearless? }`. Retourne `{ success, draft: DraftState, captains: [{ teamSlot, teamId, teamName, authUserId, discordUserId\|null }] }`. Rate-limit `bot-match-draft-init` (30/min). |

Résolution capitaines :

- `matches.team1_id / team2_id` → `teams.captain_id` (auth user id)
- `auth.users.id` → `user_discord_links.discord_user_id`
- Si le capitaine n'a pas lié son Discord (`discordUserId: null`),
  le bot tombe sur un message dans le canal au lieu d'un DM.

Slash command côté bot (`services/discord-bot/draft-init.js`) :

- Options : `match-id` (string + autocomplete via `acMatches`),
  `game-index` (integer, min 1), `fearless` (boolean optionnel).
- Appelle `POST /api/bot/v1/matches/:matchId/drafts` via `postBotApi`
  (auto-tag `x-api-key` + `x-tenant-id` + `Idempotency-Key`).
- Sur succès, DM les capitaines avec deux liens : la captain UI
  (`/admin/matches/:matchId/draft/:gameIndex`) et la spectator UI
  (`/draft/:matchId/:gameIndex`). Fallback canal si DM échoue.

### Spectator UI + public read (Lot 5)

Vue publique stream-friendly pour OBS browser sources. Aucune auth :
URL partageable par l'orga du tournoi → l'opérateur l'embed dans
OBS. Sécurité : l'id de match est un UUID inguessable + `match_drafts`
a une policy RLS `select_public` (Lot 0).

| Route                                                                                                       | Methods | Auth   | Notes                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------- | ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`pages/api/matches/[matchId]/drafts/[gameIndex].ts`](../pages/api/matches/[matchId]/drafts/[gameIndex].ts) | GET     | public | Renvoie `{ draft: DraftState\|null, teams: { team1Name, team2Name } }`. Les team names sont best-effort (null si team manquante). Cache `s-maxage=5, stale-while-revalidate=15`. Tenant résolu implicitement via `matches.tenant_id`. 404 si le match n'existe pas, 400 sur IDs invalides.                          |
| [`pages/draft/[matchId]/[gameIndex].tsx`](../pages/draft/[matchId]/[gameIndex].tsx)                         | —       | public | Page React publique. URL : `/draft/<matchId>/<gameIndex>?title=<encoded title>`. Si `?title=` absent, fallback automatique sur `team1Name vs. team2Name` (side-fetch). Layout dark (OBS chromakey friendly), 2 colonnes de 5 picks (splash arts), ban row, timer central. `<meta name="robots" content="noindex">`. |

Composants (`components/draft/`) :

- `SpectatorView` — layout complet, réutilise `DraftTimer` du Lot 4. Sub-components inline : `TeamColumn` (5 picks splash), `PickSlot` (image + nom + title), `BanSlot` (icon grayscale + barré), `BansRow`, `StatusBadge`.

Couleurs side (gradient sur chaque colonne d'équipe) :

- `blue` → bleu Riot (`from-sky-600/40`)
- `red` → rouge Riot (`from-rose-600/40`)
- `radiant` → vert Valve (`from-emerald-600/40`)
- `dire` → orange Valve (`from-orange-600/40`)

Realtime : la page consomme le même `useDraftState` que la captain UI, mais avec un fetcher injecté (`fetch` natif sans Bearer) + endpoint public. L'abonnement Supabase Realtime fonctionne anonymement parce que les RLS sur `match_drafts` + `match_draft_steps` autorisent `SELECT` cross-user (`USING (true)`).

---

## Prize pool — cash-prize crowdfundé

« Profondeur de la monétisation ». La dotation d'un tournoi (`tournament_prize_pools`)
combine une **dotation de base** fixée par l'orga (`base_amount_cents`) et des
**contributions publiques** crowdfundées via HelloAsso
(`prize_pool_contributions`, agrégées dans `raised_amount_cents`). **Pas des
endpoints bot** : HTTP standard côté public (gauge + checkout) et admin
(`withStaffRoute`). Migration : [`create_prize_pool_tables.sql`](../database/migrations/create_prize_pool_tables.sql).
Helpers : [`utils/billing/prizePoolFunding.ts`](../utils/billing/prizePoolFunding.ts).

Tables RLS **service-role-only** → lues via `supabaseAdmin`, mais toujours
scopées strict par `tenant_id` (+ `tournament_id`). Unité monétaire : **centimes**
partout (body, HelloAsso, DB) — pas d'arrondi flottant euros→centimes.

| Route                                                                                                 | Methods        | Auth                         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------- | -------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`pages/api/helloasso/prize-checkout.ts`](../pages/api/helloasso/prize-checkout.ts)                   | POST           | public                       | Contribuer à une cagnotte. Body `{ tournamentId? \| prizePoolId?, amountCents (100..10 000 000), contributorName?, email?, message?, isAnonymous? }` — au moins un de `tournamentId`/`prizePoolId` (si les deux, `prizePoolId` gagne). `200 { redirectUrl }`. `400 { error, code: INVALID_BODY \| POOL_NOT_FOUND \| POOL_CLOSED }`. `502` si HelloAsso amont échoue. Rate-limit **10 / IP / heure** (`helloasso-prize-checkout`). Persiste `prize_pool_checkouts` (pending) + attache `metadata:{ kind:'prize_pool', prize_pool_id, tenant_id }`.                                  |
| [`pages/api/tournaments/[id]/prize-pool.ts`](../pages/api/tournaments/[id]/prize-pool.ts)             | GET            | public                       | Jauge publique. `200 { exists, isOpen, currency, baseAmountCents, raisedAmountCents, totalCents, goalAmountCents\|null, contributorCount, recentContributors:[{ name\|null, amountCents, message\|null, createdAt }] }`. Aucune cagnotte → même forme, `exists:false`, zéros, `[]`. Jamais d'email ; contributeur anonyme → `name:null`. `Cache-Control: s-maxage=60`. Rate-limit 60 / IP / min (`prize-pool-public`).                                                                                                                                                             |
| [`pages/api/admin/tournaments/[id]/prize-pool.ts`](../pages/api/admin/tournaments/[id]/prize-pool.ts) | GET, PUT, POST | `withStaffRoute(_, 'admin')` | GET → `{ pool: {id, tournament_id, tenant_id, title, currency, goal_amount_cents, base_amount_cents, raised_amount_cents, is_open, total_cents, created_at, updated_at} \| null, contributions:[{id, amount_cents, contributor_name, is_anonymous, message, helloasso_payment_id, checkout_intent_id, created_at}], contributorCount }`. PUT/POST body `{ title?, goal_amount_cents?:int\|null, base_amount_cents?:int, is_open?:bool }` → `201` (create) / `200` (update) `{ pool }`. `raised_amount_cents` jamais modifiable ici. `Cache-Control: no-store`. `staff_logs` écrit. |

**Webhook — branche prize pool.** `POST /api/helloasso/webhook` (déjà documenté
dans [`openapi.yaml`](openapi.yaml), non-bot) gère MAINTENANT aussi les
contributions de cagnotte : lorsqu'un `Payment/Authorized` corrèle une cagnotte
(metadata `kind='prize_pool'` du checkout-intent, ou fallback via une row
`prize_pool_checkouts` matchée), il persiste une `prize_pool_contributions`
(idempotente sur `helloasso_payment_id`) et incrémente `raised_amount_cents` du
pool. Un don générique ou un don plan-tenant ne matche pas (comportement
inchangé). L'erreur applicative n'empêche jamais l'ACK 200.

---

## Vérification identité Battle.net

**Anti-smurf Tier 1.** Flux OAuth **maison** (pas de dépendance externe) : le
joueur autorise notre app sur `oauth.battle.net`, on échange le `code`, on lit
son **BattleTag** et on l'écrit sur son profil. La colonne `battle_net_id` est
**`UNIQUE`** : un même compte Blizzard ne peut être rattaché qu'à un seul joueur,
ce qui bloque les smurfs (un second compte site qui tenterait de lier le même
BattleTag est refusé → redirection `?battlenet=linked_no_match`). **Pas des
endpoints bot** : routes web/joueur, HTTP standard, documentées ici pour garder
l'inventaire complet. La feature est **dormante** tant que les creds Blizzard
(client id/secret) sont absents : `start`/`callback` répondent alors `503
{ code: 'BATTLENET_NOT_CONFIGURED' }` et `battlenet-status` renvoie
`configured:false`.

Le cookie httpOnly `bn_oauth_state` (posé par `start`, recroisé au `callback`)
protège le flux contre le CSRF/replay.

| Route                                                                             | Methods | Auth                            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------- | ------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`pages/api/auth/battlenet/start.ts`](../pages/api/auth/battlenet/start.ts)       | GET     | session cookie Supabase joueur  | Query optionnelle `returnTo` (chemin interne sanitizé — doit commencer par `/`, ni `//` ni scheme ; défaut `/player/profile`). `302` → URL authorize Blizzard + pose le cookie httpOnly `bn_oauth_state`. `401 { error }` si non connecté. `503 { error, code: 'BATTLENET_NOT_CONFIGURED' }` si dormant. Rate-limit **20 / min**.                                                                                                     |
| [`pages/api/auth/battlenet/callback.ts`](../pages/api/auth/battlenet/callback.ts) | GET     | session cookie Supabase joueur  | Query `code`, `state` (+ cookie `bn_oauth_state`). `302` vers `returnTo` avec `?battlenet=` : `verified` (BattleTag lié), `linked_no_match` (BattleTag déjà rattaché à un autre compte — conflit d'unicité), `already_linked` (identité déjà présente), `error` (state invalide, échange KO…). `302 /login` si la session Supabase est perdue. `503` si dormant. Endpoint de redirection : pas de JSON body. Rate-limit **20 / min**. |
| [`pages/api/player/battlenet-status.ts`](../pages/api/player/battlenet-status.ts) | GET     | Bearer joueur (`withAuthRoute`) | `200 { configured:boolean, linked:boolean, battleTag:string\|null, verifiedAt:string\|null }`. `401` si Bearer absent/invalide. Rate-limit **30 / min**.                                                                                                                                                                                                                                                                              |

---

### Fil du match (espace joueur)

Route **web** (pas bot), ajoutée avec le lot J1 de
[PLAN-espace-joueur.md](./PLAN-espace-joueur.md) : une seule rencontre, de la
préparation au report du score, derrière une URL partageable
(`/player/match/[matchId]`). Elle recompose des briques déjà livrées — check-in
public à jeton, feuille de match, self-report — au lieu de les éparpiller sur
trois écrans.

| Route                                                                                            | Methods | Auth                              | Notes                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------ | ------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`pages/api/player/matches/[matchId].ts`](../pages/api/player/matches/[matchId].ts)               | GET     | Bearer joueur (`withSubjectRoute`) | `200 { match, team{slot}, opponent, tournament, checkin, readiness, score, result, report{state,mine}, permissions }`. Accès = appartenir à l'une des deux équipes (membre ou `teams.captain_id`) ; sinon **404** (jamais 403 : on ne confirme pas l'existence d'un match qui ne vous regarde pas). `permissions.validateLineup` = permission d'équipe `validate_lineup` ; `permissions.reportScore` = `teams.captain_id` strict, miroir de `report-score`. Inspectable `?as=`. Rate-limit **60 / min**. |

Les dérivations « de quel côté je joue / mon jeton de check-in / mon score »
sont partagées avec `/api/player/next-match` et `/api/player/matches` via
[`utils/matches/playerMatchView.ts`](../utils/matches/playerMatchView.ts) — trois
routes, une seule règle.

### Délégation de droits d'équipe (espace joueur)

Lot J3 de [PLAN-espace-joueur.md](./PLAN-espace-joueur.md). Les permissions
d'équipe venaient uniquement du RÔLE (`site_settings.team_roles`, global et
staff-only) : confier « les scrims » imposait de donner le rôle `coach`, qui
porte aussi la feuille de match. Une couche **additive** décidée par l'équipe
elle-même comble ce trou.

| Route                                                                            | Methods         | Auth                               | Notes                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------- | --------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`pages/api/teams/member-permissions.ts`](../pages/api/teams/member-permissions.ts) | GET/POST/DELETE | Bearer joueur (`withSubjectRoute`) | Exige `manage_roster`. `POST` refuse (403) une permission que l'appelant n'a pas lui-même (sinon un rôle partiel s'auto-élargit) et 404 si la cible n'est pas dans l'équipe. `DELETE` révoque en SOFT (`revoked_at`) : la table `team_member_permissions` est aussi le journal. Rate-limit **30 / min**. |

La surcharge ne **retire** jamais ce qu'un rôle accorde : `getManagedTeams` en
fait l'union (`permissions`) et expose la part déléguée à part
(`grantedPermissions`). Une surcharge peut à elle seule créer un accès pour une
joueuse sans rôle privilégié.

### Agenda personnel (espace joueur)

Lot J2 de [PLAN-espace-joueur.md](./PLAN-espace-joueur.md). L'agenda porte
**toutes** les équipes de la personne (appartenances + équipes encadrées) : un
manager qui en encadre trois a un seul agenda.

| Route                                                                                  | Methods         | Auth                              | Notes                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------- | --------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`pages/api/player/agenda.ts`](../pages/api/player/agenda.ts)                           | GET             | Bearer joueur (`withSubjectRoute`) | `200 { teams[], entries[] }` triées par date : matchs, scrims, date butoir de roster. Le check-in est porté par l'entrée du match (`checkinOpensAt`), jamais comme entrée séparée. Rate-limit **60 / min**.                                                       |
| [`pages/api/player/agenda.ics.ts`](../pages/api/player/agenda.ics.ts)                   | GET             | **jeton porteur** `?token=`        | Flux iCalendar pour Google/Apple/Outlook, qui ne présentent jamais de session. Jeton inconnu / révoqué / malformé → **404 identique**. `private, no-store` + `X-Robots-Tag: noindex`. Le check-in devient une `VALARM`. Rate-limit **30 / min** par IP.        |
| [`pages/api/player/agenda/subscription.ts`](../pages/api/player/agenda/subscription.ts) | GET/POST/DELETE | Bearer joueur (`withAuthRoute`)    | `GET` le lien courant (ou `url: null`), `POST` en émet un neuf **et révoque le précédent**, `DELETE` révoque. Un seul jeton actif par (tenant, compte) — index partiel `player_calendar_tokens_active_key`. Jamais inspectable `?as=`. Rate-limit **20 / min**. |

## Where it lives

- **Middleware** — [`utils/botAuth.ts`](../utils/botAuth.ts) (`withBotRoute`,
  `verifyBotApiKeyMultiTenant`, `bot_idempotency` table access).
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
