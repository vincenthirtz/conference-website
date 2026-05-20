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
import { logger } from './logger';

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
