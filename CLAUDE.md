# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules — scope & production safety

- Do only what was asked. If you think extra changes are needed (Dockerfile, lockfiles, `.gitignore`, e2e checks, refactors), propose them first and do not apply them.
- Never run builds on the bot VPS / any prod host, read production secrets, or write to the production DB (including via subagents) without explicit approval. State these constraints in every subagent prompt.
- For Supabase DDL, write the migration file under `database/migrations/` and give the exact SQL/CLI commands to apply it (including `supabase link`); do not apply DDL to prod yourself.

## Environment

- This is a Windows machine (PowerShell). Prefer PowerShell or Node scripts over bash heredocs, `sed`, and `cat` pipelines.
- For multi-line file edits, use the Write/Edit tools instead of shell text manipulation — `sed` newline handling differs across shells and can corrupt imports.
- Watch for CRLF line endings.
- npm script quoting must work under Windows cmd.

## Session start

**Production branch is `work`** (every push to `work` deploys the Cloudflare Worker that serves owwomenscup.fr, `.github/workflows/cloudflare.yml`; `master` is stale since July 2026 — never target it). conference-api deploys from its `main`. No deploy previews on Cloudflare; Netlify still builds `work` and PR previews until it is retired (~2026-11-11, rollback only — [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md)).

When I say « pull les repos » or start a session, `git pull` the repos below, report the branch and status of each, then wait for the next instruction:

- `C:\Users\hirtz\depot\conference-website` (this repo, site)
- `C:\Users\hirtz\workspace\owwc-discord-bot` (Discord bot)
- `C:\Users\hirtz\depot\conference-api` (API mirror, Lightsail)

## Build and Development Commands

```bash
npm run dev              # Start development server (Next.js)
npm run build            # Production build
npm run start            # Start production server
npm run lint             # Biome lint (hooks, a11y, Next) — code mort via tsconfig strict
npm run format           # Biome format --write (remplace Prettier)
npm run format:check     # Biome format (vérification)
npm run test             # Playwright e2e tests (95 specs)
npm run test:unit        # Vitest unit tests (~210 files, site side; API tests run in conference-api)
npm run sync:api         # recopie depuis conference-api les fichiers du manifeste (sync:api:check = à blanc)
npm run test:unit:watch  # Vitest watch mode
npm run test:unit:coverage  # Vitest + v8 coverage (utils/** + pages/api/**)
```

### Running a Single Test

```bash
npx playwright test tests/e2e/pages.spec.ts            # one e2e file
npx playwright test -g "GET / renvoie du contenu"      # by name pattern
npx vitest run tests/unit/apiPublicRoutes.test.ts      # one unit file
npx vitest run -t "returns 401"                        # unit by name
```

Tests require `.env.local` with Supabase credentials. Set `TEST_BASE_URL` to override the default localhost URL.
For Playwright: never use `--ignore-pattern` (invalid flag), use `--grep-invert`.

## Architecture Overview

**Next.js 16** (Pages Router) + **React 19** + **Supabase** (Postgres + Auth + Realtime) + **Tailwind v4**. Deployed on **Cloudflare Workers** via OpenNext (`@opennextjs/cloudflare`, Worker `owwomenscup`, R2 page cache, routes on the owwomenscup.fr zone) since 2026-10-28, with the scheduled tasks in the same Worker — see [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md). Netlify stays deployed two weeks for rollback only (no scheduled functions left there).

The site sits at the center of a small ecosystem:

