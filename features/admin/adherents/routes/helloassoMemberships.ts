// features/admin/adherents/routes/helloassoMemberships.ts
// GET /api/admin/helloasso/memberships — adhésions HelloAsso (lecture seule).

import {
  defineAdminRoute,
  read,
} from '../../../../utils/admin/defineAdminRoute';
import { HelloAssoMembershipsQuery } from '../schemas';
import { listHelloAssoMemberships } from '../service';

export default defineAdminRoute({
  key: 'admin-helloasso',
  // Donnée d'association, pas de tenant : garde sur le rôle global.
  guard: { permission: 'manage_billing', scope: 'platform' },
  GET: read({
    query: HelloAssoMembershipsQuery,
    // API tierce : plus serré que le préréglage de lecture.
    rateLimit: { max: 20, windowMs: 60_000 },
    handler: ({ query, ctx }) => listHelloAssoMemberships(ctx, query),
  }),
});
