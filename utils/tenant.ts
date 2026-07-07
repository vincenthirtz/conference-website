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
 *
 * Vide aussi les caches WHITELABEL (host → tenant_id et tenant_id → branding)
 * introduits plus bas, pour que les suites qui l'appellent en `beforeEach`
 * repartent d'un état propre.
 */
export function __resetTenantSlugCacheForTests(): void {
  tenantSlugCache.clear();
  tenantHostCache.clear();
  tenantBrandingCache.clear();
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
export async function getTenantIdBySlug(slug: string): Promise<string | null> {
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

/**
 * Version ASYNC du résolveur user-level (S7b).
 *
 * Pourquoi : le tenant d'une requête authentifiée = le tenant de l'équipe
 * dont le user est membre. On lit donc `team_members.tenant_id` pour le
 * `authUserId` courant. Aujourd'hui neutre (un seul tenant, toutes les rows
 * portent — ou héritent par fallback — `DEFAULT_TENANT_ID`), mais correct dès
 * qu'un 2e tenant existe : deux capitaines d'équipes de tenants différents
 * seront résolus vers leur tenant respectif au lieu du default hardcodé.
 *
 * Résolution :
 *   - `ctx.authUserId` + `supabaseAdmin` dispo → lookup
 *     `team_members.tenant_id` (1re membership) → renvoyé si trouvé.
 *   - Pas de membership / pas d'`authUserId` → fallback sur le résolveur
 *     public path-prefix (`resolveTenantIdForPublicRequestAsync`), qui lui
 *     retombe sur `DEFAULT_TENANT_ID` hors préfixe.
 *   - Erreur DB → warn + `DEFAULT_TENANT_ID`. Ne throw JAMAIS : la résolution
 *     de tenant ne doit pas casser un flow d'inscription/équipe.
 *
 * NB : le stub sync `resolveTenantIdForUserRequest` reste en place pour les
 * call sites legacy hors flow inscription/équipe.
 */
export async function resolveTenantIdForUserRequestAsync(
  req: RequestLike,
  ctx?: { authUserId?: string | null } | null
): Promise<string> {
  const authUserId = ctx?.authUserId;

  if (authUserId && supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin
        .from('team_members')
        .select('tenant_id')
        .eq('user_id', authUserId)
        .limit(1)
        .maybeSingle();

      if (error) {
        logger.warn(
          '[tenant] failed to resolve user tenant from membership, falling back to DEFAULT_TENANT_ID',
          { error: error.message }
        );
        return DEFAULT_TENANT_ID;
      }

      const tenantId = (data as { tenant_id?: string | null } | null)
        ?.tenant_id;
      if (typeof tenantId === 'string' && tenantId) {
        return tenantId;
      }
    } catch (err) {
      logger.warn(
        '[tenant] unexpected error resolving user tenant, falling back to DEFAULT_TENANT_ID',
        { error: err instanceof Error ? err.message : String(err) }
      );
      return DEFAULT_TENANT_ID;
    }
  }

  // Pas de membership (ou pas d'authUserId) → résolveur public path-prefix.
  return resolveTenantIdForPublicRequestAsync(req);
}

/* ===========================================================================
 * WHITELABEL — custom-domain resolution + per-tenant branding (S8)
 * ===========================================================================
 *
 * Le site est mono-tenant "par défaut" : logo `/img/logos/2025-logo.png`, nom
 * "OW Women's Cup", tokens `:root` statiques. Le whitelabel est une couche
 * d'OVERRIDE : quand une requête arrive sur un `custom_domain` connu, on lit
 * le branding du tenant (logo, couleurs, nom) et on l'injecte au SSR (cf.
 * `pages/_document.tsx`). En l'absence de custom-domain / de branding, on ne
 * renvoie RIEN et le rendu reste byte-identique au défaut historique.
 *
 * Deux caches mémoire (TTL 60s, negative caching) sur le même modèle que
 * `tenantSlugCache` :
 *   - `tenantHostCache`     : host normalisé → tenant_id | null
 *   - `tenantBrandingCache` : tenant_id      → TenantBranding | null
 */

/**
 * Branding public d'un tenant. `name` est toujours renseigné (fallback slug) ;
 * les autres champs sont `null` quand le tenant ne les a pas définis, auquel
 * cas le consommateur retombe sur sa constante par défaut.
 */
export type TenantBranding = {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  slug: string;
};

type TenantHostCacheEntry = {
  tenantId: string | null; // null = host confirmé sans tenant (negative cache)
  expiresAt: number;
};

type TenantBrandingCacheEntry = {
  branding: TenantBranding | null; // null = pas de branding custom (défaut)
  expiresAt: number;
};

const tenantHostCache = new Map<string, TenantHostCacheEntry>();
const tenantBrandingCache = new Map<string, TenantBrandingCacheEntry>();

/**
 * Couleur hex stricte (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`). Garde-fou
 * ANTI-INJECTION : ces valeurs sont interpolées dans un `<style>` inline au
 * SSR — on refuse tout ce qui n'est pas un hex pur pour empêcher une évasion
 * de contexte CSS (`}...{`, `url(...)`, etc.).
 */
const HEX_COLOR_RE =
  /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function sanitizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return HEX_COLOR_RE.test(trimmed) ? trimmed : null;
}

