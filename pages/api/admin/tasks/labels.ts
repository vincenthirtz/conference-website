// pages/api/admin/tasks/labels.ts
//
// Kanban interne (staff-only). Création d'une définition de label colorée.
//
//   POST { boardId, name, color(#rrggbb) } → 201 { label } (position = max+1).
//         409 { code: 'label_exists' } si (board, name) déjà pris.
//
// Le lien carte ↔ label est par NOM (tasks.labels[] stocke les noms bruts) ;
// cette table ne porte que la couleur/position. Auth : withStaffRoute('admin').

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { maxLabelPosition } from '@/utils/taskBoard';
import { createLabelBodySchema } from '@/utils/taskBoardSchemas';
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

  const parsed = createLabelBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: formatZodError(parsed.error),
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const { boardId, name, color } = parsed.data;

  // Le board doit exister pour le tenant courant.
  const { data: board } = await supabaseAdmin
    .from('task_boards')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', boardId)
    .maybeSingle();
  if (!board) return res.status(404).json({ error: 'Board introuvable' });

  // Unicité applicative (board, name) — double la contrainte DB pour renvoyer
  // un 409 propre plutôt qu'une 500 d'insert en conflit.
  const { data: existing } = await supabaseAdmin
    .from('task_labels')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('board_id', boardId)
    .eq('name', name)
    .maybeSingle();
  if (existing) {
    return res
      .status(409)
      .json({ error: 'Un label porte déjà ce nom', code: 'label_exists' });
  }

  const position = (await maxLabelPosition(ctx.tenantId, boardId)) + 1;

  const { data: inserted, error } = await supabaseAdmin
    .from('task_labels')
    .insert({
      tenant_id: ctx.tenantId,
      board_id: boardId,
      name,
      color,
      position,
    })
    .select('id, name, color, position')
    .maybeSingle();
  if (error || !inserted) {
    logger.error('[admin/tasks/labels] create error', error);
    return res.status(500).json({ error: 'Échec de la création du label' });
  }
  const row = inserted as {
    id: string;
    name: string;
    color: string;
    position: number | null;
  };

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'task_label_create',
      entity_type: 'task_label',
      entity_id: row.id,
      tenant_id: ctx.tenantId,
      payload: { board_id: boardId, name: row.name, color: row.color },
    });
  } catch (e) {
    logger.error('[admin/tasks/labels] audit error', e);
  }

  return res.status(201).json({
    label: {
      id: row.id,
      name: row.name,
      color: row.color,
      position: row.position ?? 0,
    },
  });
}
