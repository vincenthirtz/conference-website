// features/admin/demandes/routes/assign.ts — POST /api/admin/demandes/[id]/assign
// « Je prends » / « Libérer » une demande (body `{ action: 'claim' | 'release' }`).
// Rôle minimum : caster, comme le traitement des demandes. 503 tant que la
// migration d'assignation n'est pas appliquée.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { AssignmentBody } from '../../_shared/assignmentSchemas';
import { DemandeIdQuery } from '../schemas';
import { assignDemande } from '../service/demandes';

export default defineAdminRoute({
  key: 'admin-demande-assign',
  guard: 'caster',
  POST: mutate({
    query: DemandeIdQuery,
    body: AssignmentBody,
    rateLimit: { max: 60, windowMs: 60_000 },
    // Slug existant : l'assignation se lit `payload.assignment`.
    audit: 'process_demande',
    handler: ({ query, body, ctx }) =>
      audited(ctx, assignDemande(ctx, query.id, body.action)),
  }),
});
