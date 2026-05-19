---
name: sync-bot-contract
description: Audit the cross-repo bot ↔ site API contract for drift. Compares the three sources of truth — site handlers under `conference-website/pages/api/bot/v1/*`, the contract doc at `conference-website/docs/BOT_API_CONTRACT.md`, and the bot client at `docker-box/services/discord-bot/api-client.js` — and reports missing/mismatched routes and shape divergences. Use when the user says "/sync-bot-contract" or before merging a PR that touches `/api/bot/v1/*`.
---

# Sync bot contract audit

The bot ↔ site API contract is the most load-bearing cross-repo coupling in this stack. Three sources must stay aligned:

1. **Site handlers** (canonical) — `conference-website/pages/api/bot/v1/**/*.ts`
2. **Contract doc** — `conference-website/docs/BOT_API_CONTRACT.md`
3. **Bot client** (consumer) — `docker-box/services/discord-bot/api-client.js`

Drift between the three causes silent bot breakage in production. This skill produces a diff report; it does NOT auto-fix.

## Step 0 — locate both repos

Determine the CWD and the sibling repo path:

```bash
pwd
ls ../docker-box ../conference-website 2>/dev/null
```

The two repos are sibling directories: typically `/Users/.../Vincent/docker-box/` and `/Users/.../Vincent/conference-website/`. If only one is reachable, stop and tell the user — partial audit produces misleading reports.

## Step 1 — enumerate handlers (canonical source)

```bash
# From either repo, with paths adjusted as needed:
find <conference-website>/pages/api/bot/v1 -name "*.ts" -type f | sort
```

For each handler, capture:

- **Path** — e.g. `pages/api/bot/v1/teams/[teamId]/members.ts` → endpoint `/api/bot/v1/teams/:teamId/members`.
- **Methods accepted** — grep for `withBotRoute({ method:` or `req.method ===`.
- **Idempotency / per-actor rate limit flags** — grep for `idempotent:` and `perActorRateLimit:` in the `withBotRoute` call.
- **Request shape** — grep for the zod schema (`z.object({` near the top).
- **Response shape** — quick read of the success-path return.

Keep it bounded: a one-line summary per route is enough.

## Step 2 — enumerate routes in the contract doc

```bash
grep -nE "^### |^- \`/api/bot/v1/" <conference-website>/docs/BOT_API_CONTRACT.md
```

For each route mentioned in the doc, capture: path, methods, idempotent flag, summarized shapes.

## Step 3 — enumerate calls in the bot client

```bash
grep -nE "/api/bot/v1/" <docker-box>/services/discord-bot/api-client.js
grep -nE "fetch|axios|http\." <docker-box>/services/discord-bot/api-client.js
```

For each `/api/bot/v1/*` URL the bot calls, capture: path template, method, body shape (from the surrounding code).

## Step 4 — produce the audit report

Cross-reference the three lists. Report under three buckets, each a bullet list:

**1. Routes missing from doc** (handler exists, doc doesn't mention it):
- `<METHOD> /api/bot/v1/<path>` — add a section to BOT_API_CONTRACT.md.

**2. Routes missing from bot client** (handler + doc exist, no client call):
- `<METHOD> /api/bot/v1/<path>` — orphan route? confirm whether it's intentional (planned, manually called via curl, etc.).

**3. Shape mismatches** (handler vs doc, or handler vs client):
- `<route>` — handler accepts `{a, b, c}`, doc shows `{a, b}` — doc is stale.
- `<route>` — bot client sends `{x: string}`, handler expects `{x: number}` — bot is stale.
- `<route>` — handler is `idempotent: true`, client doesn't send `Idempotency-Key` — bot is missing a header.

**4. Doc-only entries** (doc mentions a route that has no handler):
- `<METHOD> /api/bot/v1/<path>` — handler was deleted, doc still claims it exists.

If everything aligns: report 🟢 "Contract is in sync across all three sources" and stop. Don't fabricate issues.

## Step 5 — recommend next steps

For each finding, propose the owning agent + the concrete action:

- Doc stale → invoke `api` agent in conference-website to update `docs/BOT_API_CONTRACT.md`.
- Client stale → invoke `discord-bot` agent in docker-box to update `api-client.js`.
- Handler missing for documented route → either delete the doc entry (`api` agent) or re-implement the handler.
- Header missing on bot side (idempotency, etc.) → `discord-bot` agent.

## Hard rules

- **Site is canonical.** When handler ≠ doc ≠ client, the handler wins. Doc and client align TO the handler.
- **Don't auto-fix.** This skill only reports. Fixes ship as code changes reviewed in PRs.
- **Don't widen scope.** Stay on the contract surface — don't audit unrelated routes, don't suggest refactors.
- **Breaking changes ship as `/v2/`.** If you see what looks like a breaking change to `/v1/`, flag it as a risk in the report.
- **Cross-repo PRs**: when both bot and site need changes, plan two PRs (one per repo) with linked descriptions — the `lead-tech` agent owns that orchestration.

## Output format

Keep the user-facing report under 300 lines. Lead with a one-line summary (🟢 green / 🟡 N findings / 🔴 N critical), then the bucketed bullets. No raw grep output dumps — synthesize.
