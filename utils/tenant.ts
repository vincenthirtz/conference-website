// utils/tenant.ts
//
// Phase 1 (multi-tenant) plumbing — V1 (S2) + path-prefix POC (S7a).
//
// ============================================================================
// Multi-tenant strategy — public pages
// ============================================================================
//
// The site is migrating from single-tenant to multi-tenant. Phase 1 (DB) is
// done : 32 tables now carry a `tenant_id`. Phase 2 (bot) is in progress
// and ships `x-tenant-id: <uuid>` headers. Phase 3 (public pages) follows
// the path-prefix decision documented in
// `MEMORY.md::multi-tenant-bot-decisions` :
//
//   - URLs publiques = path-prefix (`/conference/tournois`,
//     `/esport-club/tournois`). Pas de subdomain.
//   - Route Next.js dynamique `pages/[tenantSlug]/...`.
//   - Le tenant est résolu via le 1er segment du path, puis lookup
//     `tenants.slug → tenants.id` (cache mémoire 60s, voir `tenantSlugCache`
//     plus bas).
//   - Pages legacy (sans prefix tenant) → fallback `DEFAULT_TENANT_ID`
//     (= conference) pour ne rien casser tant que le 2e tenant n'est pas
//     en ligne.
//
// POC : la page `pages/[tenantSlug]/tournois.tsx` montre le pattern. Elle
// importe `components/Tournaments/TournamentsList.tsx` (factorisé depuis
// `pages/tournaments.tsx`) et passe `tenantId` en prop. La page legacy
// `pages/tournaments.tsx` continue de marcher à l'identique.
//
// TODO(S7) — migration des autres pages publiques mono-tenant :
//   - pages/index.tsx
//   - pages/association.tsx
//   - pages/timeline-2026.tsx
//   - pages/scrim.tsx
//   - pages/scrims.tsx
//   - pages/live.tsx (passer en getServerSideProps avant)
//   - pages/tournament/[id].tsx (+ ses sous-pages maps/mvp/stats/matches/teams)
//   - pages/match/[id].tsx (+ games)
//   - pages/team/[slug]/index.tsx
//   - pages/news/[slug].tsx
//   - pages/actualites.tsx
// Pattern : extraire le contenu en composant, créer une variante sous
// `pages/[tenantSlug]/...` qui appelle `getTenantIdBySlug(slug)` (ou
// `resolveTenantIdForPublicRequestAsync(req)`) en SSR (404 si tenant
// inconnu), réutiliser le composant.
//
// ============================================================================
// Bot side (unchanged)
// ============================================================================
//
// V1 behaviour (`resolveTenantId`): the header is OPTIONAL. If absent or
// malformed we fall back to `DEFAULT_TENANT_ID`. This keeps the legacy bot
// deployments, manual scripts and existing tests working unchanged.
//
// V2 behaviour (post Phase 3): the header will become REQUIRED. Missing
// header → 400, unknown tenant → 404. That switch is owned by Phase 3, not
// here.

import type { NextApiRequest } from 'next';
import type { IncomingMessage } from 'http';
import { supabaseAdmin } from './supabase';
import { logger } from './logger';

/**
 * Minimal "request-like" shape that both Next API routes (`NextApiRequest`)
 * and `getServerSideProps` (`IncomingMessage`) satisfy. Used by the public /
 * user-level resolvers below since they only inspect `req.headers`.
 */
type RequestLike =
  | NextApiRequest
  | IncomingMessage
  | { headers: Record<string, string | string[] | undefined> };

/**
 * Default tenant UUID — the "conference" tenant, hardcoded as a safety net
 * so the API keeps working even if the env var is unset on a freshly
 * provisioned environment. Mirrors the row in the `tenants` table.
 */
export const DEFAULT_TENANT_ID: string =
  process.env.DEFAULT_TENANT_ID ?? 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

/**
 * RFC 4122 UUID matcher. Accepts any version (v1-v5) but the bot is expected
 * to send v4. Case-insensitive.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve the tenant id for a bot request.
 *
 * - Valid `x-tenant-id` UUID header → returned as-is (lower-cased for
 *   normalisation downstream).
 * - Missing header → `DEFAULT_TENANT_ID` (no warning, expected during V1).
 * - Malformed header → `DEFAULT_TENANT_ID` + warn log (likely client bug).
 *
 * No DB lookup here — we don't yet validate that the tenant row exists.
 * That check moves in with Phase 3 / S6.
 */
