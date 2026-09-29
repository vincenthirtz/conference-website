// features/admin/tenants/routes/discordChannels.ts
// GET /api/admin/tenants/[id]/discord-config/[guildId]/channels — salons et
// rôles du serveur, relayés par le bot (appel signé HMAC).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { TenantGuildQuery } from '../schemas';
import { staffScope } from '../service/scope';
import { guildInventory } from '../service/settings';

export default defineAdminRoute({
  key: 'admin-discord-guild-inventory',
  guard: { permission: 'manage_settings' },
  GET: read({
    query: TenantGuildQuery,
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: ({ ctx, req }) =>
      guildInventory(
        ctx,
        staffScope(ctx.staff),
        req.query.id,
        req.query.guildId
      ),
  }),
});
