// features/admin/tasks/routes/tasks.ts
// /api/admin/tasks/tasks — POST création de carte (createTaskCore).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { CreateTaskBody } from '../schemas';
import { createTask, taskActor } from '../service';

export default defineAdminRoute({
  key: 'tasks-create',
  guard: { permission: 'manage_tasks' },
  POST: mutate({
    body: CreateTaskBody,
    status: 201,
    // Journal `task_create` + event `task.created` écrits par createTaskCore
    // (partagé avec le bot) : le déclarer ici le doublerait.
    audit: false,
    handler: ({ body, ctx }) =>
      createTask(ctx, taskActor(ctx.staff.staff), body),
  }),
});
