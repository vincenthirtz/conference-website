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
// `tenantId` is always a `string` once set — we fall back to
// `DEFAULT_TENANT_ID` (utils/tenant.ts) when the bot omits the
// `x-tenant-id` header. No null/undefined slips through.

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
  }
}

export {};
