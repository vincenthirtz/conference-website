// features/admin/moderation/routes/supportTicketById.ts
// /api/admin/support/tickets/[id] — fiche, mise à jour (statut / note de
// résolution), suppression.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { SupportTicketPatchBody, TicketIdQuery } from '../schemas';
import {
  deleteSupportTicket,
  getSupportTicket,
  updateSupportTicket,
} from '../service';

export default defineAdminRoute({
  key: 'admin-support-ticket-id',
  guard: { permission: 'moderate_support' },
  GET: read({
    query: TicketIdQuery,
    handler: ({ query, ctx }) => getSupportTicket(ctx, query.id),
  }),
  PATCH: mutate({
    query: TicketIdQuery,
    body: SupportTicketPatchBody,
    audit: 'update_support_ticket',
    handler: ({ query, body, ctx }) =>
      audited(ctx, updateSupportTicket(ctx, query.id, body)),
  }),
  DELETE: mutate({
    query: TicketIdQuery,
    // Même slug qu'avant : la suppression se lit `payload.deleted`.
    audit: 'update_support_ticket',
    handler: ({ query, ctx }) =>
      audited(ctx, deleteSupportTicket(ctx, query.id)),
  }),
});
