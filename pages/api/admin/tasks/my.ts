// pages/api/admin/tasks/my.ts
//
// Kanban interne (staff-only). Vue transverse « Mes tâches ».
//
//   GET → toutes les cartes vivantes (deleted_at IS NULL) assignées au staff
//         courant (ctx.staff.id), TOUS boards du tenant confondus. Chaque carte
//         est enrichie de boardName / columnName / columnIsDone / dueDate.
//         Tri : dueDate asc (les cartes sans échéance en dernier), puis
//         priorité (urgent > high > medium > low).
//
// Auth : withStaffRoute('admin'). Scoping tenant via ctx.tenantId.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logger } from '@/utils/logger';

export default withStaffRoute(handler, 'admin');

// Poids de tri de la priorité (plus grand = plus urgent → placé en premier).
const PRIORITY_WEIGHT: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data: taskData, error } = await supabaseAdmin
    .from('tasks')
    .select(
      'id, board_id, column_id, title, description, priority, assignee_staff_id, due_date, position, labels'
    )
    .eq('tenant_id', ctx.tenantId)
    .eq('assignee_staff_id', ctx.staff.id)
    .is('deleted_at', null);
  if (error) {
    logger.error('[admin/tasks/my] list error', error);
    return res.status(500).json({ error: 'Échec du chargement' });
  }
  const tasks = (taskData ?? []) as TaskRow[];

  // Noms des boards + colonnes (is_done) en deux round-trips groupés.
  const boardIds = Array.from(new Set(tasks.map((t) => t.board_id)));
  const columnIds = Array.from(new Set(tasks.map((t) => t.column_id)));
  const boardNameById = new Map<string, string>();
  const columnById = new Map<string, { name: string; isDone: boolean }>();
  if (boardIds.length) {
    const { data: boardRows } = await supabaseAdmin
      .from('task_boards')
      .select('id, name')
      .eq('tenant_id', ctx.tenantId)
      .in('id', boardIds);
    for (const b of (boardRows ?? []) as Array<{ id: string; name: string }>) {
      boardNameById.set(b.id, b.name);
    }
  }
  if (columnIds.length) {
    const { data: colRows } = await supabaseAdmin
      .from('task_columns')
      .select('id, name, is_done')
      .eq('tenant_id', ctx.tenantId)
      .in('id', columnIds);
    for (const c of (colRows ?? []) as Array<{
      id: string;
      name: string;
      is_done: boolean;
    }>) {
      columnById.set(c.id, { name: c.name, isDone: c.is_done === true });
    }
  }

  const assigneeName = ctx.staff.display_name ?? null;

  const enriched = tasks.map((t) => {
    const col = columnById.get(t.column_id);
    return {
      id: t.id,
      title: t.title,
      description: t.description ?? null,
      boardId: t.board_id,
      boardName: boardNameById.get(t.board_id) ?? null,
      columnId: t.column_id,
      columnName: col?.name ?? null,
      columnIsDone: col?.isDone ?? false,
      priority: t.priority,
      assigneeStaffId: t.assignee_staff_id ?? null,
      assigneeName,
      dueDate: t.due_date ?? null,
      labels: Array.isArray(t.labels) ? t.labels : [],
    };
  });

  // Tri : dueDate asc (null en dernier), puis priorité décroissante.
  enriched.sort((a, b) => {
    if (a.dueDate !== b.dueDate) {
      if (a.dueDate === null) return 1;
      if (b.dueDate === null) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    }
    return (
      (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0)
    );
  });

  return res.status(200).json({ tasks: enriched });
}
