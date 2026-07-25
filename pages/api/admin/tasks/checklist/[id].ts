// pages/api/admin/tasks/checklist/[id].ts
//
// Kanban interne (staff-only). Édition / suppression d'un item de checklist.
//
//   PATCH { label?, isDone?, position? } → 200 { item }.
//   DELETE → 200 { success: true }.
//
// Auth : withStaffRoute('admin'). Scoping tenant via ctx.tenantId. Pas d'audit
// (toggle checklist trop verbeux — cf. checklist.ts).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { patchChecklistItemBodySchema } from '@/utils/taskBoardSchemas';
import { formatZodError } from '@/utils/validation';
import { logger } from '@/utils/logger';

export default withStaffRoute(handler, 'admin');

function itemId(req: NextApiRequest): string | null {
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
  const id = itemId(req);
  if (!id) return res.status(400).json({ error: 'Item id invalide' });

  if (req.method === 'PATCH') return patchItem(id, req, res, ctx);
  if (req.method === 'DELETE') return deleteItem(id, res, ctx);

  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function patchItem(
  id: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const parsed = patchChecklistItemBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: formatZodError(parsed.error),
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { data: existing } = await supabaseAdmin!
    .from('task_checklist_items')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .maybeSingle();
  if (!existing) return res.status(404).json({ error: 'Item introuvable' });

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.label !== undefined) updates.label = parsed.data.label;
  if (parsed.data.isDone !== undefined) updates.is_done = parsed.data.isDone;
  if (parsed.data.position !== undefined)
    updates.position = parsed.data.position;

  const { data: updated, error } = await supabaseAdmin!
    .from('task_checklist_items')
    .update(updates)
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .select('id, label, is_done, position')
    .maybeSingle();
  if (error || !updated) {
    logger.error('[admin/tasks/checklist/:id] patch error', error);
    return res.status(500).json({ error: 'Échec de la mise à jour' });
  }
  const row = updated as {
    id: string;
    label: string;
    is_done: boolean;
    position: number | null;
  };

  return res.status(200).json({
    item: {
      id: row.id,
      label: row.label,
      isDone: row.is_done === true,
      position: row.position ?? 0,
    },
  });
}

async function deleteItem(
  id: string,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { data: existing } = await supabaseAdmin!
    .from('task_checklist_items')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .maybeSingle();
  if (!existing) return res.status(404).json({ error: 'Item introuvable' });

  const { error } = await supabaseAdmin!
    .from('task_checklist_items')
    .delete()
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id);
  if (error) {
    logger.error('[admin/tasks/checklist/:id] delete error', error);
    return res.status(500).json({ error: 'Échec de la suppression' });
  }

  return res.status(200).json({ success: true });
}
