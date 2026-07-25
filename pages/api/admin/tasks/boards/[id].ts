// pages/api/admin/tasks/boards/[id].ts
//
// Kanban interne (staff-only). Board complet + édition + suppression.
//
//   GET    → board + colonnes ordonnées, chaque colonne avec ses cartes
//            vivantes triées par position (assignee { staffId, name }).
//   PATCH  { name?, description?, position?, is_archived? }
//   DELETE → suppression du board (CASCADE colonnes + cartes).
//
// Auth : withStaffRoute('admin'). Scoping tenant via ctx.tenantId.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { patchBoardBodySchema } from '@/utils/taskBoardSchemas';
import { formatZodError } from '@/utils/validation';
import { logger } from '@/utils/logger';

export default withStaffRoute(handler, 'admin');

function boardId(req: NextApiRequest): string | null {
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
  const id = boardId(req);
  if (!id) return res.status(400).json({ error: 'Board id invalide' });

  if (req.method === 'GET') return getBoard(id, res, ctx);
  if (req.method === 'PATCH') return patchBoard(id, req, res, ctx);
  if (req.method === 'DELETE') return deleteBoard(id, res, ctx);

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function getBoard(
  id: string,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { data: board, error } = await supabaseAdmin!
    .from('task_boards')
    .select('id, name, description, position, is_archived')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logger.error('[admin/tasks/boards/:id] get error', error);
    return res.status(500).json({ error: 'Échec du chargement' });
  }
  if (!board) return res.status(404).json({ error: 'Board introuvable' });

  const [{ data: colsData }, { data: tasksData }] = await Promise.all([
    supabaseAdmin!
      .from('task_columns')
      .select('id, name, position, wip_limit, is_done')
      .eq('tenant_id', ctx.tenantId)
      .eq('board_id', id),
    supabaseAdmin!
      .from('tasks')
      .select(
        'id, column_id, title, description, priority, assignee_staff_id, due_date, position, labels'
      )
      .eq('tenant_id', ctx.tenantId)
      .eq('board_id', id)
      .is('deleted_at', null),
  ]);

  const cols = (colsData ?? []) as Array<{
    id: string;
    name: string;
    position: number | null;
    wip_limit: number | null;
    is_done: boolean;
  }>;
  const tasks = (tasksData ?? []) as Array<{
    id: string;
    column_id: string;
    title: string;
    description: string | null;
    priority: string;
    assignee_staff_id: string | null;
    due_date: string | null;
    position: number | null;
    labels: string[] | null;
  }>;

  // Résolution des noms d'assignés en un seul round-trip.
  const assigneeIds = Array.from(
    new Set(tasks.map((t) => t.assignee_staff_id).filter(Boolean))
  ) as string[];
  const nameById = new Map<string, string | null>();
  if (assigneeIds.length) {
    const { data: staffRows } = await supabaseAdmin!
      .from('staff')
      .select('id, display_name')
      .in('id', assigneeIds);
    for (const s of (staffRows ?? []) as Array<{
      id: string;
      display_name: string | null;
    }>) {
      nameById.set(s.id, s.display_name ?? null);
    }
  }

  // Agrégats extras de carte (checklist + commentaires) — un count groupé par
  // task_id sur les cartes du board, pas de N+1. Cartes sans extras → 0/0.
  const taskIds = tasks.map((t) => t.id);
  const checklistByTask = new Map<string, { done: number; total: number }>();
  const commentCountByTask = new Map<string, number>();
  if (taskIds.length) {
    const [{ data: checklistRows }, { data: commentRows }] = await Promise.all([
      supabaseAdmin!
        .from('task_checklist_items')
        .select('task_id, is_done')
        .eq('tenant_id', ctx.tenantId)
        .in('task_id', taskIds),
      supabaseAdmin!
        .from('task_comments')
        .select('task_id')
        .eq('tenant_id', ctx.tenantId)
        .in('task_id', taskIds),
    ]);
    for (const r of (checklistRows ?? []) as Array<{
      task_id: string;
      is_done: boolean;
    }>) {
      const agg = checklistByTask.get(r.task_id) ?? { done: 0, total: 0 };
      agg.total += 1;
      if (r.is_done === true) agg.done += 1;
      checklistByTask.set(r.task_id, agg);
    }
    for (const r of (commentRows ?? []) as Array<{ task_id: string }>) {
      commentCountByTask.set(
        r.task_id,
        (commentCountByTask.get(r.task_id) ?? 0) + 1
      );
    }
  }

  const b = board as {
    id: string;
    name: string;
    description: string | null;
    position: number | null;
    is_archived: boolean;
  };

  const columns = cols
    .sort((a, c) => (a.position ?? 0) - (c.position ?? 0))
    .map((c) => ({
      id: c.id,
      name: c.name,
      position: c.position ?? 0,
      wipLimit: c.wip_limit ?? null,
      isDone: c.is_done === true,
      tasks: tasks
        .filter((t) => t.column_id === c.id)
        .sort((x, y) => (x.position ?? 0) - (y.position ?? 0))
        .map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description ?? null,
          priority: t.priority,
          position: t.position ?? 0,
          dueDate: t.due_date ?? null,
          labels: Array.isArray(t.labels) ? t.labels : [],
          assignee: t.assignee_staff_id
            ? {
                staffId: t.assignee_staff_id,
                name: nameById.get(t.assignee_staff_id) ?? null,
              }
            : null,
          checklist: checklistByTask.get(t.id) ?? { done: 0, total: 0 },
          commentCount: commentCountByTask.get(t.id) ?? 0,
        })),
    }));

  return res.status(200).json({
    board: {
      id: b.id,
      name: b.name,
      description: b.description ?? null,
      position: b.position ?? 0,
      isArchived: b.is_archived === true,
      columns,
    },
  });
}

