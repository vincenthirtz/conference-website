// features/admin/moderation/routes/supportTicketAssign.ts —
// POST /api/admin/support/tickets/[id]/assign : « Je prends » / « Libérer »
// un ticket (body `{ action: 'claim' | 'release' }`). 503 tant que la
// migration d'assignation n'est pas appliquée.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { AssignmentBody } from '../../_shared/assignmentSchemas';
import { TicketIdQuery } from '../schemas';
import { assignSupportTicket } from '../service';

export default defineAdminRoute({
  key: 'admin-support-ticket-assign',
  guard: { permission: 'moderate_support' },
  POST: mutate({
    query: TicketIdQuery,
    body: AssignmentBody,
    rateLimit: { max: 60, windowMs: 60_000 },
    // Même slug que la mise à jour : l'assignation se lit `payload.assignment`.
    audit: 'update_support_ticket',
    handler: ({ query, body, ctx }) =>
      audited(ctx, assignSupportTicket(ctx, query.id, body.action)),
  }),
});