export function resolveTenantId(req: NextApiRequest): string {
  const raw = req.headers['x-tenant-id'];
  const header = Array.isArray(raw) ? raw[0] : raw;

  if (header === undefined || header === null || header === '') {
    return DEFAULT_TENANT_ID;
  }

  if (typeof header !== 'string') {
    logger.warn(
      '[bot/tenant] x-tenant-id header is not a string, falling back to DEFAULT_TENANT_ID',
      { received: typeof header }
    );
    return DEFAULT_TENANT_ID;
  }

  if (!UUID_RE.test(header)) {
    logger.warn(
      '[bot/tenant] x-tenant-id header is not a valid UUID, falling back to DEFAULT_TENANT_ID',
      { received: header }
    );
    return DEFAULT_TENANT_ID;
  }

  return header.toLowerCase();
}

/* -----------------------------------------------------------------------
 * Public + user-level resolvers (S5c → S7a)
 * -----------------------------------------------------------------------
 *
 * Deux résolveurs publics :
 *
 *   - `resolveTenantIdForPublicRequest(req)` — **sync**, legacy. Renvoie
 *     toujours `DEFAULT_TENANT_ID`. Utilisé par les ~45 call sites
 *     historiques (API handlers + getServerSideProps mono-tenant). NE PAS
 *     casser cette signature tant que toutes les pages legacy n'ont pas
 *     migré vers la version path-prefix (cf. liste TODO en tête de fichier).
 *
 *   - `resolveTenantIdForPublicRequestAsync(req)` — **async**, path-prefix.
 *     Extrait le 1er segment du path, lookup `tenants.slug → tenants.id`,
 *     cache 60s. Fallback `DEFAULT_TENANT_ID` si pas de prefix / slug
 *     inconnu. C'est ce que les nouvelles pages `pages/[tenantSlug]/...`
 *     doivent utiliser.
 *
 *   - `getTenantIdBySlug(slug)` — primitive bas-niveau exposée pour les
 *     pages qui veulent décider d'un 404 si le slug ne matche pas (utile
 *     dans `getServerSideProps` de `pages/[tenantSlug]/tournois.tsx`).
 *
 * `resolveTenantIdForUserRequest` reste mono-tenant en V1 — voir le TODO
 * dédié.
 */

/* -----------------------------------------------------------------------
 * Tenant slug cache (in-memory, TTL 60s)
 * ----------------------------------------------------------------------- */

type TenantSlugCacheEntry = {
  tenantId: string | null; // null = slug confirmé inconnu (negative cache)
  expiresAt: number; // ms epoch
};

const TENANT_SLUG_CACHE_TTL_MS = 60_000;

/**
 * Map slug → { tenantId, expiresAt }. Module-scope = process-wide.
 *
 * Choix `Map` plutôt que `WeakMap` : les clés sont des strings (pas
 * GC-able via WeakMap) et on veut une éviction par TTL, pas par GC. Le set
 * de tenants change rarement (création manuelle via admin), un TTL de 60s
 * est un bon compromis fraîcheur / latence.
 *
 * Pas de pruning actif : un entry expiré est simplement ignoré à la
 * lecture. Si le set grossit sans limite (improbable, on parle d'une
 * dizaine de tenants max), il faudra ajouter un LRU.
 *
 * Exporté pour `__resetTenantSlugCacheForTests` (utilisé en unit tests).
 */
const tenantSlugCache = new Map<string, TenantSlugCacheEntry>();

/**
 * Reset le cache. À usage strictement test.
 */
export function __resetTenantSlugCacheForTests(): void {
  tenantSlugCache.clear();
}

const SLUG_RE = /^[a-z0-9-]+$/;
const RESERVED_PATH_SEGMENTS = new Set([
  'api',
  '_next',
  'admin',
  'auth',
  'static',
  'public',
]);

/**
 * Lookup `tenants.slug → tenants.id`. Cache 60s.
 *
 * Renvoie `null` si :
 *   - slug invalide (format),
 *   - tenant inexistant,
 *   - tenant `is_active = false`,
 *   - `supabaseAdmin` indisponible (env mal configurée — log + null).
 */
