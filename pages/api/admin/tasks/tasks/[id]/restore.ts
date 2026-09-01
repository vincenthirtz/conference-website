// pages/api/admin/tasks/tasks/[id]/restore.ts
//
// Kanban interne (staff-only). Restauration d'une carte de la corbeille.
//
//   PATCH → deleted_at = NULL + repositionnement en bas de sa colonne
//           d'origine (max(position)+1). 404 task_not_found si la carte
//           n'existe pas, 409 not_deleted si elle est déjà active, 409
//           column_gone si la colonne d'origine a disparu.
//
// Auth : withStaffRoute('admin'). Scoping tenant via ctx.tenantId. La logique
// (repositionnement, audit task_restore) vit dans restoreTaskCore. Pas d'event
// bot (restauration = geste interne).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { restoreTaskCore } from '@/utils/taskBoard';

export default withStaffRoute(handler, { permission: 'manage_tasks' });

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

  const result = await restoreTaskCore({
    tenantId: ctx.tenantId,
    taskId: id,
    actorStaffId: ctx.staff.id,
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
