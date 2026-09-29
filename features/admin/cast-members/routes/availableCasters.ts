// features/admin/cast-members/routes/availableCasters.ts
// GET /api/admin/cast-members/available-casters?matchScheduledAt=&windowHours=
// → { items, windowHours } : comptes staff `caster`, leur fiche liée, et le
// marquage des conflits de créneau.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { listAvailableCasters } from '../service';

export default defineAdminRoute({
  key: 'available-casters',
  guard: { permission: 'manage_communications' },
  GET: read({
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ req, ctx }) => listAvailableCasters(ctx, req.query),
  }),
});
