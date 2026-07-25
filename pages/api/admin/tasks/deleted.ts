// pages/api/admin/tasks/deleted.ts
//
// Kanban interne (staff-only). Corbeille : cartes soft-deleted du tenant.
//
//   GET ?boardId=<uuid?>&limit=<n?> → { tasks: [{ id, title, boardId,
//        boardName, columnId, columnName, priority, dueDate, deletedAt }] }
//        Cartes avec deleted_at IS NOT NULL, filtrées par boardId si fourni,
//        triées deleted_at DESC, plafonnées (défaut 100). On montre TOUT, y
//        compris les cartes dont le board est archivé (une carte supprimée
//        peut appartenir à un board encore actif).
//
// Auth : withStaffRoute('admin'). Scoping tenant via ctx.tenantId. La
// restauration se fait via PATCH /api/admin/tasks/tasks/[id]/restore.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { deletedTasksQuerySchema } from '@/utils/taskBoardSchemas';
import { formatZodError } from '@/utils/validation';
import { logger } from '@/utils/logger';

export default withStaffRoute(handler, 'admin');

const DEFAULT_LIMIT = 100;

type DeletedTaskRow = {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  priority: string;
  due_date: string | null;
  deleted_at: string | null;
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

  const rawBoardId = Array.isArray(req.query.boardId)
    ? req.query.boardId[0]
    : req.query.boardId;
  const rawLimit = Array.isArray(req.query.limit)
    ? req.query.limit[0]
    : req.query.limit;
  const parsed = deletedTasksQuerySchema.safeParse({
    boardId: rawBoardId,
    limit: rawLimit,
  });
  if (!parsed.success) {
    return res.status(400).json({
      error: formatZodError(parsed.error),
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const limit = parsed.data.limit ?? DEFAULT_LIMIT;

  let query = supabaseAdmin
    .from('tasks')
    .select('id, board_id, column_id, title, priority, due_date, deleted_at')
    .eq('tenant_id', ctx.tenantId)
    .not('deleted_at', 'is', null);
  if (parsed.data.boardId) {
    query = query.eq('board_id', parsed.data.boardId);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('[admin/tasks/deleted] list error', error);
    return res.status(500).json({ error: 'Échec du chargement' });
  }

  // Tri deleted_at DESC applicatif (le mock ignore .order ; en prod l'ordre est
  // de toute façon re-garanti ici) puis plafonnement.
  const rows = ((data ?? []) as DeletedTaskRow[])
    .slice()
    .sort((a, b) =>
      String(b.deleted_at ?? '').localeCompare(String(a.deleted_at ?? ''))
    )
    .slice(0, limit);

  // Résolution des noms board + colonne en deux round-trips groupés.
  const boardIds = Array.from(new Set(rows.map((r) => r.board_id)));
  const columnIds = Array.from(new Set(rows.map((r) => r.column_id)));
  const boardNameById = new Map<string, string>();
  const columnNameById = new Map<string, string>();
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
      .select('id, name')
      .eq('tenant_id', ctx.tenantId)
      .in('id', columnIds);
    for (const c of (colRows ?? []) as Array<{ id: string; name: string }>) {
      columnNameById.set(c.id, c.name);
    }
  }

  const tasks = rows.map((r) => ({
    id: r.id,
    title: r.title,
    boardId: r.board_id,
    boardName: boardNameById.get(r.board_id) ?? null,
    columnId: r.column_id,
    columnName: columnNameById.get(r.column_id) ?? null,
    priority: r.priority,
    dueDate: r.due_date ?? null,
    deletedAt: r.deleted_at ?? null,
  }));

  return res.status(200).json({ tasks });
}
