// features/admin/tasks/routes/taskChecklist.ts
// /api/admin/tasks/tasks/[id]/checklist — GET items (par position), POST
// création (position = max+1). Pas de journal : trop verbeux.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { CreateChecklistItemBody, TaskIdQuery } from '../schemas';
import { createChecklistItem, listChecklist } from '../service';

export default defineAdminRoute({
  key: 'tasks-checklist',
  guard: { permission: 'manage_tasks' },
  GET: read({
    query: TaskIdQuery,
    handler: ({ query, ctx }) => listChecklist(ctx, query.id),
  }),
  POST: mutate({
    query: TaskIdQuery,
    body: CreateChecklistItemBody,
    status: 201,
    audit: false,
    handler: ({ query, body, ctx }) => createChecklistItem(ctx, query.id, body),
  }),
});
