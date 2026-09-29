// features/admin/users/routes/create.ts — POST /api/admin/users
// Création d'un compte (page /admin/users/new) : mêmes gardes d'escalade et
// même synchronisation `staff` que le changement de rôle de /users/manage.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CreateUserDoc } from '../schemas';
import { createUser } from '../service/accounts';

export default defineAdminRoute({
  key: 'users-create',
  // Portée PLATEFORME : `staff.role` / `extra_permissions` sont GLOBAUX. Un
  // owner EFFECTIF (élevé par `tenant_staff`, compte développeur compris) ne
  // redistribue pas un pouvoir qui dépasse son espace.
  guard: { permission: 'manage_staff', scope: 'platform' },
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
