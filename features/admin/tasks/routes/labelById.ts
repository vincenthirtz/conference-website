// features/admin/tasks/routes/labelById.ts
// /api/admin/tasks/labels/[id] — PATCH (renommage répercuté dans les cartes,
// 409 `label_exists` en collision), DELETE (le nom reste sur les cartes).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { LabelIdQuery, PatchLabelBody } from '../schemas';
import { deleteLabel, updateLabel } from '../service';

export default defineAdminRoute({
  key: 'tasks-label-id',
  guard: { permission: 'manage_tasks' },
  PATCH: mutate({
    query: LabelIdQuery,
    body: PatchLabelBody,
    audit: 'task_label_update',
    handler: async ({ query, body, ctx }) => {
      const { audit, response } = await updateLabel(ctx, query.id, body);
      ctx.audit(audit);
      return response;
    },
  }),
  DELETE: mutate({
    query: LabelIdQuery,
    audit: 'task_label_delete',
    handler: async ({ query, ctx }) => {
      const { audit, response } = await deleteLabel(ctx, query.id);
      ctx.audit(audit);
      return response;
    },
  }),
});
