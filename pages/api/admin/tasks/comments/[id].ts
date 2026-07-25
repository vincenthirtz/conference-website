// pages/api/admin/tasks/comments/[id].ts
//
// Kanban interne (staff-only). Suppression d'un commentaire de carte.
//
//   DELETE → 200 { success: true }.
//
// Auth : withStaffRoute('admin'). Scoping tenant via ctx.tenantId.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

export default withStaffRoute(handler, 'admin');

function commentId(req: NextApiRequest): string | null {
  const raw = req.query.id;
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' && isValidUUID(v) ? v : null;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }
  const id = commentId(req);
  if (!id) return res.status(400).json({ error: 'Commentaire id invalide' });

  if (req.method === 'DELETE') return deleteComment(id, res, ctx);

  res.setHeader('Allow', 'DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function deleteComment(
  id: string,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { data: existing } = await supabaseAdmin!
    .from('task_comments')
    .select('id, task_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .maybeSingle();
  if (!existing) {
    return res.status(404).json({ error: 'Commentaire introuvable' });
  }

  const { error } = await supabaseAdmin!
    .from('task_comments')
    .delete()
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id);
  if (error) {
    logger.error('[admin/tasks/comments/:id] delete error', error);
    return res.status(500).json({ error: 'Échec de la suppression' });
  }

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'task_comment_delete',
      entity_type: 'task_comment',
      entity_id: id,
      tenant_id: ctx.tenantId,
      payload: { task_id: (existing as { task_id: string }).task_id },
    });
  } catch (e) {
    logger.error('[admin/tasks/comments/:id] audit error', e);
  }

  return res.status(200).json({ success: true });
}
