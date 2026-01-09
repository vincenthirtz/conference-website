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
- Staff roles hierarchy: `owner > admin > manager > referee > caster > helper`
- Use `withStaffRoute(handler, minRole)` to protect API routes
- Use `withStaffPage(minRole)` for SSR page protection

### Key Patterns

- API routes use Bearer token authentication via `Authorization` header
- Staff context retrieved via `getStaffContextFromRequest(req, res)`
- Staff actions are logged to `staff_logs` table via `logStaffAction()`
- Pages use `_app.tsx` layout with Navbar, Footer, and DefaultSeo components

## Commit Convention

This project follows Conventional Commits:
- `fix:` - Bug fixes (triggers PATCH release)
- `feat:` - New features (triggers MINOR release)
- `docs:` - Documentation only
- `chore:` - Cleanup/maintenance
- `refactor:` - Code refactoring
- Add `!` for breaking changes: `feat!:`, `fix!:`

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` or `NEXT_SUPABASE_SERVICE_ROLE_KEY` - For admin operations
