// features/admin/tenants/routes/staffPoleAdmin.ts
// /api/admin/staff/[staffId]/pole-admin — POST pose, DELETE retire le
// drapeau `is_pole_admin` de la cible.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StaffIdQuery } from '../schemas';
import { togglePoleAdmin } from '../service/staffFlags';

const LIMIT = { max: 30, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-staff-pole-admin',
  // Garde CONSERVÉE telle quelle (sans `scope: 'platform'`) : cf. rapport de
  // migration, vague serveur 4.
  guard: { permission: 'manage_tenant' },
  POST: mutate({
    query: StaffIdQuery,
    rateLimit: LIMIT,
    // Ex-`other` + `payload.action: 'toggle_pole_admin'` (payload conservé).
    audit: 'toggle_pole_admin',
    handler: ({ query, ctx }) =>
      audited(ctx, togglePoleAdmin(ctx, query.staffId, true)),
  }),
  DELETE: mutate({
    query: StaffIdQuery,
    rateLimit: LIMIT,
    audit: 'toggle_pole_admin',
    handler: ({ query, ctx }) =>
      audited(ctx, togglePoleAdmin(ctx, query.staffId, false)),
  }),
});
