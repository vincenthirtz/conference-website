// features/admin/tasks/routes/my.ts
// /api/admin/tasks/my — GET « Mes tâches » : cartes vivantes assignées au
// staff courant, tous boards du tenant.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { listMyTasks } from '../service';

export default defineAdminRoute({
  key: 'tasks-my',
  guard: { permission: 'manage_tasks' },
  GET: read({
    handler: ({ ctx }) =>
      listMyTasks(ctx, {
        staffId: ctx.staff.staff.id,
        name: ctx.staff.staff.display_name ?? null,
      }),
  }),
});
