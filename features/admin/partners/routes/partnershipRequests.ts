// features/admin/partners/routes/partnershipRequests.ts
// GET /api/admin/partnership-requests — liste paginée/filtrée des demandes
// de partenariat + compteurs par statut.
//
// Query : status, category, search (company_name / contact_name / email),
// orderBy (allowlist : created_at), orderDir (asc | desc, défaut desc),
// limit, offset, includeTotal (1 | true).
// Réponse : { items, counts, total }.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { parsePagination } from '@/utils/apiHelpers';
import { listPartnershipRequests } from '../service';

export default defineAdminRoute({
  key: 'partnership-requests',
  // Donnée d'association, pas de tenant : garde sur le rôle global.
  guard: { permission: 'manage_communications', scope: 'platform' },
  GET: read({
    handler: ({ req, ctx }) =>
      listPartnershipRequests(
        ctx,
        parsePagination(req, { limit: 50 }),
        req.query
      ),
  }),
});