async function patchBoard(
  id: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const parsed = patchBoardBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: formatZodError(parsed.error),
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { data: existing } = await supabaseAdmin!
    .from('task_boards')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .maybeSingle();
  if (!existing) return res.status(404).json({ error: 'Board introuvable' });

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined)
    updates.description = parsed.data.description;
  if (parsed.data.position !== undefined)
    updates.position = parsed.data.position;
  if (parsed.data.is_archived !== undefined)
    updates.is_archived = parsed.data.is_archived;

  const { data: updated, error } = await supabaseAdmin!
    .from('task_boards')
    .update(updates)
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .select('id, name, description, position, is_archived')
    .maybeSingle();
  if (error || !updated) {
    logger.error('[admin/tasks/boards/:id] patch error', error);
    return res.status(500).json({ error: 'Échec de la mise à jour' });
  }

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'task_board_update',
      entity_type: 'task_board',
      entity_id: id,
      tenant_id: ctx.tenantId,
      payload: { fields: Object.keys(parsed.data) },
    });
  } catch (e) {
    logger.error('[admin/tasks/boards/:id] audit error', e);
  }

  const u = updated as {
    id: string;
    name: string;
    description: string | null;
    position: number | null;
    is_archived: boolean;
  };
  return res.status(200).json({
    board: {
      id: u.id,
      name: u.name,
      description: u.description ?? null,
      position: u.position ?? 0,
      isArchived: u.is_archived === true,
    },
  });
}

async function deleteBoard(
  id: string,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { data: existing } = await supabaseAdmin!
    .from('task_boards')
    .select('id, name')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .maybeSingle();
  if (!existing) return res.status(404).json({ error: 'Board introuvable' });

  const { error } = await supabaseAdmin!
    .from('task_boards')
    .delete()
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id);
  if (error) {
    logger.error('[admin/tasks/boards/:id] delete error', error);
    return res.status(500).json({ error: 'Échec de la suppression' });
  }

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'task_board_delete',
      entity_type: 'task_board',
      entity_id: id,
      tenant_id: ctx.tenantId,
      payload: { name: (existing as { name: string }).name },
    });
  } catch (e) {
    logger.error('[admin/tasks/boards/:id] audit error', e);
  }

  return res.status(200).json({ success: true });
}
