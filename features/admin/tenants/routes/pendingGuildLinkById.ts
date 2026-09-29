// features/admin/tenants/routes/pendingGuildLinkById.ts
// DELETE /api/admin/pending-guild-links/[guildId] — rejette une demande de
// lien guild → espace. (V1 : le `guild.leave()` côté bot reste manuel.)

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { PendingGuildIdQuery } from '../schemas';
import { rejectPendingGuild } from '../service/guildLinks';

export default defineAdminRoute({
  key: 'admin-pending-guild-reject',
  // Portée PLATEFORME : le propriétaire d'un espace porte `manage_tenant`
  // chez lui ; sans cette portée il agirait sur la file de TOUS les espaces.
  guard: { permission: 'manage_tenant', scope: 'platform' },
  DELETE: mutate({
    query: PendingGuildIdQuery,
    audit: 'reject_guild_link',
    handler: ({ query, ctx }) =>
      audited(ctx, rejectPendingGuild(ctx, query.guildId)),
  }),
});
