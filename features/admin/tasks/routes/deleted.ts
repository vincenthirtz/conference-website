// features/admin/tasks/routes/deleted.ts
// /api/admin/tasks/deleted — GET corbeille (`?boardId=&limit=`, défaut 100).
// La restauration passe par PATCH tasks/[id]/restore.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { DeletedTasksQuery } from '../schemas';
import { listDeletedTasks } from '../service';

export default defineAdminRoute({
  key: 'tasks-deleted',
  guard: { permission: 'manage_tasks' },
  GET: read({
    query: DeletedTasksQuery,
    handler: ({ query, ctx }) => listDeletedTasks(ctx, query),
  }),
});
