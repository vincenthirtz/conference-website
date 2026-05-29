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

declare module 'next' {
  interface NextApiRequest {
    botContext?: {
      /**
       * Resolved tenant UUID (lower-case). Populated by `withBotRoute` from
       * the `x-tenant-id` header, with a `DEFAULT_TENANT_ID` fallback when
       * the header is absent or malformed.
       */
      tenantId: string;
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
