// utils/onboardSlug.ts
//
// Règles de slug du parcours d'onboarding — module PUR, aucun import.
//
// Extrait de `utils/onboard.ts`, qui porte aussi les schémas zod du
// POST /api/onboard/tenant-request : les pages `/onboard/*` n'ont besoin que
// des règles de slug, et les importer depuis `onboard.ts` embarquait zod
// (62 KB gzip) dans leur bundle client. Même raison d'être que
// `utils/teams/roleKind.ts`.
//
// `utils/onboard.ts` les ré-exporte pour ne pas casser les imports serveur.

// ---------------------------------------------------------------------------
// Slug rules
// ---------------------------------------------------------------------------

/**
 * Slug format : starts with a lowercase letter, then lowercase letters/digits/
 * hyphens, 3-30 chars total (`^[a-z][a-z0-9-]{2,29}$`).
 *
 * Stricter than the DB CHECK on `tenants.slug` (which allows `[a-z0-9-]+`,
 * 2-50 chars) on purpose : the request-side rule should always be a subset
 * of the DB rule so the latter never trips at insert.
 */
export const ONBOARD_SLUG_RE = /^[a-z][a-z0-9-]{2,29}$/;

/**
 * Slugs we never want users to claim — collide with URL prefixes, brand
 * surface area, or sensitive routes.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'auth',
  'bot',
  'conference',
  'demo',
  'docs',
  'help',
  'login',
  'logout',
  'onboard',
  'onboarding',
  'owner',
  'public',
  'root',
  'static',
  'staff',
  'staging',
  'support',
  'test',
  'tests',
  'www',
  '_next',
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}
