// features/admin/circuit-partners/routes/index.ts — GET /api/admin/circuit-partners
// Candidatures, les plus récentes d'abord, avec le compte par statut.
// PORTÉE PLATEFORME, comme la file d'onboarding : un propriétaire d'espace
// tiers n'a ni à lire ces dossiers ni à s'en accorder un.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { CircuitApplicationListQuery } from '../schemas';
import { listCircuitApplications } from '../service';

export default defineAdminRoute({
  key: 'admin-circuit-partners',
  guard: { permission: 'manage_tenant', scope: 'platform' },
  GET: read({
    query: CircuitApplicationListQuery,
    handler: ({ query, ctx }) => listCircuitApplications(ctx, query),
  }),
});