export async function getTenantIdBySlug(
  slug: string
): Promise<string | null> {
  if (!slug || !SLUG_RE.test(slug)) return null;

  const now = Date.now();
  const cached = tenantSlugCache.get(slug);
  if (cached && cached.expiresAt > now) {
    return cached.tenantId;
  }

  if (!supabaseAdmin) {
    logger.warn(
      '[tenant] supabaseAdmin unavailable, cannot resolve tenant slug',
      { slug }
    );
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, is_active')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    logger.warn('[tenant] failed to resolve slug', {
      slug,
      error: error.message,
    });
    return null;
  }

  const row = data as { id?: string; is_active?: boolean } | null;
  const tenantId =
    row && row.is_active !== false && typeof row.id === 'string'
      ? row.id
      : null;

  tenantSlugCache.set(slug, {
    tenantId,
    expiresAt: now + TENANT_SLUG_CACHE_TTL_MS,
  });

  return tenantId;
}

/**
 * Extrait le 1er segment du path. Retourne `null` si :
 *   - pas d'url,
 *   - 1er segment vide / réservé (api, _next, admin, …),
 *   - segment ne ressemble pas à un slug (format).
 */
function extractTenantSlugFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  // strip query/hash
  const pathOnly = url.split(/[?#]/, 1)[0] ?? url;
  const trimmed = pathOnly.replace(/^\/+/, '');
  if (!trimmed) return null;
  const first = trimmed.split('/', 1)[0]?.toLowerCase() ?? '';
  if (!first || RESERVED_PATH_SEGMENTS.has(first)) return null;
  if (!SLUG_RE.test(first)) return null;
  return first;
}

/**
 * Résout le tenant pour une requête publique (anon, pas de session).
 *
 * Version SYNC, legacy. Renvoie toujours `DEFAULT_TENANT_ID`. Utilisée par
 * tous les call sites historiques (~45 fichiers en `pages/api/*` et
 * quelques `getServerSideProps`) qui ne sont pas encore path-prefix.
 *
 * Pour le path-prefix multi-tenant, utiliser
 * `resolveTenantIdForPublicRequestAsync` (async, lookup DB) ou
 * `getTenantIdBySlug` (primitive bas-niveau, pour 404).
 *
 * Accepte aussi bien un `NextApiRequest` (handlers `/pages/api/*`) qu'un
 * `IncomingMessage` (le `req` exposé par `getServerSideProps`).
 */
export function resolveTenantIdForPublicRequest(_req: RequestLike): string {
  // TODO(S7) : à terme cette fonction sera supprimée au profit de
  // `resolveTenantIdForPublicRequestAsync`. Pour l'instant on garde le
  // fallback mono-tenant pour ne pas casser les 45 call sites legacy.
  return DEFAULT_TENANT_ID;
}

/**
 * Version path-prefix du résolveur public (S7a).
 *
 * - Path préfixé d'un slug connu (`/conference/tournois`) → tenant.id du
 *   slug.
 * - Path sans préfixe (`/tournois`) → `DEFAULT_TENANT_ID` (rétro-compat).
 * - Path avec slug inconnu → `DEFAULT_TENANT_ID` (les pages dynamiques
 *   `pages/[tenantSlug]/...` peuvent appeler `getTenantIdBySlug` directement
 *   pour 404).
 *
 * Cache mémoire 60s sur le mapping slug → tenant_id (voir
 * `tenantSlugCache`).
 */
export async function resolveTenantIdForPublicRequestAsync(
  req: RequestLike
): Promise<string> {
  const url = (req as { url?: string }).url;
  const slug = extractTenantSlugFromUrl(url);
  if (!slug) return DEFAULT_TENANT_ID;

  const tenantId = await getTenantIdBySlug(slug);
  return tenantId ?? DEFAULT_TENANT_ID;
}

/**
 * Résout le tenant pour une requête user-level (capitaine/manager, session
 * Supabase active). En V1 mono-tenant, default `DEFAULT_TENANT_ID`. À terme,
 * on lira d'abord la team gérée par le user, puis fallback URL.
 *
 * Comme `resolveTenantIdForPublicRequest`, accepte n'importe quel `req`
 * exposant `headers` (NextApiRequest ou IncomingMessage SSR).
 */
export function resolveTenantIdForUserRequest(
  _req: RequestLike,
  _userContext?: { authUserId?: string | null } | null
): string {
  // TODO(S7) : résoudre depuis l'équipe gérée par le user, ou via URL.
  return DEFAULT_TENANT_ID;
}
