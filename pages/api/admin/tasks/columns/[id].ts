// pages/api/admin/tasks/columns/[id].ts
//
// Kanban interne (staff-only). Édition + suppression d'une colonne.
//
//   PATCH  { name?, wipLimit?, isDone?, position? }
//   DELETE → 409 { code:'column_not_empty' } si des cartes vivantes y sont.
//
// Auth : withStaffRoute('admin'). Scoping tenant via ctx.tenantId.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { patchColumnBodySchema } from '@/utils/taskBoardSchemas';
import { emitBoardChanged } from '@/utils/taskBoard';
import { formatZodError } from '@/utils/validation';
import { logger } from '@/utils/logger';

export default withStaffRoute(handler, { permission: 'manage_tasks' });

function columnId(req: NextApiRequest): string | null {
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
  const id = columnId(req);
  if (!id) return res.status(400).json({ error: 'Colonne id invalide' });

  if (req.method === 'PATCH') return patchColumn(id, req, res, ctx);
  if (req.method === 'DELETE') return deleteColumn(id, res, ctx);

  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function patchColumn(
  id: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const parsed = patchColumnBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: formatZodError(parsed.error),
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { data: existing } = await supabaseAdmin!
    .from('task_columns')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .maybeSingle();
  if (!existing) return res.status(404).json({ error: 'Colonne introuvable' });

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.wipLimit !== undefined)
    updates.wip_limit = parsed.data.wipLimit;
  if (parsed.data.isDone !== undefined) updates.is_done = parsed.data.isDone;
  if (parsed.data.position !== undefined)
    updates.position = parsed.data.position;

  const { data: updated, error } = await supabaseAdmin!
    .from('task_columns')
    .update(updates)
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .select('id, board_id, name, position, wip_limit, is_done')
    .maybeSingle();
  if (error || !updated) {
    logger.error('[admin/tasks/columns/:id] patch error', error);
    return res.status(500).json({ error: 'Échec de la mise à jour' });
  }

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'task_column_update',
      entity_type: 'task_column',
      entity_id: id,
      tenant_id: ctx.tenantId,
      payload: { fields: Object.keys(parsed.data) },
    });
  } catch (e) {
    logger.error('[admin/tasks/columns/:id] audit error', e);
  }

  const c = updated as {
    id: string;
    board_id: string;
    name: string;
    position: number | null;
    wip_limit: number | null;
    is_done: boolean;
  };
  await emitBoardChanged(ctx.tenantId, c.board_id);
  return res.status(200).json({
    column: {
      id: c.id,
      boardId: c.board_id,
      name: c.name,
      position: c.position ?? 0,
      wipLimit: c.wip_limit ?? null,
      isDone: c.is_done === true,
    },
  });
}

async function deleteColumn(
  id: string,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { data: existing } = await supabaseAdmin!
    .from('task_columns')
    .select('id, name, board_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .maybeSingle();
  if (!existing) return res.status(404).json({ error: 'Colonne introuvable' });

  // Refus si des cartes vivantes y sont encore (évite une perte silencieuse via
  // le CASCADE physique). L'admin doit d'abord vider/déplacer la colonne.
  const { data: liveTasks } = await supabaseAdmin!
    .from('tasks')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('column_id', id)
    .is('deleted_at', null);
  if (((liveTasks ?? []) as unknown[]).length > 0) {
    return res.status(409).json({
      error: 'La colonne contient encore des cartes',
      code: 'column_not_empty',
    });
  }

  const { error } = await supabaseAdmin!
    .from('task_columns')
    .delete()
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id);
  if (error) {
    logger.error('[admin/tasks/columns/:id] delete error', error);
    return res.status(500).json({ error: 'Échec de la suppression' });
  }

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'task_column_delete',
      entity_type: 'task_column',
      entity_id: id,
      tenant_id: ctx.tenantId,
      payload: { name: (existing as { name: string }).name },
    });
  } catch (e) {
    logger.error('[admin/tasks/columns/:id] audit error', e);
  }

  await emitBoardChanged(
    ctx.tenantId,
    (existing as { board_id: string }).board_id
  );

  return res.status(200).json({ success: true });
}
