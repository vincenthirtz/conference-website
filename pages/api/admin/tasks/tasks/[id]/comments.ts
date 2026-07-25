// pages/api/admin/tasks/tasks/[id]/comments.ts
//
// Kanban interne (staff-only). Fil de commentaires d'une carte.
//
//   GET  → { comments: [{ id, body, authorStaffId, authorName, createdAt }] }
//          triés par created_at asc.
//   POST { body } → 201 { comment } (auteur = ctx.staff.id).
//
// Auth : withStaffRoute('admin'). Scoping tenant via ctx.tenantId. La
// suppression d'un commentaire vit sur /api/admin/tasks/comments/[id].

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { loadTaskComments, resolveStaffNames } from '@/utils/taskBoard';
import { createCommentBodySchema } from '@/utils/taskBoardSchemas';
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

  if (req.method === 'GET') return listComments(id, res, ctx);
  if (req.method === 'POST') return createComment(id, req, res, ctx);

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

/** Vérifie que la carte existe (non soft-deletée) pour le tenant courant. */
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

async function listComments(
  id: string,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!(await taskExists(id, ctx))) {
    return res.status(404).json({ error: 'Tâche introuvable' });
  }
  const comments = await loadTaskComments(ctx.tenantId, id);
  return res.status(200).json({ comments });
}

async function createComment(
  id: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const parsed = createCommentBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: formatZodError(parsed.error),
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  if (!(await taskExists(id, ctx))) {
    return res.status(404).json({ error: 'Tâche introuvable' });
  }

  const { data: inserted, error } = await supabaseAdmin!
    .from('task_comments')
    .insert({
      tenant_id: ctx.tenantId,
      task_id: id,
      author_staff_id: ctx.staff.id,
      body: parsed.data.body,
    })
    .select('id, body, author_staff_id, created_at')
    .maybeSingle();
  if (error || !inserted) {
    logger.error('[admin/tasks/comments] create error', error);
    return res
      .status(500)
      .json({ error: 'Échec de la création du commentaire' });
  }
  const row = inserted as {
    id: string;
    body: string;
    author_staff_id: string | null;
    created_at: string;
  };

  const names = await resolveStaffNames([row.author_staff_id]);

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'task_comment_create',
      entity_type: 'task_comment',
      entity_id: row.id,
      tenant_id: ctx.tenantId,
      payload: { task_id: id },
    });
  } catch (e) {
    logger.error('[admin/tasks/comments] audit error', e);
  }

  return res.status(201).json({
    comment: {
      id: row.id,
      body: row.body,
      authorStaffId: row.author_staff_id ?? null,
      authorName: row.author_staff_id
        ? (names.get(row.author_staff_id) ?? null)
        : null,
      createdAt: row.created_at,
    },
  });
}