- **`conference-website`** (this repo) — public site, admin dashboard, REST API, PWA.
- **`conference-api`** (private repo, local clone `C:\Users\hirtz\depot\conference-api`) — **owns the whole backend since the 2026-10-13 cutover**: routes (`pages/api`), business logic (`features/*/routes|service|repository`), contracts (`lib/apiContracts`, `docs/openapi`), domain utils, the **database schema** (`database/`: migrations, seeds, schema snapshot) and their tests. Served on `https://api.owwomenscup.fr` (CloudFront → Lightsail Stockholm). The Worker ([cloudflare/worker.mjs](cloudflare/worker.mjs), same logic as [utils/edgeApiProxy.ts](utils/edgeApiProxy.ts)) relays `owwomenscup.fr/api/*` there same-origin (`API_PROXY_PREFIXES=/api/` in wrangler.jsonc), and `/api/public/*` is additionally called cross-origin by the browser (`NEXT_PUBLIC_API_REMOTE_PREFIXES`, [utils/remoteApi.ts](utils/remoteApi.ts)). **This repo has no API code any more** except `pages/api/internal/*` (ISR regeneration, must run on the site itself — the Worker never relays `/api/internal/`). The ~350 shared files its pages still import (zod contracts, `utils/tcg`, `utils/teams`, `utils/matches`, `utils/overlay`, `config/games`, feature models/schemas…) are **copies delivered by the reverse sync**: `npm run sync:api` ([scripts/sync-from-api.mjs](scripts/sync-from-api.mjs), manifest `.api-sync-manifest.json`, `sync:api:check` = dry run, run by CI and by `.github/workflows/sync-from-api.yml` on `repository_dispatch api-updated` + hourly cron). **Never edit a manifest file here — edit it in conference-api.** Backend work (a route, a validation rule, a TCG rule, a migration) is done in conference-api. Guard here: `tests/unit/apiOwnershipGuard.test.ts` (no route outside `internal/`, no value import of a `routes|service|repository`, manifest consistent); the mirror guards `apiBoundariesGuard` and `apiTypeImportsGuard` live in conference-api. Route → UI tests were split at the cutover: route side there, UI side here against response fixtures, shared values frozen by the same literal on both sides. `tests/pending-4e/` is empty by design and `pending4eRatchet.test.ts` refuses any new `.pending`. Interactive reference: `https://api.owwomenscup.fr/api/docs` (Scalar, built from `docs/openapi/`).
- **`owwc-discord-bot`** (private sibling repo `vincenthirtz/owwc-discord-bot`, local clone `C:\Users\hirtz\workspace\owwc-discord-bot`; formerly `docker-box/services/discord-bot`) — Discord bot that consumes `/api/bot/v1/*`. Runs on a dedicated VPS since 2026-10-12 (no longer on the Freebox); public URL `https://bot.owwomenscup.fr`, site → bot webhooks on `/bot/site-events` (`BOT_WEBHOOK_URL`).
- **`womenscup-caster`** (sibling) — former Electron caster app, **no longer used; GitHub repo archived 2026-10-29**. The web caster cockpit `/admin/caster` replaces it (its `/api/caster/v1/*` and `/api/twitch/*` routes stay).

### Directory Structure

