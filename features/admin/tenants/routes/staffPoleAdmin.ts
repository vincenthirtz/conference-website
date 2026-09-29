// features/admin/tenants/routes/staffPoleAdmin.ts
// /api/admin/staff/[staffId]/pole-admin — POST pose, DELETE retire le
// drapeau `is_pole_admin` de la cible.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StaffIdQuery } from '../schemas';
import { staffScope } from '../service/scope';
import { togglePoleAdmin } from '../service/staffFlags';

const LIMIT = { max: 30, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-staff-pole-admin',
  // Owner GLOBAL (`staff.role`) exigé : le drapeau ouvre TOUS les espaces.
  // L'ancienne garde (`manage_tenant` sur le rôle EFFECTIF) laissait tout
  // owner d'espace — compte développeur compris — se passer pôle-admin.
  guard: { role: 'owner', scope: 'platform' },
  POST: mutate({
    query: StaffIdQuery,
    rateLimit: LIMIT,
    // Ex-`other` + `payload.action: 'toggle_pole_admin'` (payload conservé).
    audit: 'toggle_pole_admin',
    handler: ({ query, ctx }) =>
      audited(
        ctx,
        togglePoleAdmin(ctx, staffScope(ctx.staff), query.staffId, true)
      ),
  }),
  DELETE: mutate({
    query: StaffIdQuery,
    rateLimit: LIMIT,
    audit: 'toggle_pole_admin',
    handler: ({ query, ctx }) =>
      audited(
        ctx,
        togglePoleAdmin(ctx, staffScope(ctx.staff), query.staffId, false)
      ),
  }),
});
