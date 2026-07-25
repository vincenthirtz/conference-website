// pages/api/cron/task-due-reminders.ts
//
// Scheduled function (Netlify) — rappel J-1 des cartes du Kanban interne dont
// l'échéance (`tasks.due_date`) tombe demain et qui ne sont pas dans une colonne
// terminale (`task_columns.is_done`).
//
// Pour chaque carte éligible, émet un event `task.due_soon` (outbox → push/DM
// Discord via le bot). La déduplication est naturelle : on cible exactement
// `due_date = CURRENT_DATE + 1`, donc une carte donnée n'est rappelée qu'une
// seule fois (le jour J-1). Aucune estampille nécessaire.
//
// Auth : Bearer CRON_SECRET (header) ou ?secret=... (query). Même pattern que
// /api/cron/outbox-maintenance et /api/cron/scrim-planning-reminders. GET+POST.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { emitBotEvent } from '@/utils/botEvents';
import { resolveStaffInfo } from '@/utils/taskBoard';
import { logger } from '@/utils/logger';

type Counters = { processed: number; emitted: number };

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/task-due-reminders] CRON_SECRET absent — refus');
    return false;
  }
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${secret}`) return true;
  const q = req.query.secret;
  if (typeof q === 'string' && q === secret) return true;
  return false;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Date calendaire UTC J+`days` au format 'YYYY-MM-DD' (colonne `date`). */
function ymdPlusDays(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
    d.getUTCDate()
  )}`;
}

type TaskRow = {
  id: string;
  tenant_id: string;
  board_id: string;
  column_id: string;
  title: string;
  priority: string;
  assignee_staff_id: string | null;
  due_date: string | null;
};

/**
 * Cœur testable : sélectionne les cartes dues demain (J-1), non supprimées,
 * hors colonne terminale, et émet `task.due_soon` pour chacune.
 */
export async function runTaskDueReminders(): Promise<Counters> {
  const counters: Counters = { processed: 0, emitted: 0 };
  if (!supabaseAdmin) return counters;

  const tomorrow = ymdPlusDays(1);

  // Cartes dont l'échéance tombe demain (rappel J-1), non soft-deletées.
  const { data: taskData, error } = await supabaseAdmin
    .from('tasks')
    .select(
      'id, tenant_id, board_id, column_id, title, priority, assignee_staff_id, due_date'
    )
    .is('deleted_at', null)
    .eq('due_date', tomorrow);
  if (error) {
    logger.error('[cron/task-due-reminders] tasks fetch error', error);
    return counters;
  }
  const tasks = (taskData ?? []) as TaskRow[];
  if (tasks.length === 0) return counters;

  // Charge en un round-trip les colonnes (is_done + name) et les boards (name)
  // référencés par les cartes candidates.
  const columnIds = Array.from(new Set(tasks.map((t) => t.column_id)));
  const boardIds = Array.from(new Set(tasks.map((t) => t.board_id)));
  const [{ data: colData }, { data: boardData }] = await Promise.all([
    supabaseAdmin
      .from('task_columns')
      .select('id, name, is_done')
      .in('id', columnIds),
    supabaseAdmin.from('task_boards').select('id, name').in('id', boardIds),
  ]);
  const columnById = new Map<string, { name: string; is_done: boolean }>();
  for (const c of (colData ?? []) as Array<{
    id: string;
    name: string;
    is_done: boolean;
  }>) {
    columnById.set(c.id, { name: c.name, is_done: c.is_done === true });
  }
  const boardNameById = new Map<string, string>();
  for (const b of (boardData ?? []) as Array<{ id: string; name: string }>) {
    boardNameById.set(b.id, b.name);
  }

  for (const task of tasks) {
    const column = columnById.get(task.column_id);
    // Colonne terminale (« Terminé ») → la carte est faite, pas de rappel.
    if (column?.is_done) continue;
    counters.processed += 1;

    const assignee = await resolveStaffInfo(task.assignee_staff_id ?? null);
    const payload: Record<string, unknown> = {
      taskId: task.id,
      boardName: boardNameById.get(task.board_id) ?? null,
      title: task.title,
      dueDate: task.due_date,
      columnName: column?.name ?? null,
      priority: task.priority,
    };
    if (assignee.staffId) {
      payload.assigneeStaffId = assignee.staffId;
      payload.assigneeName = assignee.name;
      if (assignee.discordUserId)
        payload.assigneeDiscordUserId = assignee.discordUserId;
    }

    try {
      await emitBotEvent('task.due_soon', payload, task.tenant_id);
      counters.emitted += 1;
    } catch (e) {
      logger.error('[cron/task-due-reminders] emit error task=%s', task.id, e);
    }
  }

  return counters;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'POST,GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }
  try {
    const counters = await runTaskDueReminders();
    logger.info(
      '[cron/task-due-reminders] tick processed=%d emitted=%d',
      counters.processed,
      counters.emitted
    );
    return res.status(200).json(counters);
  } catch (err) {
    logger.error('[cron/task-due-reminders] handler error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
