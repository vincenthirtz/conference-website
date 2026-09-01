// pages/api/admin/tasks/tasks/[id]/move.ts
//
// Kanban interne (staff-only). Déplacement d'une carte.
//
//   PATCH { columnId, position? } → moveTaskCore.
//
// Auth : withStaffRoute('admin') + withAdminIdempotency (double-clic / retry
// drag-and-drop ne rejoue pas le déplacement). Scoping tenant via ctx.tenantId.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { isValidUUID } from '@/utils/apiHelpers';
import { moveTaskCore } from '@/utils/taskBoard';
import { moveTaskBodySchema } from '@/utils/taskBoardSchemas';
import { formatZodError } from '@/utils/validation';

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'tasks-move' }),
  { permission: 'manage_tasks' }
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (typeof id !== 'string' || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Task id invalide' });
  }

  const parsed = moveTaskBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: formatZodError(parsed.error),
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const result = await moveTaskCore({
    tenantId: ctx.tenantId,
    taskId: id,
    toColumnId: parsed.data.columnId,
    toPosition: parsed.data.position ?? null,
    actorStaffId: ctx.staff.id,
    actorLabel: ctx.staff.display_name ?? 'Staff',
    via: 'website',
  });

  if (!result.ok) {
    return res.status(result.status).json({
      error: result.error,
      ...(result.code ? { code: result.code } : {}),
      ...(result.code === 'wip_exceeded'
        ? { limit: result.limit, current: result.current }
        : {}),
    });
  }
  return res.status(200).json({ task: result.task });
}