- **pages/** — Next.js pages. **No API routes here any more** (they live in conference-api: `pages/api/{admin,bot/v1,caster,player,cron,public,…}`, contracts `docs/BOT_API_CONTRACT.md` / `CASTER_API_CONTRACT.md` / `PUBLIC_API_CONTRACT.md` there too). Only `pages/api/internal/revalidate.ts` remains (remote ISR regeneration, called by conference-api).
  - **pages/admin/** — admin dashboard (tournaments, teams, news, broadcast, scrims, disputes, demandes, onboarding queue, site settings, stats, logs, users, etc.)
  - **pages/player/** — player espace (`/player/*`)
  - **pages/onboard/** — self-service tenant onboarding flow ([docs/ONBOARDING.md](docs/ONBOARDING.md))
  - **pages/[tenantSlug]/** — multi-tenant path-prefix routes (POC: `tournois.tsx`)
- **components/** — React components. `components/admin/*` is admin-only. Public landing/UX components live at the root.
- **features/** — `features/<espace>/<domaine>/` modules: here only their UI side (`ui/`, `client.ts`, `hooks/`) plus models/schemas synced from the API; `routes/`, `service/`, `repository/` live in conference-api.
- **utils/** — site-side logic, plus the domain utils synced from conference-api (manifest) — see "Key Modules" below
- **hooks/** — React hooks (`useStaffSession`, `usePlayerSession`, `useAdminFetch`, `useIdempotentMutation`, `useRealtimeChannel`, `useDraftState`, `useDraftTimer`, `useOnlineStatus`, `useCookieConsent`, …)
- **types/** — domain TS types (`bracket`, `swiss`, `draft`, `matches`, `stages`, `staff`, `validation`, …)
- **config/** — static config (speakers, teams, social links, past results)
- **database/** — **moved to conference-api** (migrations, seeds, `schema-snapshot.json`, `scripts/refresh-schema-snapshot.mjs`). A migration is written there; the `new-migration` skill applies there.
- **cloudflare/** — the Worker: entry point `worker.mjs` (API relay, 404 fix, redirects, cache headers), `crons.ts` (the scheduled tasks), `responses.ts`, `_headers` (static files). Config in `wrangler.jsonc` + `open-next.config.ts`; post-deploy checks in `scripts/cloudflare-check.mjs`.
- **netlify/** — leftovers kept until Netlify is retired (`api-proxy` edge function, orphan `functions/builds.ts`); no scheduled functions any more.
- **docs/** — [ONBOARDING.md](docs/ONBOARDING.md), [EDGE-API-PROXY.md](docs/EDGE-API-PROXY.md) (the relay and the cutover). API contracts and the OpenAPI spec (`docs/openapi/`) live in conference-api; `/developpeurs/reference` fetches the public spec from `api.owwomenscup.fr/api/public/openapi` at build (ISR 1 h).
  - Feuilles de route par espace : [PLAN-espace-joueur.md](docs/PLAN-espace-joueur.md) (joueuse / coach / manager / capitaine) et [PLAN-espace-admin.md](docs/PLAN-espace-admin.md) (staff) — lots séquencés autour de la 1re journée Cup 2026 (14/09/2026)
- **tests/e2e/** — Playwright specs (~95)
- **tests/unit/** — Vitest specs (~210 files: pages, components, hooks, site utils, guards). API/business/schema tests live in conference-api (~630 files).
- **tests/pending-4e/** — empty by design (README only). A route → UI test is written split from the start: route in conference-api, UI here against a fixture; the ratchet `pending4eRatchet.test.ts` refuses any new `.pending`.
- **scripts/** — ops scripts (`create-team-news.mjs`, `sync-from-api.mjs`, metrics, bundle budget)
- **proxy.ts** — Edge middleware: per-request CSP nonce, Turnstile allowances, PWA worker/manifest allowances

### Key Modules (utils/)

- `supabase.ts` + `supabaseAdmin.ts` — browser/server clients (cookies via `@supabase/ssr`) and admin client (service role, bypasses RLS).
- `staff.ts` — staff auth, roles, CSRF (`csrfCheck`), `withStaffRoute(handler, minRole)`, `withStaffPage(minRole, loader?)`, `getStaffContextFromRequest`. Roles: `owner > admin > caster` (rank in `utils/staffRoles.ts`); `referee` / `helper` sit below `caster` and go through permissions only (`utils/staffPermissions.ts`).
- `casterAuth.ts` — caster-session gate (`withCasterRoute`), used by the two leftover `/api/caster/{me,briefing}` routes.
- `tenant.ts` + `adminTenants.ts` — multi-tenant resolution (path-prefix from `tenants.slug`, legacy `DEFAULT_TENANT_ID` fallback, in-memory slug cache).
- `botAuth.ts` + `botActor.ts` + `botEvents.ts` + `botPlayerLogs.ts` + `botRoleSync.ts` — Discord-bot API auth (per-tenant `x-api-key`), actor resolution, outbox event emission, audit logs.
- `adminIdempotency.ts` — `withAdminIdempotency(handler, { key })` honors `Idempotency-Key` header (5-min window, only caches 2xx). Insert AFTER `withStaffRoute`.
- `rateLimit.ts` — in-process sliding-window rate limit (per-route store).
- `captcha.ts` — HMAC-signed math challenge (no external service). Token TTL 5 min. Endpoint: `GET /api/captcha`.
- `turnstile.ts` — Cloudflare Turnstile verification (onboarding flows).
- `webPush.ts` + `webPushEvents.ts` — VAPID push fan-out (admin PWA + player). Crons under `pages/api/cron/web-push-dispatch.ts`.
- `bracket/` — bracket graph build, path computation, propagation.
- `swiss/` — Swiss-system pairing + standings.
- `matches/` — match scoring, auto-scheduling.
- `tournamentImport/` — tournament import pipeline.
- `simulator.ts` + `simulatorBrackets.ts` + `simulatorFakeData.ts` + `simulatorSerialization.ts` — tournament simulator.
- `draftEngine.ts` — MOBA pick/ban draft engine.
- `castEvents.ts` — cast-assignment outbox events. `broadcasts.ts` — EMAIL campaigns (the name is historical; nothing to do with streaming).
- `discord.ts` + `discordLinks.ts` — Discord helpers + link tokens.
- `helloasso.ts` — HelloAsso integration. **Two accounts, never mix them**: the env vars (`HELLOASSO_CLIENT_ID/SECRET/ORG_SLUG`) are the ASSOCIATION's account (memberships, donations, plan payments); a third-party space connects its own credentials (encrypted per tenant, `utils/billing/helloassoAccount.ts`, admin screen « Réglages › Encaissement ») so its tournament prize pools are collected by its own structure. No connected account → a prize pool can't be opened (`409 HELLOASSO_NOT_CONNECTED`). The payment webhook takes a per-tenant derived token (`?tenant=<slug>&token=…`) and only applies a contribution to a pool of that same space.
- `twitch.ts` — Twitch OAuth + live status.
- `validation.ts` — zod schemas for API inputs.

### Authentication & Authorization

Three distinct session surfaces, all backed by Supabase Auth:

| Surface             | Helper                                | Storage  | Notes                                              |
| ------------------- | ------------------------------------- | -------- | -------------------------------------------------- |
| Public/player       | `getServerClient(req, res)`           | Cookies  | RLS-enforced; user-bearer for API routes           |
| Admin/staff         | `withStaffRoute` / `withStaffPage`    | Cookies  | Role gate `owner > admin > caster`               |
| Caster session      | `casterAuth.ts`                       | Cookies  | `withCasterRoute`; only `/api/caster/{me,briefing}` |
| Discord bot         | `withBotAuth` (per-tenant `x-api-key`) | Header   | Bypasses RLS via `supabaseAdmin`; logs actor       |

- Staff actions are logged to `staff_logs` via `logStaffAction()`.
- Admin mutations should be wrapped: `withStaffRoute(withAdminIdempotency(handler, { key }), 'admin')`.
- CSRF: `withStaffRoute` enforces origin/referer match on state-changing methods.

### PWA + Web Push

- Service worker at `public/sw.js`, manifest at `public/site.webmanifest`. Registered with scope `/` (header `Service-Worker-Allowed: /` set in `cloudflare/_headers`).
- Gated by `NEXT_PUBLIC_ENABLE_PWA=1` — set ONLY in production (GitHub env `cloudflare-production`, through `CLOUDFLARE_LIVE=1`) to avoid SW cache pollution on previews/dev.
- Push: VAPID keypair (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`). Dispatcher cron `*/1` fans out `bot_event_outbox` rows to `web_push_deliveries`.
- Client opt-in: `components/admin/PushOptIn.tsx`. Player-side push wired in Lot 13.A/B.

### Scheduled tasks (cron)

One Cron Trigger fires the Worker every minute; [cloudflare/crons.ts](cloudflare/crons.ts) lists the 28 tasks (UTC schedule, route, timeout) and POSTs the due ones to `https://api.owwomenscup.fr/api/cron/<route>` with `Authorization: Bearer <CRON_SECRET>` (handlers live in conference-api). `CRONS_ENABLED` in wrangler.jsonc is the kill switch; results show as `[crons] ok` / `[crons] échec` in the Worker logs. Among them:

