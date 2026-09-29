// features/admin/users/routes/manage.ts — /api/admin/users/manage
// GET liste paginée ; PATCH rôle / nom / BattleTag de roster / suspension /
// réinitialisation des identifiants (slug de journal selon le geste) ;
// DELETE suppression définitive. Règles de pouvoir : service/accounts.ts.

import {
  defineAdminRoute,
  mutate,
  read,
  type AdminRouteContext,
} from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import {
  UsersManageDeleteDoc,
  UsersManageListQuery,
  UsersManagePatchDoc,
} from '../schemas';
import {
  type AccountActor,
  deleteUser,
  listUsers,
  patchUser,
} from '../service/accounts';

const LIMIT = { max: 60, windowMs: 60_000 };

const actorOf = (ctx: AdminRouteContext): AccountActor => ({
  staffId: ctx.staff.staff.id,
  userId: ctx.staff.user.id,
  role: ctx.staff.staff.role ?? null,
});

export default defineAdminRoute({
  key: 'users-manage',
  guard: { permission: 'manage_staff' },
  GET: read({
    query: UsersManageListQuery,
    rateLimit: LIMIT,
    handler: ({ query, ctx }) => listUsers(ctx, query),
  }),
  PATCH: mutate({
    body: UsersManagePatchDoc,
    rateLimit: LIMIT,
    // Slug de la méthode ; le service le précise par geste (`ctx.audit.action`).
    audit: 'update_staff_role',
    handler: ({ body, ctx }) =>
      audited(ctx, patchUser(ctx, actorOf(ctx), body)),
  }),
  DELETE: mutate({
    body: UsersManageDeleteDoc,
    rateLimit: LIMIT,
    audit: 'delete_staff_account',
    handler: ({ body, ctx }) =>
      audited(ctx, deleteUser(ctx, actorOf(ctx), body)),
  }),
});
