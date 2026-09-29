// features/admin/tasks/routes/labels.ts
// /api/admin/tasks/labels — POST définition de label colorée
// (409 `label_exists` si le nom est déjà pris dans le board).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { CreateLabelBody } from '../schemas';
import { createLabel } from '../service';

export default defineAdminRoute({
  key: 'tasks-labels',
  guard: { permission: 'manage_tasks' },
  POST: mutate({
    body: CreateLabelBody,
    status: 201,
    audit: 'task_label_create',
    handler: async ({ body, ctx }) => {
      const { audit, response } = await createLabel(ctx, body);
      ctx.audit(audit);
      return response;
    },
  }),
});
