# Architecture

Next.js 16 (Pages Router) + Supabase + Tailwind CSS 4, déployé sur Netlify.

## Stack

- **Framework** : Next.js 16.1, React 19, TypeScript 5.9
- **Base de données** : Supabase (PostgreSQL + Auth + RLS)
- **Styling** : Tailwind CSS 4 + PostCSS
- **Animations** : Framer Motion
- **Tests** : Playwright (e2e uniquement)
- **Hébergement** : Netlify

## Structure des dossiers

```
pages/              → Pages + API routes (Pages Router)
  api/              → Routes API publiques
  api/admin/        → Routes API protégées (staff)
  admin/            → Pages back-office
components/         → Composants React réutilisables
utils/              → Logique métier
  staff.ts          → Auth staff, rôles, helpers SSR/API (source de vérité)
  staffLogs.ts      → Logs d'actions staff (insert, lecture, formatage)
  supabase.ts       → Clients Supabase (browser, server, admin)
  bracket/          → Logique bracket double-élim (graph, propagation, chemins)
  swiss/            → Système suisse (pairings, classements)
  matches/          → Scoring et auto-scheduling
config/             → Données statiques (socials, replays, links, teams, results)
hooks/              → useSiteSettings, useCookieConsent
database/           → Migrations SQL + seeds
types/              → Types partagés
tests/e2e/          → Tests Playwright
```

## Authentification & Autorisations

- **Supabase Auth** avec cookies côté serveur
- **Système staff** : table `staff` liée à `auth.users` via `auth_user_id`
- **Hiérarchie des rôles** : `owner (3) > admin (2) > manager (1) > caster (0)`
- **Protection API** : `withStaffRoute(handler, minRole)` — wrapper principal
- **Protection SSR** : `withStaffPage(minRole)` — pour les pages admin
- **Token** : Bearer token via header `Authorization`
- **Audit** : chaque action staff loggée dans `staff_logs` via `logStaffAction()`

## Clients Supabase

| Client                      | Usage                            | Fichier             |
| --------------------------- | -------------------------------- | ------------------- |
| `supabaseClient`            | Client-side (browser)            | `utils/supabase.ts` |
| `getServerClient(req, res)` | SSR / API routes (cookies)       | `utils/supabase.ts` |
| `supabaseAdmin`             | Admin (bypass RLS, service role) | `utils/supabase.ts` |

## Patterns clés

- API routes : Bearer token auth → `getStaffContextFromRequest(req, res)`
- Pages admin : `export const getServerSideProps = withStaffPage('manager')`
- Logs : `logStaffAction({ staff_id, action, entity_type, entity_id, ... })`
- Les routes publiques n'ont pas besoin d'auth
