// features/admin/demandes/routes/byId.ts — GET /api/admin/demandes/[id]
// Fiche d'une demande avec ses relations (rôle minimum : caster, le support
// traite les demandes).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { DemandeIdQuery } from '../schemas';
import { getDemande } from '../service/demandes';

export default defineAdminRoute({
  key: 'admin-demande-id',
  guard: 'caster',
  GET: read({
    query: DemandeIdQuery,
    handler: ({ query, ctx }) => getDemande(ctx, query.id),
  }),
});
