// features/admin/tenants/routes/discordConfigGuild.ts
// PUT /api/admin/tenants/[id]/discord-config/[guildId] — upsert de la config
// d'un serveur de l'espace (whitelist de champs, snowflakes validés).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { DiscordConfigDoc, TenantGuildQuery } from '../schemas';
import { staffScope } from '../service/scope';
import { saveDiscordConfig } from '../service/settings';

export default defineAdminRoute({
  key: 'admin-tenants-discord-config-put',
  guard: { permission: 'manage_settings' },
  PUT: mutate({
    query: TenantGuildQuery,
    body: DiscordConfigDoc,
    rateLimit: { max: 60, windowMs: 60_000 },
    audit: 'update_tenant_discord_config',
    handler: ({ ctx, req }) =>
      audited(
        ctx,
        saveDiscordConfig(
          ctx,
          staffScope(ctx.staff),
          req.query.id,
          req.query.guildId,
          req.body
        )
      ),
  }),
});