/**
 * Autorise un chemin racine (`/img/...`) ou une URL https absolue. On refuse
 * http/data:/javascript: — le logo est rendu via `next/image`/`<img>` et
 * l'`img-src` CSP n'autorise que `'self' data: blob: https:`. Les logos
 * custom sont attendus sur le storage Supabase (`**.supabase.co`, déjà dans
 * `next.config.js#images.remotePatterns`).
 */
function sanitizeLogoUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/')) return trimmed;
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  return null;
}

/**
 * Normalise un host : trim, lowercase, retrait du port et du point final.
 * Retourne `null` si vide. Ne gère pas les IPv6 littéraux entre crochets
 * (non pertinent pour un custom_domain).
 */
function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  let h = host.trim().toLowerCase();
  if (!h) return null;
  // Strip port (ex: "exemple.fr:3000" → "exemple.fr"). On ignore les IPv6
  // bracketés (présence de "]") pour ne pas tronquer une adresse.
  const colonIdx = h.lastIndexOf(':');
  if (colonIdx !== -1 && !h.includes(']')) h = h.slice(0, colonIdx);
  h = h.replace(/\.$/, ''); // FQDN trailing dot
  return h || null;
}

/**
 * Host propre à la plateforme (domaine « officiel » OW Women's Cup, previews
 * Netlify, dev local). Sur ces hosts on ne résout AUCUN tenant custom : le
 * défaut historique s'applique. Évite un lookup DB inutile à chaque requête
 * sur le domaine principal.
 */
function isPlatformDefaultHost(host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
    return true;
  }
  // Previews / branches Netlify (*.netlify.app) = plateforme, jamais un tenant.
  if (host.endsWith('.netlify.app')) return true;

  const defaults = new Set<string>(['owwomenscup.fr', 'www.owwomenscup.fr']);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    try {
      const parsed = new URL(siteUrl).hostname.toLowerCase();
      if (parsed) {
        defaults.add(parsed);
        defaults.add(
          parsed.startsWith('www.') ? parsed.slice(4) : `www.${parsed}`
        );
      }
    } catch {
      // NEXT_PUBLIC_SITE_URL mal formée → on ignore, les défauts hardcodés
      // suffisent.
    }
  }
  return defaults.has(host);
}

/**
 * Résout le tenant.id à partir du host de la requête (custom domain).
 *
 * - Host vide / plateforme (owwomenscup.fr, *.netlify.app, localhost) → `null`
 *   (pas de lookup, défaut appliqué).
 * - Host = `custom_domain` d'un tenant ACTIF → son tenant.id.
 * - Host inconnu → `null` (negative cache).
 *
 * Comparaison case-insensitive côté JS (on récupère tous les tenants ayant un
 * `custom_domain` non nul — une poignée de lignes — puis on matche le host
 * normalisé), ce qui reste correct quelle que soit la casse stockée en base.
 * Cache mémoire 60s.
 */
