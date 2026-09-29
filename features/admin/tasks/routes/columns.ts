// features/admin/tasks/routes/columns.ts
// /api/admin/tasks/columns — POST création (position = max+1 dans le board).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { CreateColumnBody } from '../schemas';
import { createColumn } from '../service';

export default defineAdminRoute({
  key: 'tasks-columns',
  guard: { permission: 'manage_tasks' },
  POST: mutate({
    body: CreateColumnBody,
    status: 201,
    audit: 'task_column_create',
    handler: async ({ body, ctx }) => {
      const { audit, response } = await createColumn(ctx, body);
      ctx.audit(audit);
      return response;
    },
  }),
});
