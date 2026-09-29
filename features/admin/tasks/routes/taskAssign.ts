// features/admin/tasks/routes/taskAssign.ts
// /api/admin/tasks/tasks/[id]/assign — PATCH (dés)assignation (assignTaskCore).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { AssignTaskBody, TaskIdQuery } from '../schemas';
import { assignTask, taskActor } from '../service';

export default defineAdminRoute({
  key: 'tasks-assign',
  guard: { permission: 'manage_tasks' },
  PATCH: mutate({
    query: TaskIdQuery,
    body: AssignTaskBody,
    // Journal `task_assign` + event `task.assigned` (sauf désassignation)
    // écrits par assignTaskCore (partagé avec le bot).
    audit: false,
    handler: ({ query, body, ctx }) =>
      assignTask(
        ctx,
        taskActor(ctx.staff.staff),
        query.id,
        body.assigneeStaffId
      ),
  }),
});
