// features/admin/tasks/routes/boardById.ts
// /api/admin/tasks/boards/[id] — GET board complet (colonnes, cartes, labels,
// agrégats checklist / commentaires), PATCH édition, DELETE (CASCADE).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { BoardIdQuery, PatchBoardBody } from '../schemas';
import { deleteBoard, getBoardDetail, updateBoard } from '../service';

export default defineAdminRoute({
  key: 'tasks-board-id',
  guard: { permission: 'manage_tasks' },
  GET: read({
    query: BoardIdQuery,
    handler: ({ query, ctx }) => getBoardDetail(ctx, query.id),
  }),
  PATCH: mutate({
    query: BoardIdQuery,
    body: PatchBoardBody,
    audit: 'task_board_update',
    handler: async ({ query, body, ctx }) => {
      const { audit, response } = await updateBoard(ctx, query.id, body);
      ctx.audit(audit);
      return response;
    },
  }),
  DELETE: mutate({
    query: BoardIdQuery,
    audit: 'task_board_delete',
    handler: async ({ query, ctx }) => {
      const { audit, response } = await deleteBoard(ctx, query.id);
      ctx.audit(audit);
      return response;
    },
  }),
});
