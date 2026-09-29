// features/admin/tenants/routes/pendingGuildLinkClaim.ts
// POST /api/admin/pending-guild-links/[guildId]/claim — rattache une guild en
// attente à un espace existant (`tenant_id`) ou créé à la volée (`new_tenant`).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { GuildClaimDoc, PendingGuildIdQuery } from '../schemas';
import { claimPendingGuild } from '../service/guildLinks';

export default defineAdminRoute({
  key: 'admin-pending-guild-claim',
  // Portée PLATEFORME : cf. pendingGuildLinks.ts.
  guard: { permission: 'manage_tenant', scope: 'platform' },
  POST: mutate({
    query: PendingGuildIdQuery,
    body: GuildClaimDoc,
    rateLimit: { max: 30, windowMs: 60_000 },
    audit: 'claim_guild_link',
    handler: ({ query, body, ctx }) =>
      audited(
        ctx,
        claimPendingGuild(ctx, query.guildId, body, ctx.staff.staff.id)
      ),
  }),
});
