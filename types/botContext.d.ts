// types/botContext.d.ts
//
// Augments NextApiRequest with the optional `botContext` field that
// `withBotRoute` (utils/botAuth.ts) attaches after authentication succeeds.
//
// The field is OPTIONAL on the type because:
//   - non-bot routes (admin, public, cron, helloasso, …) never set it;
//   - the `withBotRoute` wrapper guarantees it is present inside its handler
//     once auth passes, so downstream code can safely use a non-null
//     assertion or a runtime check.
//
// `tenantId` is always a `string` once set. On routes flagged
// `crossTenant: true` in `withBotRoute({ ... })` (global resolvers like
// /tenants/all-configs, /events/pending), `req.botContext` is intentionally
// left `undefined` and handlers must not read `tenantId`. On all other
// `/api/bot/v1/*` routes, the middleware enforces a valid tenant header
// (400/404 otherwise) so handlers can safely assume the field is set.

import 'next';
import type { TenantPlanState } from '../utils/billing/planFeatures';

declare module 'next' {
  interface NextApiRequest {
    botContext?: {
      /**
       * Resolved tenant UUID (lower-case). Populated by `withBotRoute` from
       * the `x-tenant-id` header, with a `DEFAULT_TENANT_ID` fallback when
       * the header is absent or malformed.
       */
      tenantId: string;
      /**
       * État plan `{ plan, plan_status, plan_expires_at }` du tenant, chargé par
       * `withBotRoute` UNIQUEMENT sur les routes premium (`requireCapability`).
       * `undefined` sur les routes de base (pas de round-trip). Le gate a déjà
       * refusé un tenant non entitled en 403 avant d'atteindre le handler.
       */
      plan?: TenantPlanState;
    };
    /**
     * Identité de la CLÉ qui a authentifié l'appel, posée par `withBotRoute`
     * sur TOUTES les routes — y compris `crossTenant`, où `botContext` reste
     * volontairement absent.
     *
     * `botContext.tenantId` dit « pour quel tenant cet appel agit » ;
     * `botKey` dit « qui appelle ». La distinction compte pour les résolveurs
     * globaux (outbox, all-configs) : le bot MUTUALISÉ a besoin de voir tous
     * les tenants pour router, un bot auto-hébergé ne doit voir que le sien.
     */
    botKey?: {
      /** Tenant propriétaire de la clé. */
      tenantId: string;
      /** Clé du bot mutualisé (`tenant_secrets.is_platform_key`). */
      isPlatformKey: boolean;
    };
    /**
     * Parsed + typed request body, set by `withBotRoute` when a `bodySchema`
     * is provided (non-safe methods only). Handlers read it via a cast to the
     * schema's inferred type: `const input = req.botInput as z.infer<typeof s>`.
     * Left `undefined` when no bodySchema is configured.
     */
    botInput?: unknown;
    /**
     * Parsed + typed query string, set by `withBotRoute` when a `querySchema`
     * is provided. Read via `req.botQuery as z.infer<typeof s>`.
     */
    botQuery?: unknown;
  }
}

export {};