- `checkin-cron` `*/5` — per-match check-in (emails T-1h, Discord T-30/T-15, auto-forfeit T-0)
- `broadcast-cron` `0 10 * * *` — daily broadcast email waves (Brevo 300/day cap)
- `outbox-maintenance-cron` `0 * * * *` — `bot_event_outbox` hygiene + latency stats
- `web-push-dispatcher-cron` `* * * * *` — outbox → Web Push fan-out
- `dispute-sla-cron` `*/5` — dispute SLA breach detector
- `sync-game-heroes-cron` `0 4 * * *` — refresh LoL/Dota hero pool
- `draft-auto-pick-cron` `* * * * *` — server-side draft timer (auto-pick)

### Multi-tenant (in progress)

Phase 1 (DB) done — 32 tables now carry `tenant_id`. Phase 2 (bot) sends `x-tenant-id`. Phase 3 (public pages) uses **path-prefix** routes: `pages/[tenantSlug]/...` (POC: `tournois.tsx`). Legacy unprefixed pages fall back to `DEFAULT_TENANT_ID` (conference) until the second tenant ships. See `utils/tenant.ts` for the contract.

### Key Patterns

- API auth: bearer token in `Authorization` header for user routes; cookie session for admin; `x-api-key` for bot.
- Pages use `_app.tsx` layout with `Navbar`, `Footer`, `DefaultSeo`, `ErrorBoundary`, `ToastProvider`. `/admin` routes skip the public footer and analytics (`utils/layout/appChrome.ts`).
- Validation: zod schemas in `utils/validation.ts`. Validate at entry points.
- Realtime: `useRealtimeChannel` wraps Supabase Realtime.

