// features/admin/tenants/routes/guilds.ts — POST /api/admin/tenants/[id]/guilds
// Rattache un serveur Discord à l'espace : 201 `linked`, 200 `already_linked`
// (sans journal), 409 si rattaché ailleurs. Owner de la PLATEFORME.

import {
  defineAdminRoute,
  mutate,
  RESPONSE_SENT,
} from '@/utils/admin/defineAdminRoute';
import { AttachGuildDoc, IdQuery } from '../schemas';
import { staffScope } from '../service/scope';
import { attachGuild } from '../service/tenants';

export default defineAdminRoute({
  key: 'admin-tenant-attach-guild',
  guard: { permission: 'manage_tenant', scope: 'platform' },
  POST: mutate({
    query: IdQuery,
    body: AttachGuildDoc,
    rateLimit: { max: 30, windowMs: 60_000 },
    audit: 'claim_guild_link',
    handler: async ({ ctx, req, res }) => {
      const { status, result, audit } = await attachGuild(
        ctx,
        staffScope(ctx.staff),
        req.query.id,
        req.body
      );
      ctx.audit(audit);
      // Deux succès distincts (200 / 201) : le statut suit le résultat.
      res.status(status).json(result);
      return RESPONSE_SENT;
    },
  }),
});
