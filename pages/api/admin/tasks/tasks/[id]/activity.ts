// pages/api/admin/tasks/tasks/[id]/activity.ts
//
// Kanban interne (staff-only). Timeline d'activité d'une carte.
//
//   GET → historique des actions staff portant sur la carte, ordonné
//         created_at DESC :
//         { activity: [{ action, actorName, createdAt, payload }] }.
//
// Sources dans `staff_logs` (cf. utils/taskBoard.ts + les handlers de carte) :
//   - actions « carte » (task_create / task_update / task_move / task_assign /
//     task_delete) : entity_type='task', entity_id = taskId.
//   - actions « commentaire » (task_comment_create / task_comment_delete) :
//     entity_type='task_comment', entity_id = <commentId>, mais payload.task_id
//     = taskId → on les rattache par le payload.
// L'humanisation des libellés se fait côté UI ; on renvoie l'action brute + le
// payload tel quel.
//
// Auth : withStaffRoute('admin'). Scoping tenant via ctx.tenantId.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { resolveStaffNames } from '@/utils/taskBoard';

export default withStaffRoute(handler, 'admin');

/** Actions « commentaire » rattachées à la carte via payload.task_id. */
const COMMENT_ACTIONS = ['task_comment_create', 'task_comment_delete'] as const;

type LogRow = {
  action: string;
  staff_id: string | null;
  created_at: string;
  payload: Record<string, unknown> | null;
};

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
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const id = taskId(req);
  if (!id) return res.status(400).json({ error: 'Task id invalide' });

  // La carte doit exister (non soft-deletée) pour le tenant courant.
  const { data: task } = await supabaseAdmin
    .from('tasks')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });

  // 1) Actions « carte » : entity_type='task', entity_id = taskId.
  // 2) Actions « commentaire » : payload.task_id = taskId.
  const [{ data: taskLogs }, { data: commentLogs }] = await Promise.all([
    supabaseAdmin
      .from('staff_logs')
      .select('action, staff_id, created_at, payload')
      .eq('tenant_id', ctx.tenantId)
      .eq('entity_type', 'task')
      .eq('entity_id', id),
    supabaseAdmin
      .from('staff_logs')
      .select('action, staff_id, created_at, payload')
      .eq('tenant_id', ctx.tenantId)
      .in('action', COMMENT_ACTIONS as unknown as string[])
      .filter('payload->>task_id', 'eq', id),
  ]);

  const rows = [
    ...((taskLogs ?? []) as LogRow[]),
    ...((commentLogs ?? []) as LogRow[]),
  ];
  if (rows.length === 0) {
    return res.status(200).json({ activity: [] });
  }

  // Résolution des noms d'acteurs en un seul round-trip (embed staff existant).
  const names = await resolveStaffNames(rows.map((r) => r.staff_id));

  const activity = rows
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((r) => ({
      action: r.action,
      actorName: r.staff_id ? (names.get(r.staff_id) ?? null) : null,
      createdAt: r.created_at,
      payload: r.payload ?? null,
    }));

  return res.status(200).json({ activity });
}
