// utils/tenant.ts
//
// Phase 1 (multi-tenant) plumbing — V1 (S2).
//
// The site is in the middle of a single-tenant → multi-tenant migration. All
// 32 affected tables now carry a `tenant_id` column (Phase 1 DB migration is
// done). The Discord bot is being updated in parallel to send an
// `x-tenant-id: <uuid>` header on every call. The API needs to read that
// header and stash the resolved tenant id on `req.botContext` so future
// handler sweeps (S3-S4) can scope queries with `.eq('tenant_id', tenantId)`.
//
// V1 behaviour (this file): the header is OPTIONAL. If absent or malformed
// we fall back to `DEFAULT_TENANT_ID` (env var, defaults to the conference
// tenant UUID). This keeps the legacy bot deployments, manual scripts and
// existing tests working unchanged.
//
// V2 behaviour (post Phase 3): the header will become REQUIRED. Missing
// header → 400, unknown tenant → 404. That switch is owned by Phase 3, not
// here.

import type { NextApiRequest } from 'next';
import type { IncomingMessage } from 'http';
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
 * Public + user-level resolvers (S5c)
 * -----------------------------------------------------------------------
 *
 * V1 (mono-tenant) : on est sur un seul tenant — la home, les pages
 * `/tournois`, `/news`, `/teams`, etc. servent toujours le tenant
 * "conference". Les helpers ci-dessous existent pour :
 *   1. uniformiser la signature des handlers (toujours `resolveTenant*()`
 *      au lieu de coder en dur `DEFAULT_TENANT_ID`),
 *   2. flagger les TODO S7 de façon centralisée — la migration vers un
 *      modèle multi-tenant (subdomain ou path prefix `/conference/...`)
 *      ne touchera que ce fichier.
 *
 * V2 (post Phase 3) :
 *   - `resolveTenantIdForPublicRequest` lira le sous-domaine
 *     (`conference.foo.gg` → tenant "conference") ou le préfixe d'URL
 *     (`/conference/tournois` → tenant "conference").
 *   - `resolveTenantIdForUserRequest` se basera en priorité sur la team
 *     gérée par le user (team → tournament → tenant) puis fallback URL.
 *     Décision produit en attente : un user peut-il être capitaine sur 2
 *     tenants en même temps ? V1 dit non (1 team par user).
 *
 * Pour l'instant, les deux retournent `DEFAULT_TENANT_ID`. La signature
 * accepte cependant déjà `req` (et un `userContext` optionnel) pour
 * limiter les churn-diff lors du switch S7.
 */

/**
 * Résout le tenant pour une requête publique (anon, pas de session). En V1
 * tout est servi pour le tenant `DEFAULT_TENANT_ID`. Voir le commentaire de
 * tête pour la roadmap S7.
 *
 * Accepte aussi bien un `NextApiRequest` (handlers `/pages/api/*`) qu'un
 * `IncomingMessage` (le `req` exposé par `getServerSideProps`), ce qui permet
 * d'utiliser le même resolver dans les pages SSR publiques.
 */
export function resolveTenantIdForPublicRequest(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _req: RequestLike
): string {
  // TODO(S7) : résoudre depuis URL prefix ou subdomain.
  return DEFAULT_TENANT_ID;
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _req: RequestLike,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _userContext?: { authUserId?: string | null } | null
): string {
  // TODO(S7) : résoudre depuis l'équipe gérée par le user, ou via URL.
  return DEFAULT_TENANT_ID;
}
