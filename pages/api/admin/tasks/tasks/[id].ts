// pages/api/admin/tasks/tasks/[id].ts
//
// Kanban interne (staff-only). Lecture / édition / soft-delete d'une carte.
//
//   GET    → une carte (avec assignee { staffId, name }).
//   PATCH  { title?, description?, priority?, dueDate?, labels? }
//            (PAS de move/assign ici — voir move.ts / assign.ts).
//   DELETE → soft-delete (deleted_at = now()).
//
// Auth : withStaffRoute('admin'). Scoping tenant via ctx.tenantId.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { patchTaskBodySchema } from '@/utils/taskBoardSchemas';
import { formatZodError } from '@/utils/validation';
import { logger } from '@/utils/logger';

export default withStaffRoute(handler, 'admin');

function taskId(req: NextApiRequest): string | null {
  const raw = req.query.id;
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' && isValidUUID(v) ? v : null;
}

type TaskRow = {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string | null;
  priority: string;
  assignee_staff_id: string | null;
  due_date: string | null;
  position: number | null;
  labels: string[] | null;
};

const SELECT =
  'id, board_id, column_id, title, description, priority, assignee_staff_id, due_date, position, labels';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }
  const id = taskId(req);
  if (!id) return res.status(400).json({ error: 'Task id invalide' });

  if (req.method === 'GET') return getTask(id, res, ctx);
  if (req.method === 'PATCH') return patchTask(id, req, res, ctx);
  if (req.method === 'DELETE') return softDeleteTask(id, res, ctx);

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function resolveAssigneeName(
  staffId: string | null
): Promise<string | null> {
  if (!staffId) return null;
  const { data } = await supabaseAdmin!
    .from('staff')
    .select('display_name')
    .eq('id', staffId)
    .maybeSingle();
  return (data as { display_name: string | null } | null)?.display_name ?? null;
}

function shape(row: TaskRow, assigneeName: string | null) {
  return {
    id: row.id,
    boardId: row.board_id,
    columnId: row.column_id,
    title: row.title,
    description: row.description ?? null,
    priority: row.priority,
    position: row.position ?? 0,
    dueDate: row.due_date ?? null,
    labels: Array.isArray(row.labels) ? row.labels : [],
    assignee: row.assignee_staff_id
      ? { staffId: row.assignee_staff_id, name: assigneeName }
      : null,
  };
}

async function getTask(
  id: string,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { data, error } = await supabaseAdmin!
    .from('tasks')
    .select(SELECT)
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    logger.error('[admin/tasks/tasks/:id] get error', error);
    return res.status(500).json({ error: 'Échec du chargement' });
  }
  if (!data) return res.status(404).json({ error: 'Tâche introuvable' });
  const row = data as TaskRow;
  const name = await resolveAssigneeName(row.assignee_staff_id ?? null);
  return res.status(200).json({ task: shape(row, name) });
}

async function patchTask(
  id: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const parsed = patchTaskBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: formatZodError(parsed.error),
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { data: existing } = await supabaseAdmin!
    .from('tasks')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!existing) return res.status(404).json({ error: 'Tâche introuvable' });

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined)
    updates.description = parsed.data.description;
  if (parsed.data.priority !== undefined)
    updates.priority = parsed.data.priority;
  if (parsed.data.dueDate !== undefined) updates.due_date = parsed.data.dueDate;
  if (parsed.data.labels !== undefined) updates.labels = parsed.data.labels;

  const { data: updated, error } = await supabaseAdmin!
    .from('tasks')
    .update(updates)
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .select(SELECT)
    .maybeSingle();
  if (error || !updated) {
    logger.error('[admin/tasks/tasks/:id] patch error', error);
    return res.status(500).json({ error: 'Échec de la mise à jour' });
  }

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'task_update',
      entity_type: 'task',
      entity_id: id,
      tenant_id: ctx.tenantId,
      payload: { fields: Object.keys(parsed.data) },
    });
  } catch (e) {
    logger.error('[admin/tasks/tasks/:id] audit error', e);
  }

  const row = updated as TaskRow;
  const name = await resolveAssigneeName(row.assignee_staff_id ?? null);
  return res.status(200).json({ task: shape(row, name) });
}

async function softDeleteTask(
  id: string,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { data: existing } = await supabaseAdmin!
    .from('tasks')
    .select('id, title')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!existing) return res.status(404).json({ error: 'Tâche introuvable' });

  const { error } = await supabaseAdmin!
    .from('tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id);
  if (error) {
    logger.error('[admin/tasks/tasks/:id] delete error', error);
    return res.status(500).json({ error: 'Échec de la suppression' });
  }

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'task_delete',
      entity_type: 'task',
      entity_id: id,
      tenant_id: ctx.tenantId,
      payload: { title: (existing as { title: string }).title },
    });
  } catch (e) {
    logger.error('[admin/tasks/tasks/:id] audit error', e);
  }

  return res.status(200).json({ success: true });
}
