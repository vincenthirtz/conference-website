// features/admin/tasks/routes/columnById.ts
// /api/admin/tasks/columns/[id] — PATCH édition (reorder inclus), DELETE
// (409 `column_not_empty` si des cartes vivantes y sont).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { ColumnIdQuery, PatchColumnBody } from '../schemas';
import { deleteColumn, updateColumn } from '../service';

export default defineAdminRoute({
  key: 'tasks-column-id',
  guard: { permission: 'manage_tasks' },
  PATCH: mutate({
    query: ColumnIdQuery,
    body: PatchColumnBody,
    audit: 'task_column_update',
    handler: async ({ query, body, ctx }) => {
      const { audit, response } = await updateColumn(ctx, query.id, body);
      ctx.audit(audit);
      return response;
    },
  }),
  DELETE: mutate({
    query: ColumnIdQuery,
    audit: 'task_column_delete',
    handler: async ({ query, ctx }) => {
      const { audit, response } = await deleteColumn(ctx, query.id);
      ctx.audit(audit);
      return response;
    },
  }),
});
