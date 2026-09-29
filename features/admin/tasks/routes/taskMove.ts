// features/admin/tasks/routes/taskMove.ts
// /api/admin/tasks/tasks/[id]/move — PATCH déplacement (moveTaskCore).
// Garde WIP → 409 { code: 'wip_exceeded', limit, current } : le client s'en
// sert pour annuler le glisser-déposer optimiste.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { MoveTaskBody, TaskIdQuery } from '../schemas';
import { moveTask, taskActor } from '../service';

export default defineAdminRoute({
  key: 'tasks-move',
  guard: { permission: 'manage_tasks' },
  PATCH: mutate({
    query: TaskIdQuery,
    body: MoveTaskBody,
    // Idempotence (défaut) : un double-clic / retry de glisser-déposer ne
    // rejoue pas le déplacement. Journal `task_move` + event `task.moved`
    // écrits par moveTaskCore (partagé avec le bot).
    audit: false,
    handler: ({ query, body, ctx }) =>
      moveTask(ctx, taskActor(ctx.staff.staff), query.id, body),
  }),
});
