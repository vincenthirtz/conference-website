// features/admin/tenants/routes/botInvite.ts — GET /api/admin/tenants/[id]/bot-invite
// Lien d'invitation du bot signé POUR CET espace (`?guildId=` pré-sélection).
// Owner de la PLATEFORME. Le lien porte un state signé : jamais de cache.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { BotInviteQuery } from '../schemas';
import { staffScope } from '../service/scope';
import { getBotInvite } from '../service/tenants';

export default defineAdminRoute({
  key: 'admin-tenant-bot-invite',
  guard: { permission: 'manage_tenant', scope: 'platform' },
  GET: read({
    query: BotInviteQuery,
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: ({ ctx, req }) =>
      getBotInvite(ctx, staffScope(ctx.staff), req.query.id, req.query.guildId),
  }),
});
