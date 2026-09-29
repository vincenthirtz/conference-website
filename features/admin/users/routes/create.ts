// features/admin/users/routes/create.ts — POST /api/admin/users
// Création d'un compte (page /admin/users/new) : mêmes gardes d'escalade et
// même synchronisation `staff` que le changement de rôle de /users/manage.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CreateUserDoc } from '../schemas';
import { createUser } from '../service/accounts';

export default defineAdminRoute({
  key: 'users-create',
  guard: { permission: 'manage_staff' },
  POST: mutate({
    body: CreateUserDoc,
    status: 201,
    audit: 'create_user',
    handler: ({ body, ctx }) =>
      audited(
        ctx,
        createUser(
          ctx,
          {
            staffId: ctx.staff.staff.id,
            userId: ctx.staff.user.id,
            role: ctx.staff.staff.role ?? null,
          },
          body
        )
      ),
  }),
});
