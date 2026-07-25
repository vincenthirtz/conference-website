// pages/api/admin/tasks/columns.ts
//
// Kanban interne (staff-only). Création d'une colonne dans un board.
//
//   POST { boardId, name, wipLimit?, isDone? } → position = max+1 dans le board.
//
// Auth : withStaffRoute('admin'). Scoping tenant via ctx.tenantId.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { createColumnBodySchema } from '@/utils/taskBoardSchemas';
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
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = createColumnBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: formatZodError(parsed.error),
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const { boardId, name, wipLimit, isDone } = parsed.data;

  const { data: board } = await supabaseAdmin
    .from('task_boards')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', boardId)
    .maybeSingle();
  if (!board) return res.status(404).json({ error: 'Board introuvable' });

  // position = max+1 parmi les colonnes du board.
  const { data: existingCols } = await supabaseAdmin
    .from('task_columns')
    .select('position')
    .eq('tenant_id', ctx.tenantId)
    .eq('board_id', boardId);
  const position =
    ((existingCols ?? []) as { position: number | null }[]).reduce(
      (max, c) =>
        Math.max(max, typeof c.position === 'number' ? c.position : 0),
      -1
    ) + 1;

  const { data: inserted, error } = await supabaseAdmin
    .from('task_columns')
    .insert({
      tenant_id: ctx.tenantId,
      board_id: boardId,
      name,
      position,
      wip_limit: wipLimit ?? null,
      is_done: isDone ?? false,
    })
    .select('id, board_id, name, position, wip_limit, is_done')
    .maybeSingle();
  if (error || !inserted) {
    logger.error('[admin/tasks/columns] create error', error);
    return res
      .status(500)
      .json({ error: 'Échec de la création de la colonne' });
  }

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'task_column_create',
      entity_type: 'task_column',
      entity_id: (inserted as { id: string }).id,
      tenant_id: ctx.tenantId,
      payload: { board_id: boardId, name },
    });
  } catch (e) {
    logger.error('[admin/tasks/columns] audit error', e);
  }

  const c = inserted as {
    id: string;
    board_id: string;
    name: string;
    position: number;
    wip_limit: number | null;
    is_done: boolean;
  };
  return res.status(201).json({
    column: {
      id: c.id,
      boardId: c.board_id,
      name: c.name,
      position: c.position,
      wipLimit: c.wip_limit ?? null,
      isDone: c.is_done === true,
    },
  });
}
