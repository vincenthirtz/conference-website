// features/admin/circuit-partners/routes/byId.ts — PATCH /api/admin/circuit-partners/[id]
//   { action: 'review', notes? }              → en cours d'examen (non journalisé)
//   { action: 'reject', notes }               → refusée (motif obligatoire)
//   { action: 'approve', tenantSlug, notes? } → plan offert posé sur l'espace
// Portée plateforme, comme la liste.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { ApplicationIdQuery, DecisionDoc } from '../schemas';
import { decideCircuitApplication } from '../service';

export default defineAdminRoute({
  key: 'admin-circuit-partner-id',
  guard: { permission: 'manage_tenant', scope: 'platform' },
  PATCH: mutate({
    query: ApplicationIdQuery,
    // Corps lu par le service : un échec rend le code historique VALIDATION.
    body: DecisionDoc,
    // Slug déclaré ; le refus le remplace (`reject_circuit_partner`) et la
    // mise en examen n'écrit rien — cf. service.
    audit: 'approve_circuit_partner',
    handler: ({ query, ctx, req }) =>
      audited(ctx, decideCircuitApplication(ctx, query.id, req.body)),
  }),
});
