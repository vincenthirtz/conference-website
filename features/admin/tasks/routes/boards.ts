// features/admin/tasks/routes/boards.ts
// /api/admin/tasks/boards — GET liste (`?includeArchived=1`), POST création
// (board + 4 colonnes par défaut).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { CreateBoardBody, ListBoardsQuery } from '../schemas';
import { createBoard, listBoards, taskActor } from '../service';

export default defineAdminRoute({
  key: 'tasks-boards',
  guard: { permission: 'manage_tasks' },
  GET: read({
    query: ListBoardsQuery,
    handler: ({ query, ctx }) => listBoards(ctx, query.includeArchived),
  }),
  POST: mutate({
    body: CreateBoardBody,
    status: 201,
    audit: 'task_board_create',
    handler: async ({ body, ctx }) => {
      const { audit, response } = await createBoard(
        ctx,
        taskActor(ctx.staff.staff),
        body
      );
      ctx.audit(audit);
      return response;
    },
  }),
});
