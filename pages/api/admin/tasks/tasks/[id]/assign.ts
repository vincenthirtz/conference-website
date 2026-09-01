// pages/api/admin/tasks/tasks/[id]/assign.ts
//
// Kanban interne (staff-only). (Dés)assignation d'une carte.
//
//   PATCH { assigneeStaffId: uuid | null } → assignTaskCore.
//     null = désassigner.
//
// Auth : withStaffRoute('admin') + withAdminIdempotency. Scoping tenant via
// ctx.tenantId. La logique (audit, event task.assigned) vit dans assignTaskCore.

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { isValidUUID } from '@/utils/apiHelpers';
import { assignTaskCore } from '@/utils/taskBoard';
import { formatZodError } from '@/utils/validation';

const bodySchema = z.object({
  assigneeStaffId: z.string().uuid().nullable(),
});

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'tasks-assign' }),
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

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: formatZodError(parsed.error),
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const result = await assignTaskCore({
    tenantId: ctx.tenantId,
    taskId: id,
    assigneeStaffId: parsed.data.assigneeStaffId,
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
  return res.status(200).json({ task: result.task });
}
