// features/admin/tasks/routes/taskComments.ts
// /api/admin/tasks/tasks/[id]/comments — GET fil (created_at asc), POST
// création (auteur = staff courant).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { CreateCommentBody, TaskIdQuery } from '../schemas';
import { createComment, listComments, taskActor } from '../service';

export default defineAdminRoute({
  key: 'tasks-comments',
  guard: { permission: 'manage_tasks' },
  GET: read({
    query: TaskIdQuery,
    handler: ({ query, ctx }) => listComments(ctx, query.id),
  }),
  POST: mutate({
    query: TaskIdQuery,
    body: CreateCommentBody,
    status: 201,
    audit: 'task_comment_create',
    handler: async ({ query, body, ctx }) => {
      const { audit, response } = await createComment(
        ctx,
        taskActor(ctx.staff.staff),
        query.id,
        body
      );
      ctx.audit(audit);
      return response;
    },
  }),
});
