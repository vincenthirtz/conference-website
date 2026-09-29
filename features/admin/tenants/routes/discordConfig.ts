// features/admin/tenants/routes/discordConfig.ts — GET /api/admin/tenants/[id]/discord-config
// Config Discord de chaque serveur de l'espace (défauts si aucune ligne).
// admin+ effectif ET rattaché à l'espace (ou pôle-admin).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { IdQuery } from '../schemas';
import { staffScope } from '../service/scope';
import { listDiscordConfigs } from '../service/settings';

export default defineAdminRoute({
  key: 'admin-tenants-discord-config',
  guard: { permission: 'manage_settings' },
  GET: read({
    query: IdQuery,
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx, req }) =>
      listDiscordConfigs(ctx, staffScope(ctx.staff), req.query.id),
  }),
});
