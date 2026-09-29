// features/admin/tasks/routes/taskById.ts
// /api/admin/tasks/tasks/[id] — GET carte (commentaires + checklist complets),
// PATCH édition (ni move ni assign), DELETE soft-delete (corbeille).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { PatchTaskBody, TaskIdQuery } from '../schemas';
import { getTaskDetail, softDeleteTask, updateTask } from '../service';

export default defineAdminRoute({
  key: 'tasks-task-id',
  guard: { permission: 'manage_tasks' },
  GET: read({
    query: TaskIdQuery,
    handler: ({ query, ctx }) => getTaskDetail(ctx, query.id),
  }),
  PATCH: mutate({
    query: TaskIdQuery,
    body: PatchTaskBody,
    audit: 'task_update',
    handler: async ({ query, body, ctx }) => {
      const { audit, response } = await updateTask(ctx, query.id, body);
      ctx.audit(audit);
      return response;
    },
  }),
  DELETE: mutate({
    query: TaskIdQuery,
    audit: 'task_delete',
    handler: async ({ query, ctx }) => {
      const { audit, response } = await softDeleteTask(ctx, query.id);
      ctx.audit(audit);
      return response;
    },
  }),
});
