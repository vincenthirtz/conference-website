// pages/api/admin/tasks/tasks.ts
//
// Kanban interne (staff-only). Création d'une carte.
//
//   POST { boardId, columnId, title, description?, priority?, assigneeStaffId?,
//          dueDate?, labels? } → createTaskCore.
//
// Auth : withStaffRoute('admin'). Scoping tenant via ctx.tenantId.
// La logique (positionnement, audit, event task.created) vit dans createTaskCore.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { createTaskCore } from '@/utils/taskBoard';
import { createTaskBodySchema } from '@/utils/taskBoardSchemas';
import { formatZodError } from '@/utils/validation';

export default withStaffRoute(handler, { permission: 'manage_tasks' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = createTaskBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: formatZodError(parsed.error),
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const result = await createTaskCore({
    tenantId: ctx.tenantId,
    boardId: parsed.data.boardId,
    columnId: parsed.data.columnId,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    priority: parsed.data.priority,
    assigneeStaffId: parsed.data.assigneeStaffId ?? null,
    dueDate: parsed.data.dueDate ?? null,
    labels: parsed.data.labels,
    actorStaffId: ctx.staff.id,
    actorLabel: ctx.staff.display_name ?? 'Staff',
    via: 'website',
  });

  if (!result.ok) {
    return res.status(result.status).json({
      error: result.error,
      ...(result.code ? { code: result.code } : {}),
    });
  }
  return res.status(201).json({ task: result.task });
}
