// pages/api/admin/tasks/labels/[id].ts
//
// Kanban interne (staff-only). Édition + suppression d'une définition de label.
//
//   PATCH  { name?, color?, position? } → 200 { label }.
//          Si `name` change : CASCADE le renommage dans les cartes du board
//          (tasks.labels[]) pour garder les pastilles cohérentes. 409
//          { code: 'label_exists' } si le nouveau nom entre en collision.
//   DELETE → 200 { success: true }.
//          NE strippe PAS le nom des cartes : les occurrences dans
//          tasks.labels[] restent inertes et retombent simplement en couleur
//          neutre côté UI (jointure par nom, sans définition = neutre). Choix
//          assumé — on ne veut pas muter silencieusement les cartes à la
//          suppression d'une définition (réversible en recréant le label).
//
// Auth : withStaffRoute('admin'). Scoping tenant via ctx.tenantId.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { cascadeRenameLabel } from '@/utils/taskBoard';
import { patchLabelBodySchema } from '@/utils/taskBoardSchemas';
import { formatZodError } from '@/utils/validation';
import { logger } from '@/utils/logger';

export default withStaffRoute(handler, { permission: 'manage_tasks' });

function labelId(req: NextApiRequest): string | null {
  const raw = req.query.id;
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' && isValidUUID(v) ? v : null;
}

type LabelRow = {
  id: string;
  board_id: string;
  name: string;
  color: string;
  position: number | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }
  const id = labelId(req);
  if (!id) return res.status(400).json({ error: 'Label id invalide' });

  if (req.method === 'PATCH') return patchLabel(id, req, res, ctx);
  if (req.method === 'DELETE') return deleteLabel(id, res, ctx);

  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function loadLabel(
  id: string,
  ctx: AuthenticatedStaffContext
): Promise<LabelRow | null> {
  const { data } = await supabaseAdmin!
    .from('task_labels')
    .select('id, board_id, name, color, position')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .maybeSingle();
  return (data as LabelRow | null) ?? null;
}

async function patchLabel(
  id: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const parsed = patchLabelBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: formatZodError(parsed.error),
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const existing = await loadLabel(id, ctx);
  if (!existing) return res.status(404).json({ error: 'Label introuvable' });

  const renaming =
    parsed.data.name !== undefined && parsed.data.name !== existing.name;

  // Collision de nom dans le board si on renomme.
  if (renaming) {
    const { data: clash } = await supabaseAdmin!
      .from('task_labels')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('board_id', existing.board_id)
      .eq('name', parsed.data.name)
      .maybeSingle();
    if (clash && (clash as { id: string }).id !== id) {
      return res
        .status(409)
        .json({ error: 'Un label porte déjà ce nom', code: 'label_exists' });
    }
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.color !== undefined) updates.color = parsed.data.color;
  if (parsed.data.position !== undefined)
    updates.position = parsed.data.position;

  const { data: updated, error } = await supabaseAdmin!
    .from('task_labels')
    .update(updates)
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .select('id, board_id, name, color, position')
    .maybeSingle();
  if (error || !updated) {
    logger.error('[admin/tasks/labels/:id] patch error', error);
    return res.status(500).json({ error: 'Échec de la mise à jour' });
  }

  // Répercute le renommage sur les cartes du board (tasks.labels[]).
  let cascaded = 0;
  if (renaming) {
    cascaded = await cascadeRenameLabel(
      ctx.tenantId,
      existing.board_id,
      existing.name,
      parsed.data.name as string
    );
  }

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'task_label_update',
      entity_type: 'task_label',
      entity_id: id,
      tenant_id: ctx.tenantId,
      payload: {
        board_id: existing.board_id,
        fields: Object.keys(parsed.data),
        ...(renaming
          ? {
              renamed_from: existing.name,
              renamed_to: parsed.data.name,
              cards_updated: cascaded,
            }
          : {}),
      },
    });
  } catch (e) {
    logger.error('[admin/tasks/labels/:id] audit error', e);
  }

  const u = updated as LabelRow;
  return res.status(200).json({
    label: {
      id: u.id,
      name: u.name,
      color: u.color,
      position: u.position ?? 0,
    },
  });
}

async function deleteLabel(
  id: string,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const existing = await loadLabel(id, ctx);
  if (!existing) return res.status(404).json({ error: 'Label introuvable' });

  const { error } = await supabaseAdmin!
    .from('task_labels')
    .delete()
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id);
  if (error) {
    logger.error('[admin/tasks/labels/:id] delete error', error);
    return res.status(500).json({ error: 'Échec de la suppression' });
  }

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'task_label_delete',
      entity_type: 'task_label',
      entity_id: id,
      tenant_id: ctx.tenantId,
      payload: { board_id: existing.board_id, name: existing.name },
    });
  } catch (e) {
    logger.error('[admin/tasks/labels/:id] audit error', e);
  }

  return res.status(200).json({ success: true });
}
