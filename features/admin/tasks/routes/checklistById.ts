// features/admin/tasks/routes/checklistById.ts
// /api/admin/tasks/checklist/[id] — PATCH (label / coché / position), DELETE.
// Pas de journal : un toggle de checklist est trop verbeux pour staff_logs.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { ChecklistItemIdQuery, PatchChecklistItemBody } from '../schemas';
import { deleteChecklistItem, updateChecklistItem } from '../service';

export default defineAdminRoute({
  key: 'tasks-checklist-id',
  guard: { permission: 'manage_tasks' },
  PATCH: mutate({
    query: ChecklistItemIdQuery,
    body: PatchChecklistItemBody,
    audit: false,
    handler: ({ query, body, ctx }) => updateChecklistItem(ctx, query.id, body),
  }),
  DELETE: mutate({
    query: ChecklistItemIdQuery,
    audit: false,
    handler: ({ query, ctx }) => deleteChecklistItem(ctx, query.id),
  }),
});
