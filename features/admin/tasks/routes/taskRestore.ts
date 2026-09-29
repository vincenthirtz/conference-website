// features/admin/tasks/routes/taskRestore.ts
// /api/admin/tasks/tasks/[id]/restore — PATCH restauration depuis la
// corbeille (restoreTaskCore) : 404 task_not_found, 409 not_deleted,
// 409 column_gone.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { TaskIdQuery } from '../schemas';
import { restoreTask, taskActor } from '../service';

export default defineAdminRoute({
  key: 'tasks-restore',
  guard: { permission: 'manage_tasks' },
  PATCH: mutate({
    query: TaskIdQuery,
    // Journal `task_restore` écrit par restoreTaskCore.
    audit: false,
    handler: ({ query, ctx }) =>
      restoreTask(ctx, taskActor(ctx.staff.staff), query.id),
  }),
});
