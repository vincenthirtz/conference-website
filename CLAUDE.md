# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
npm run dev              # Start development server (Next.js)
npm run build            # Production build
npm run start            # Start production server
npm run lint             # ESLint with auto-fix
npm run format           # Prettier write
npm run format:check     # Prettier check
npm run test             # Playwright e2e tests (94 specs)
npm run test:unit        # Vitest unit tests (~174 specs)
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

**Next.js 16** (Pages Router) + **React 19** + **Supabase** (Postgres + Auth + Realtime) + **Tailwind v4**. Deployed on **Netlify** (`@netlify/plugin-nextjs`), with scheduled functions for cron-style workloads.

The site sits at the center of a small ecosystem:

- **`conference-website`** (this repo) — public site, admin dashboard, REST API, PWA, caster cockpit.
- **`docker-box/services/discord-bot`** (sibling) — Discord bot that consumes `/api/bot/v1/*`.
- **`womenscup-caster`** (sibling) — separate caster-tooling repo.

### Directory Structure

- **pages/** — Next.js pages and API routes
  - **pages/api/admin/** — staff-gated admin endpoints (cookie session)
  - **pages/api/bot/v1/** — Discord-bot API. Contract: [docs/BOT_API_CONTRACT.md](docs/BOT_API_CONTRACT.md). Auth: `x-api-key` per-tenant (+ legacy env fallback) and `x-tenant-id`. Idempotency + rate limits. Sibling repo: `docker-box/services/discord-bot/`.
  - **pages/api/caster/** — caster-cockpit endpoints (caster session)
  - **pages/api/player/** — player espace endpoints (user session)
  - **pages/api/cron/** — invoked by Netlify scheduled functions
  - **pages/api/** — public endpoints (matches, news, teams, Twitch, HelloAsso, captcha, support)
  - **pages/admin/** — admin dashboard (tournaments, teams, news, broadcast, scrims, disputes, demandes, onboarding queue, site settings, stats, logs, users, etc.)
  - **pages/caster/** — caster cockpit (`/caster/cockpit`)
  - **pages/player/** — player espace (`/player/*`)
  - **pages/onboard/** — self-service tenant onboarding flow ([docs/ONBOARDING.md](docs/ONBOARDING.md))
  - **pages/[tenantSlug]/** — multi-tenant path-prefix routes (POC: `tournois.tsx`)
- **components/** — React components. `components/admin/*` is admin-only. `components/Caster/*` is caster-cockpit. Public landing/UX components live at the root.
- **utils/** — shared logic (see "Key Modules" below)
- **hooks/** — React hooks (`useStaffSession`, `useCasterSession`, `usePlayerSession`, `useAdminFetch`, `useIdempotentMutation`, `useRealtimeChannel`, `useDraftState`, `useDraftTimer`, `useEventRunRealtime`, `useWakeLock`, `useOnlineStatus`, `useCookieConsent`, …)
- **types/** — domain TS types (`bracket`, `swiss`, `draft`, `events`, `matches`, `stages`, `staff`, `validation`, …)
- **config/** — static config (speakers, teams, social links, past results)
- **database/** — Postgres SQL
  - **database/migrations/** — versioned migrations (~119 files)
  - **database/seeds/** — seed data
  - Loose `*.sql` patches at root (legacy)
- **netlify/functions/** — Netlify scheduled functions (cron entry points calling `/api/cron/*`)
- **docs/** — [BOT_API_CONTRACT.md](docs/BOT_API_CONTRACT.md), [ONBOARDING.md](docs/ONBOARDING.md), [openapi.yaml](docs/openapi.yaml)
- **tests/e2e/** — Playwright specs (~94)
- **tests/unit/** — Vitest specs (~174, heavy API-route coverage with in-memory Supabase mock under `tests/unit/__helpers__/`)
- **scripts/** — small ops scripts (`create-team-news.mjs`, `merge-openapi.mjs`)
- **proxy.ts** — Edge middleware: per-request CSP nonce, Turnstile allowances, PWA worker/manifest allowances

### Key Modules (utils/)

- `supabase.ts` + `supabaseAdmin.ts` — browser/server clients (cookies via `@supabase/ssr`) and admin client (service role, bypasses RLS).
- `staff.ts` — staff auth, roles, CSRF (`csrfCheck`), `withStaffRoute(handler, minRole)`, `withStaffPage(minRole, loader?)`, `getStaffContextFromRequest`. Roles: `owner > admin > manager > caster`.
- `casterAuth.ts` — caster-cockpit auth.
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
- `castEvents.ts` + `broadcast/liveState.ts` + `broadcasts.ts` — caster/cockpit + broadcast workflows.
- `discord.ts` + `discordLinks.ts` — Discord helpers + link tokens.
- `helloasso.ts` — HelloAsso integration.
- `twitch.ts` — Twitch OAuth + live status.
- `validation.ts` — zod schemas for API inputs.

### Authentication & Authorization

Three distinct session surfaces, all backed by Supabase Auth:

| Surface             | Helper                                | Storage  | Notes                                              |
| ------------------- | ------------------------------------- | -------- | -------------------------------------------------- |
| Public/player       | `getServerClient(req, res)`           | Cookies  | RLS-enforced; user-bearer for API routes           |
| Admin/staff         | `withStaffRoute` / `withStaffPage`    | Cookies  | Role gate `owner > admin > manager > caster`       |
| Caster cockpit      | `casterAuth.ts`                       | Cookies  | Separate gate; `useCasterSession` on client        |
| Discord bot         | `withBotAuth` (per-tenant `x-api-key`) | Header   | Bypasses RLS via `supabaseAdmin`; logs actor       |

- Staff actions are logged to `staff_logs` via `logStaffAction()`.
- Admin mutations should be wrapped: `withStaffRoute(withAdminIdempotency(handler, { key }), 'admin')`.
- CSRF: `withStaffRoute` enforces origin/referer match on state-changing methods.

### PWA + Web Push

- Service worker at `public/sw.js`, manifest at `public/site.webmanifest`. Registered with scope `/` (header `Service-Worker-Allowed: /` set in `netlify.toml`).
- Gated by `NEXT_PUBLIC_ENABLE_PWA=1` — set ONLY on prod/master to avoid SW cache pollution on previews/dev.
- Push: VAPID keypair (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`). Dispatcher cron `*/1` fans out `bot_event_outbox` rows to `web_push_deliveries`.
- Client opt-in: `components/admin/PushOptIn.tsx`. Player-side push wired in Lot 13.A/B.

### Netlify Scheduled Functions (cron)

Defined in `netlify.toml`, each calls a `pages/api/cron/*` handler:

- `checkin-cron` `*/5` — per-match check-in (emails T-1h, Discord T-30/T-15, auto-forfeit T-0)
- `broadcast-cron` `0 10 * * *` — daily broadcast email waves (Brevo 300/day cap)
- `outbox-maintenance-cron` `0 * * * *` — `bot_event_outbox` hygiene + latency stats
- `web-push-dispatcher-cron` `* * * * *` — outbox → Web Push fan-out
- `overrun-watcher-cron` `*/2` — server-side fallback for cue overruns
- `dispute-sla-cron` `*/5` — dispute SLA breach detector
- `sync-game-heroes-cron` `0 4 * * *` — refresh LoL/Dota hero pool
- `draft-auto-pick-cron` `* * * * *` — server-side draft timer (auto-pick)

### Multi-tenant (in progress)

Phase 1 (DB) done — 32 tables now carry `tenant_id`. Phase 2 (bot) sends `x-tenant-id`. Phase 3 (public pages) uses **path-prefix** routes: `pages/[tenantSlug]/...` (POC: `tournois.tsx`). Legacy unprefixed pages fall back to `DEFAULT_TENANT_ID` (conference) until the second tenant ships. See `utils/tenant.ts` for the contract.

### Key Patterns

- API auth: bearer token in `Authorization` header for user routes; cookie session for admin/caster; `x-api-key` for bot.
- Pages use `_app.tsx` layout with `Navbar`, `Footer`, `DefaultSeo`, `ErrorBoundary`, `ToastProvider`. `/admin` and `/caster` routes skip the public chrome.
- Validation: zod schemas in `utils/validation.ts`. Validate at entry points.
- Realtime: `useRealtimeChannel` / `useEventRunRealtime` / `usePublicEventRunRealtime` wrap Supabase Realtime.

## Project Policies

**Zero-dependency policy.** Never add packages to `dependencies` / `devDependencies` without explicit approval. For CI-only tools, install them in the CI workflow directly. (Current deps are intentionally minimal — see `package.json`.)

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
- Coverage excludes `pages/api/blizzard-media.ts` (~1500 lines of static fallback data, drags totals), `utils/useAutoSave.ts` / `utils/useUrlFilters.ts` (would need `@testing-library/react`, forbidden by zero-dep policy).

## Shell Commands

- This repo runs on Windows (PowerShell). When editing multiline strings via shell, prefer Edit/Write tools or `node -e` scripts over `sed` — sed newline handling differs across shells and can corrupt imports.

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
- `NEXT_PUBLIC_ENABLE_PWA` — set to `1` ONLY on master/prod to enable SW registration
- `CAPTCHA_SECRET` — optional override (falls back to service-role key)
- `TURNSTILE_SECRET_KEY` — Cloudflare Turnstile (onboarding)
- `BOT_API_KEY` — legacy key for **non-v1 routes only** (`/api/news` ingest, `/api/support/ticket`). `/api/bot/v1/*` auth is now 100% per-tenant (`tenant_secrets`); the v1 env fallback + the `BOT_WEBHOOK_SECRET` webhook-signing fallback were removed, so `BOT_WEBHOOK_SECRET` is no longer read by the site.
