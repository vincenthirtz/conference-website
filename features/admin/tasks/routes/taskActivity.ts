// features/admin/tasks/routes/taskActivity.ts
// /api/admin/tasks/tasks/[id]/activity — GET timeline d'une carte (staff_logs).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { TaskIdQuery } from '../schemas';
import { getTaskActivity } from '../service';

export default defineAdminRoute({
  key: 'tasks-activity',
  guard: { permission: 'manage_tasks' },
  GET: read({
    query: TaskIdQuery,
    handler: ({ query, ctx }) => getTaskActivity(ctx, query.id),
  }),
});
