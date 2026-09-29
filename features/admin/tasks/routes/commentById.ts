// features/admin/tasks/routes/commentById.ts
// /api/admin/tasks/comments/[id] — DELETE d'un commentaire de carte.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { CommentIdQuery } from '../schemas';
import { deleteComment } from '../service';

export default defineAdminRoute({
  key: 'tasks-comment-id',
  guard: { permission: 'manage_tasks' },
  DELETE: mutate({
    query: CommentIdQuery,
    audit: 'task_comment_delete',
    handler: async ({ query, ctx }) => {
      const { audit, response } = await deleteComment(ctx, query.id);
      ctx.audit(audit);
      return response;
    },
  }),
});
