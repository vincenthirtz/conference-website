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

// Rôle GLOBAL : « ce qu'on détient » se juge sur la plateforme, pas sur
// l'espace actif (sinon l'élévation `tenant_staff` se convertirait en droits
// accordés globalement).
const callerOf = (ctx: AdminRouteContext) => ({
  role: ctx.staff.globalRole,
  extraPermissions: ctx.staff.staff.extra_permissions,
});

export default defineAdminRoute({
  key: 'users-permissions',
  // Portée PLATEFORME : `staff.role` / `extra_permissions` sont GLOBAUX. Un
  // owner EFFECTIF (élevé par `tenant_staff`, compte développeur compris) ne
  // redistribue pas un pouvoir qui dépasse son espace.
  guard: { permission: 'manage_staff', scope: 'platform' },
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