## Project Policies

**Dependencies.** The former zero-dependency policy was lifted on 2026-09-29. Add a package when it clearly beats writing and maintaining the code ourselves (e.g. `@tanstack/react-query` for the admin data layer, `@testing-library/react` for hook/component tests). Prefer small, well-maintained libraries; say in the commit message why the package is worth it; keep client-side packages out of the public first-load bundle unless the public pages need them (`scripts/bundle-budget.mjs`, `adminBoundariesGuard`).

## Commit Convention

Conventional Commits:

- `fix:` — bug fix (PATCH)
- `feat:` — new feature (MINOR)
- `docs:` — documentation only
- `chore:` — cleanup/maintenance
- `refactor:` — refactor
- `feat!:` / `fix!:` — breaking change

## Git Workflow

After fixing files, verify you haven't modified files outside scope. Run `git diff --stat` before committing.

## Security / Code Quality

- When fixing CodeQL / static analysis alerts, understand the tool's taint-tracking model before patching. Simple runtime guards rarely satisfy static analyzers — prefer input validation at entry points and type-safe patterns like `Map` over plain objects.
- CSP nonce is generated per-request in `proxy.ts`. When adding third-party scripts, update the CSP and add the source to the right directive.
- Never log secrets or service-role responses.

## Testing

- E2E: Playwright. Use `--grep-invert` (not `--ignore-pattern`). Watch for transparent background inheritance when asserting contrast.
- Unit: Vitest with an in-memory Supabase mock under `tests/unit/__helpers__/testSetup.ts`. Tests cover API handlers heavily (`apiRoutesBatch*.test.ts`, `apiAdmin*.test.ts`, `apiBot*.test.ts`).
- Coverage excludes `pages/api/blizzard-media.ts` (~1500 lines of static fallback data, drags totals). React hooks and components can now be tested with `@testing-library/react` in a `// @vitest-environment happy-dom` file (`*.test.tsx`).

### Before pushing

- Run the tests and read the actual pass/fail counts (and check the count is > 0); don't trust the exit code alone.
- Never push with a failing test.
- After a deploy, verify the change on the prod URL.

### ⚠️ Le mock Supabase ne valide pas les colonnes

Le double en mémoire répond à n'importe quel `.select()`, y compris sur une
colonne qui n'existe pas ; en production, PostgREST rejette la requête
entière (`42703`, `PGRST200` pour un indice de relation inconnu) → 500. Le
garde-fou `supabaseSelectSchema.test.ts` (colonnes et indices de relation
confrontés à `database/schema-snapshot.json`) vit désormais **dans
conference-api**, avec le schéma. Réflexes inchangés, là-bas : après une
migration → `node scripts/refresh-schema-snapshot.mjs` ; le test rouge sur une
colonne fantôme = un 500 en prod, pas un faux positif. Les pages SSR de ce
dépôt qui font leurs propres `.select()` ne sont plus couvertes par ce
garde-fou : vérifier les colonnes contre le snapshot de conference-api.

## OBS overlays

- Design overlays for 1920x1080 browser sources, not the 800x600 OBS default.
- Keep aspect ratios fixed (QR codes, logos) and make sure text never crops.
- Handle all match statuses, including walkover, so scores always show.
- Don't add decorative elements like « VS » — the OBS scene already has them.

## Environment Variables

