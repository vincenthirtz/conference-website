// features/admin/moderation/routes/convertBlacklist.ts
// POST /api/admin/support/tickets/[id]/convert-blacklist — convertit un ticket
// en entrée de blacklist joueur (`kind: 'player'`) ou entité (`'entity'`).
// 409 si le ticket est déjà converti pour ce kind.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { ConvertBlacklistDoc, ConvertTicketIdQuery } from '../schemas';
import { convertTicketToBlacklist } from '../service';

export default defineAdminRoute({
  key: 'admin-support-convert-blacklist',
  guard: { permission: 'moderate_support' },
  POST: mutate({
    query: ConvertTicketIdQuery,
    body: ConvertBlacklistDoc,
    rateLimit: { max: 30, windowMs: 60_000 },
    status: 201,
    audit: 'support_ticket_convert_blacklist',
    // Corps BRUT au service : ses 400 gardent leur forme historique.
    handler: ({ query, ctx, req }) =>
      audited(ctx, convertTicketToBlacklist(ctx, query.id, req.body)),
  }),
});
