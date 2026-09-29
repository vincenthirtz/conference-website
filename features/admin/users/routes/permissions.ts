// features/admin/users/routes/permissions.ts —
// /api/admin/users/[userId]/permissions : GET l'état (rôle, accordées,
// effectives, cochables par l'appelant), PUT remplace la liste accordée.
// Auth `manage_staff` — le droit qui redistribue le pouvoir.

import {
  defineAdminRoute,
  mutate,
  read,
  type AdminRouteContext,
} from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StaffPermissionsDoc, UserIdPathQuery } from '../schemas';
import {
  getStaffPermissions,
  setStaffPermissions,
} from '../service/permissions';

const LIMIT = { max: 30, windowMs: 60_000 };

const callerOf = (ctx: AdminRouteContext) => ({
  role: ctx.staff.role,
  extraPermissions: ctx.staff.staff.extra_permissions,
});

export default defineAdminRoute({
  key: 'users-permissions',
  guard: { permission: 'manage_staff' },
  GET: read({
    query: UserIdPathQuery,
    rateLimit: LIMIT,
    handler: ({ query, ctx }) =>
      getStaffPermissions(ctx, callerOf(ctx), query.userId),
  }),
  PUT: mutate({
    query: UserIdPathQuery,
    body: StaffPermissionsDoc,
    rateLimit: LIMIT,
    audit: 'update_staff_permissions',
    handler: ({ query, body, ctx }) =>
      audited(ctx, setStaffPermissions(ctx, callerOf(ctx), query.userId, body)),
  }),
});
