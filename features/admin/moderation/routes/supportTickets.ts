// features/admin/moderation/routes/supportTickets.ts
// GET /api/admin/support/tickets — tickets du tenant actif, filtres
// (statut, sévérité, catégorie, tournoi, recherche) + compteurs du jeu filtré.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { SupportTicketListQuery } from '../schemas';
import { listSupportTickets } from '../service';

export default defineAdminRoute({
  key: 'admin-support-tickets',
  guard: { permission: 'moderate_support' },
  GET: read({
    query: SupportTicketListQuery,
    handler: ({ query, ctx }) => listSupportTickets(ctx, query),
  }),
});