export async function resolveTenantIdByHost(
  host: string | null | undefined
): Promise<string | null> {
  const norm = normalizeHost(host);
  if (!norm || isPlatformDefaultHost(norm)) return null;

  const now = Date.now();
  const cached = tenantHostCache.get(norm);
  if (cached && cached.expiresAt > now) {
    return cached.tenantId;
  }

  if (!supabaseAdmin) {
    logger.warn(
      '[tenant] supabaseAdmin unavailable, cannot resolve tenant by host',
      { host: norm }
    );
    return null;
  }

  let tenantId: string | null = null;
  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('id, custom_domain, is_active')
      .not('custom_domain', 'is', null);

    if (error) {
      logger.warn('[tenant] failed to resolve host', {
        host: norm,
        error: error.message,
      });
      return null; // erreur transitoire → ne pas cacher un faux négatif
    }

    const rows =
      (data as
        | { id?: string; custom_domain?: string | null; is_active?: boolean }[]
        | null) ?? [];
    const match = rows.find(
      (r) =>
        typeof r.custom_domain === 'string' &&
        normalizeHost(r.custom_domain) === norm &&
        r.is_active !== false &&
        typeof r.id === 'string'
    );
    tenantId = match?.id ?? null;
  } catch (err) {
    logger.warn('[tenant] unexpected error resolving host', {
      host: norm,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  tenantHostCache.set(norm, {
    tenantId,
    expiresAt: now + TENANT_SLUG_CACHE_TTL_MS,
  });
  return tenantId;
}

/**
 * Lit le branding public d'un tenant.
 *
 * Retourne `null` (→ défaut appliqué) quand :
 *   - `tenantId` est le tenant par défaut,
 *   - le tenant est introuvable / inactif,
 *   - AUCUN champ de branding n'est défini (logo + primary + accent tous
 *     vides) : sans override visuel, on laisse le rendu par défaut intact.
 *
 * Sinon renvoie le branding complet (avec `name`/`slug`). Les couleurs sont
 * sanitizées en hex strict ; le logo en chemin racine ou https. Cache 60s.
 */
export async function readTenantBranding(
  tenantId: string
): Promise<TenantBranding | null> {
  if (!tenantId || tenantId === DEFAULT_TENANT_ID) return null;

  const now = Date.now();
  const cached = tenantBrandingCache.get(tenantId);
  if (cached && cached.expiresAt > now) {
    return cached.branding;
  }

  if (!supabaseAdmin) {
    logger.warn(
      '[tenant] supabaseAdmin unavailable, cannot read tenant branding',
      { tenantId }
    );
    return null;
  }

  let branding: TenantBranding | null = null;
  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('name, slug, logo_url, primary_color, accent_color, is_active')
      .eq('id', tenantId)
      .maybeSingle();

    if (error) {
      logger.warn('[tenant] failed to read branding', {
        tenantId,
        error: error.message,
      });
      return null; // erreur transitoire → ne pas cacher
    }

    const row = data as {
      name?: string | null;
      slug?: string | null;
      logo_url?: string | null;
      primary_color?: string | null;
      accent_color?: string | null;
      is_active?: boolean;
    } | null;

    if (row && row.is_active !== false) {
      const logoUrl = sanitizeLogoUrl(row.logo_url);
      const primaryColor = sanitizeHexColor(row.primary_color);
      const accentColor = sanitizeHexColor(row.accent_color);

      // Un override existe seulement si au moins un champ visuel est défini.
      if (logoUrl || primaryColor || accentColor) {
        const slug = typeof row.slug === 'string' ? row.slug : '';
        const name =
          typeof row.name === 'string' && row.name.trim()
            ? row.name.trim()
            : slug || "OW Women's Cup";
        branding = { name, slug, logoUrl, primaryColor, accentColor };
      }
    }
  } catch (err) {
    logger.warn('[tenant] unexpected error reading branding', {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  tenantBrandingCache.set(tenantId, {
    branding,
    expiresAt: now + TENANT_SLUG_CACHE_TTL_MS,
  });
  return branding;
}
