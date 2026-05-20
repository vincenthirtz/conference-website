# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint with auto-fix
npm run format       # Format code with Prettier
npm run format:check # Check formatting without changes
npm run test         # Run Playwright e2e tests
```

### Running a Single Test

```bash
npx playwright test tests/e2e/pages.spec.ts           # Run specific test file
npx playwright test -g "GET / renvoie du contenu"     # Run test by name pattern
```

Tests require `.env.local` with Supabase credentials. Set `TEST_BASE_URL` to override the default localhost URL.

## Architecture Overview

This is a **Next.js 16** conference/tournament website using the **Pages Router** with Supabase for authentication and data storage.

### Directory Structure

- **pages/** - Next.js pages and API routes
  - **pages/api/admin/** - Protected admin API endpoints (require staff authentication)
  - **pages/api/bot/v1/** - Discord-bot API. Shared contract documented in [docs/BOT_API_CONTRACT.md](docs/BOT_API_CONTRACT.md) (auth via `x-api-key` / `BOT_API_KEY`, idempotency, rate limits, endpoint inventory). Sibling repo: `docker-box/services/discord-bot/`.
  - **pages/api/** - Public API endpoints (matches, news, teams, Twitch integration)
  - **pages/admin/** - Admin dashboard pages (tournament management, teams, news, announcements)
- **components/** - React components (Navbar, Footer, forms, illustrations)
- **utils/** - Shared utilities
  - `supabase.ts` - Supabase client configuration (browser, server, admin clients)
  - `staff.ts` - Staff authentication, role management, and route protection helpers
  - **utils/bracket/** - Tournament bracket logic (graph building, path computation, propagation)
  - **utils/swiss/** - Swiss-system tournament pairing and standings
  - **utils/matches/** - Match scoring and auto-scheduling
- **config/** - Static configuration files (speakers, teams, social links, results)
- **tests/e2e/** - Playwright end-to-end tests

### Authentication & Authorization

Uses Supabase Auth with a custom staff system:

- `getServerClient(req, res)` - Server-side Supabase client with cookie handling
- `supabaseAdmin` - Admin client with service role (bypasses RLS)
- Staff roles hierarchy: `owner > admin > manager > caster`
- Use `withStaffRoute(handler, minRole)` to protect API routes
- Use `withStaffPage(minRole)` for SSR page protection

### Key Patterns

- API routes use Bearer token authentication via `Authorization` header
- Staff context retrieved via `getStaffContextFromRequest(req, res)`
- Staff actions are logged to `staff_logs` table via `logStaffAction()`
- Pages use `_app.tsx` layout with Navbar, Footer, and DefaultSeo components

## Project Policies

This is a zero-dependency project. Never add packages to dependencies or devDependencies without explicit approval. For CI-only tools, install them in the CI workflow directly.

## Commit Convention

This project follows Conventional Commits:

- `fix:` - Bug fixes (triggers PATCH release)
- `feat:` - New features (triggers MINOR release)
- `docs:` - Documentation only
- `chore:` - Cleanup/maintenance
- `refactor:` - Code refactoring
- Add `!` for breaking changes: `feat!:`, `fix!:`

## Git Workflow

After fixing files, always verify you haven't accidentally deleted or modified files outside the requested scope. Use `git diff --stat` to review all changed files before committing.

## Security / Code Quality

When fixing CodeQL or static analysis alerts, understand the tool's taint-tracking model before applying fixes. Simple runtime guards often don't satisfy static analyzers—prefer input validation at entry points and type-safe patterns like Map instead of plain objects.

## Testing

For E2E tests: never use `--ignore-pattern` with Playwright (invalid flag), use `--grep-invert` instead. Always check for transparent background inheritance when testing color contrast.

## Shell Commands

When using sed in zsh for multi-line insertions, prefer using a temp file approach or node -e scripts instead, as sed newline handling in zsh breaks imports.

## Environment Variables

Required in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` or `NEXT_SUPABASE_SERVICE_ROLE_KEY` - For admin operations
