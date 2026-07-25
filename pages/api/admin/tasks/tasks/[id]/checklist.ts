// pages/api/admin/tasks/tasks/[id]/checklist.ts
//
// Kanban interne (staff-only). Checklist (sous-tâches) d'une carte.
//
//   GET  → { items: [{ id, label, isDone, position }] } triés par position.
//   POST { label } → 201 { item } (position = max+1).
//
// Auth : withStaffRoute('admin'). Scoping tenant via ctx.tenantId. L'édition /
// suppression d'un item vit sur /api/admin/tasks/checklist/[id].
//
// Pas d'audit : un toggle de checklist est trop verbeux pour staff_logs (seuls
// les commentaires sont logués).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { loadChecklistItems } from '@/utils/taskBoard';
import { createChecklistItemBodySchema } from '@/utils/taskBoardSchemas';
import { formatZodError } from '@/utils/validation';
import { logger } from '@/utils/logger';

export default withStaffRoute(handler, 'admin');

function taskId(req: NextApiRequest): string | null {
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
  const id = taskId(req);
  if (!id) return res.status(400).json({ error: 'Task id invalide' });

  if (req.method === 'GET') return listItems(id, res, ctx);
  if (req.method === 'POST') return createItem(id, req, res, ctx);

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function taskExists(
  id: string,
  ctx: AuthenticatedStaffContext
): Promise<boolean> {
  const { data } = await supabaseAdmin!
    .from('tasks')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  return Boolean(data);
}

async function listItems(
  id: string,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!(await taskExists(id, ctx))) {
    return res.status(404).json({ error: 'Tâche introuvable' });
  }
  const items = await loadChecklistItems(ctx.tenantId, id);
  return res.status(200).json({ items });
}

/** Position max des items d'une carte, ou -1 si la checklist est vide. */
async function maxPosition(tenantId: string, taskId: string): Promise<number> {
  const { data } = await supabaseAdmin!
    .from('task_checklist_items')
    .select('position')
    .eq('tenant_id', tenantId)
    .eq('task_id', taskId);
  const rows = (data ?? []) as Array<{ position: number | null }>;
  return rows.reduce(
    (max, r) => Math.max(max, typeof r.position === 'number' ? r.position : 0),
    -1
  );
}

async function createItem(
  id: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const parsed = createChecklistItemBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: formatZodError(parsed.error),
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  if (!(await taskExists(id, ctx))) {
    return res.status(404).json({ error: 'Tâche introuvable' });
  }

  const position = (await maxPosition(ctx.tenantId, id)) + 1;

  const { data: inserted, error } = await supabaseAdmin!
    .from('task_checklist_items')
    .insert({
      tenant_id: ctx.tenantId,
      task_id: id,
      label: parsed.data.label,
      is_done: false,
      position,
    })
    .select('id, label, is_done, position')
    .maybeSingle();
  if (error || !inserted) {
    logger.error('[admin/tasks/checklist] create error', error);
    return res.status(500).json({ error: "Échec de la création de l'item" });
  }
  const row = inserted as {
    id: string;
    label: string;
    is_done: boolean;
    position: number | null;
  };

  return res.status(201).json({
    item: {
      id: row.id,
      label: row.label,
      isDone: row.is_done === true,
      position: row.position ?? 0,
    },
  });
}