Required in `.env.local` (see `example.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key (public)
- `SUPABASE_SERVICE_ROLE_KEY` (or `NEXT_SUPABASE_SERVICE_ROLE_KEY`) — server-only admin
- `DISCORD_TEAM_SECRET` — legacy bot shared secret (per-tenant `x-api-key` is preferred)
- `NEXT_PUBLIC_FORMSPREE_ID` — contact form
- `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` / `TWITCH_REDIRECT_URI` — Twitch OAuth
- `NETLIFY_SITE_ID` / `NETLIFY_API_TOKEN` — public builds page
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — Web Push (generate via `npx web-push generate-vapid-keys`)
- `NEXT_PUBLIC_ENABLE_PWA` — set to `1` ONLY in production (GitHub env `cloudflare-production`, via `CLOUDFLARE_LIVE=1`) to enable SW registration
- `CAPTCHA_SECRET` — optional override (falls back to service-role key). Challenges are stored server-side (`captcha_challenges`): the token carries only a signed nonce, a correct answer consumes the challenge, and 3 attempts max are counted.
- `TURNSTILE_SECRET_KEY` — Cloudflare Turnstile (onboarding)
- `BOT_API_KEY` — legacy key for **non-v1 routes only** (`/api/news` ingest, `/api/support/ticket`). `/api/bot/v1/*` auth is now 100% per-tenant (`tenant_secrets`); the v1 env fallback + the `BOT_WEBHOOK_SECRET` webhook-signing fallback were removed, so `BOT_WEBHOOK_SECRET` is no longer read by the site.
- `BOT_WEBHOOK_URL` — bot webhook for site → bot events (prod `https://bot.owwomenscup.fr/bot/site-events`; guild inventory is resolved next to it). Unset → no HTTP push, events stay in the outbox for the bot's poller.
- `NEXT_PUBLIC_API_BASE_URL` / `NEXT_PUBLIC_API_REMOTE_PREFIXES` — browser-side cross-origin calls to `conference-api` ([utils/remoteApi.ts](utils/remoteApi.ts)); prod: `https://api.owwomenscup.fr` + `/api/public/`. Unset → no rewrite.
- `API_PROXY_PREFIXES` / `API_PROXY_ORIGIN` / `EDGE_PROXY_SECRET` — same-origin relay of `/api/*` to `conference-api` by the Worker ([cloudflare/worker.mjs](cloudflare/worker.mjs), [docs/EDGE-API-PROXY.md](docs/EDGE-API-PROXY.md)); prod: `/api/` (everything, wrangler.jsonc var). `EDGE_PROXY_SECRET` is a Worker secret: without it the API sees the Worker as a plain visitor (Host `api.owwomenscup.fr`, Cloudflare IP).
- `CRON_SECRET` — Worker secret for the scheduled tasks (and the API's `/api/cron/*` routes).
- `REVALIDATE_SECRET` — shared with conference-api for remote ISR regeneration (`/api/internal/revalidate`); `REVALIDATE_REMOTE_URL` must NEVER be set on the site (Worker).
- Worker secrets (`SUPABASE_SERVICE_ROLE_KEY`, `EDGE_PROXY_SECRET`, `CRON_SECRET`, `REVALIDATE_SECRET`) and the build-time `NEXT_PUBLIC_*` live in the GitHub environment `cloudflare-production`; the deploy workflow pushes the secrets to the Worker.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## graphify

Ce dépôt a un graphe de connaissances dans `graphify-out/` (ignoré par git, reconstruit par le hook post-commit). Utilise-le pour **trouver les fichiers et les liens avant de grepper** : c'est plus rapide et bien moins coûteux en tokens.

- Question sur le code (« où est… », « qui appelle… », « comment marche… ») : `graphify query "<question>"` d'abord (`--budget 800` pour borner la sortie). Relation entre deux concepts : `graphify path "<A>" "<B>"`. Un concept précis : `graphify explain "<concept>"`. Ces commandes renvoient un sous-graphe ciblé avec `src=` / `loc=` : ouvre ensuite directement ces fichiers.
- Grep/Read restent la règle pour modifier ou déboguer des lignes précises, une fois orienté.
- `graphify-out/GRAPH_REPORT.md` seulement pour une revue d'architecture large.
- Le hook post-commit met le graphe à jour (AST seul, sans coût LLM). Après des changements non commités importants : `graphify update .`
- Si `graphify` n'est pas trouvé : `python -m graphify …`.
