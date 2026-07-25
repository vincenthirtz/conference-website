// pages/api/admin/tasks/boards.ts
//
// Kanban interne (staff-only). Liste + création de boards.
//
//   GET  ?includeArchived=1  → boards du tenant courant (non archivés par
//        défaut), chacun avec ses colonnes ordonnées + le nombre de cartes
//        vivantes par colonne.
//   POST { name, description? } → crée le board + ses 4 colonnes par défaut.
//
// Auth : withStaffRoute('admin'). Scoping tenant via ctx.tenantId.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { createDefaultColumns } from '@/utils/taskBoard';
import { createBoardBodySchema } from '@/utils/taskBoardSchemas';
import { formatZodError } from '@/utils/validation';
import { logger } from '@/utils/logger';

export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }

  if (req.method === 'GET') return listBoards(req, res, ctx);
  if (req.method === 'POST') return createBoard(req, res, ctx);

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function listBoards(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const includeArchived =
    req.query.includeArchived === '1' || req.query.includeArchived === 'true';

  let boardQuery = supabaseAdmin!
    .from('task_boards')
    .select('id, name, description, position, is_archived, created_at')
    .eq('tenant_id', ctx.tenantId);
  if (!includeArchived) boardQuery = boardQuery.eq('is_archived', false);

  const { data: boardsData, error: boardsErr } = await boardQuery;
  if (boardsErr) {
    logger.error('[admin/tasks/boards] list error', boardsErr);
    return res.status(500).json({ error: 'Échec du chargement des boards' });
  }
  const boards = (boardsData ?? []) as Array<{
    id: string;
    name: string;
    description: string | null;
    position: number | null;
    is_archived: boolean;
    created_at: string;
  }>;
  boards.sort(
    (a, b) =>
      (a.position ?? 0) - (b.position ?? 0) ||
      String(a.created_at).localeCompare(String(b.created_at))
  );

  const boardIds = boards.map((b) => b.id);
  const [{ data: colsData }, { data: tasksData }] = await Promise.all([
    supabaseAdmin!
      .from('task_columns')
      .select('id, board_id, name, position, wip_limit, is_done')
      .eq('tenant_id', ctx.tenantId)
      .in('board_id', boardIds.length ? boardIds : ['__none__']),
    supabaseAdmin!
      .from('tasks')
      .select('id, board_id, column_id')
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null)
      .in('board_id', boardIds.length ? boardIds : ['__none__']),
  ]);

  const cols = (colsData ?? []) as Array<{
    id: string;
    board_id: string;
    name: string;
    position: number | null;
    wip_limit: number | null;
    is_done: boolean;
  }>;
  const tasks = (tasksData ?? []) as Array<{ column_id: string }>;

  const countByColumn = new Map<string, number>();
  for (const t of tasks) {
    countByColumn.set(t.column_id, (countByColumn.get(t.column_id) ?? 0) + 1);
  }

  const result = boards.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description ?? null,
    position: b.position ?? 0,
    isArchived: b.is_archived === true,
    columns: cols
      .filter((c) => c.board_id === b.id)
      .sort((a, c) => (a.position ?? 0) - (c.position ?? 0))
      .map((c) => ({
        id: c.id,
        name: c.name,
        position: c.position ?? 0,
        wipLimit: c.wip_limit ?? null,
        isDone: c.is_done === true,
        cardCount: countByColumn.get(c.id) ?? 0,
      })),
  }));

  return res.status(200).json({ boards: result });
}

async function createBoard(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const parsed = createBoardBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: formatZodError(parsed.error),
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { data: inserted, error } = await supabaseAdmin!
    .from('task_boards')
    .insert({
      tenant_id: ctx.tenantId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      position: 0,
      is_archived: false,
      created_by: ctx.staff.id,
    })
    .select('id, name, description, position, is_archived')
    .maybeSingle();
  if (error || !inserted) {
    logger.error('[admin/tasks/boards] create error', error);
    return res.status(500).json({ error: 'Échec de la création du board' });
  }
  const board = inserted as {
    id: string;
    name: string;
    description: string | null;
    position: number;
    is_archived: boolean;
  };

  const columns = await createDefaultColumns(ctx.tenantId, board.id);

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'task_board_create',
      entity_type: 'task_board',
      entity_id: board.id,
      tenant_id: ctx.tenantId,
      payload: { name: board.name },
    });
  } catch (e) {
    logger.error('[admin/tasks/boards] audit error', e);
  }

  return res.status(201).json({
    board: {
      id: board.id,
      name: board.name,
      description: board.description ?? null,
      position: board.position ?? 0,
      isArchived: board.is_archived === true,
      columns: columns
        .sort((a, b) => a.position - b.position)
        .map((c) => ({
          id: c.id,
          name: c.name,
          position: c.position,
          wipLimit: c.wip_limit ?? null,
          isDone: c.is_done === true,
          cardCount: 0,
        })),
    },
  });
}
