// pages/api/cron/task-board-digest.ts
//
// Scheduled function (Netlify) — digest quotidien des boards Kanban internes.
//
// Pour chaque board NON archivé (tous tenants confondus), calcule :
//   - `total`     : cartes vivantes (deleted_at IS NULL) du board,
//   - `columns`   : [{ name, count }] cartes vivantes par colonne (ordre position),
//   - `overdue`   : cartes en retard (due_date < CURRENT_DATE, colonne non
//                   terminale is_done=false, non supprimées),
//   - `dueToday`  : cartes dues aujourd'hui (due_date = CURRENT_DATE, colonne non
//                   terminale).
// Émet UN event outbox `task.digest` par TENANT (payload agrège tous ses boards) :
//   { boards: [{ boardId, boardName, total, overdue, dueToday,
//                columns: [{ name, count }] }] }.
//
// Auth : `Authorization: Bearer <CRON_SECRET>` header OU `?secret=<CRON_SECRET>`
// query. Même pattern que /api/cron/task-due-reminders. GET + POST.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { emitBotEvent } from '@/utils/botEvents';
import { logger } from '@/utils/logger';

type Counters = { emitted: number; boards: number };

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/task-board-digest] CRON_SECRET absent — refus');
    return false;
  }
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${secret}`) return true;
  const q = req.query.secret;
  if (typeof q === 'string' && q === secret) return true;
  return false;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Date calendaire UTC du jour au format 'YYYY-MM-DD' (colonne `date`). */
function todayYmd(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
    d.getUTCDate()
  )}`;
}

type BoardRow = { id: string; tenant_id: string; name: string };
type ColumnRow = {
  id: string;
  board_id: string;
  name: string;
  position: number | null;
  is_done: boolean;
};
type TaskRow = {
  id: string;
  board_id: string;
  column_id: string;
  due_date: string | null;
};

export type DigestColumnCount = { name: string; count: number };
export type DigestBoard = {
  boardId: string;
  boardName: string;
  total: number;
  overdue: number;
  dueToday: number;
  columns: DigestColumnCount[];
};

/**
 * Cœur testable : agrège les boards par tenant et émet `task.digest`.
 * Renvoie `{ emitted, boards }` (events émis = nombre de tenants ayant au moins
 * un board non archivé ; boards = nombre total de boards traités).
 */
export async function runTaskBoardDigest(): Promise<Counters> {
  const counters: Counters = { emitted: 0, boards: 0 };
  if (!supabaseAdmin) return counters;

  const today = todayYmd();

  const { data: boardData, error } = await supabaseAdmin
    .from('task_boards')
    .select('id, tenant_id, name')
    .eq('is_archived', false);
  if (error) {
    logger.error('[cron/task-board-digest] boards fetch error', error);
    return counters;
  }
  const boards = (boardData ?? []) as BoardRow[];
  if (boards.length === 0) return counters;
  counters.boards = boards.length;

  const boardIds = boards.map((b) => b.id);
  const [{ data: colData }, { data: taskData }] = await Promise.all([
    supabaseAdmin
      .from('task_columns')
      .select('id, board_id, name, position, is_done')
      .in('board_id', boardIds),
    supabaseAdmin
      .from('tasks')
      .select('id, board_id, column_id, due_date')
      .is('deleted_at', null)
      .in('board_id', boardIds),
  ]);

  const columns = (colData ?? []) as ColumnRow[];
  const tasks = (taskData ?? []) as TaskRow[];

  const columnsByBoard = new Map<string, ColumnRow[]>();
  for (const c of columns) {
    const arr = columnsByBoard.get(c.board_id) ?? [];
    arr.push(c);
    columnsByBoard.set(c.board_id, arr);
  }
  const columnById = new Map<string, ColumnRow>();
  for (const c of columns) columnById.set(c.id, c);

  const tasksByBoard = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    const arr = tasksByBoard.get(t.board_id) ?? [];
    arr.push(t);
    tasksByBoard.set(t.board_id, arr);
  }

  // Un board par tenant (préserve l'ordre d'apparition).
  const boardsByTenant = new Map<string, DigestBoard[]>();

  for (const board of boards) {
    const boardCols = (columnsByBoard.get(board.id) ?? [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const boardTasks = tasksByBoard.get(board.id) ?? [];

    const countByColumn = new Map<string, number>();
    for (const t of boardTasks) {
      countByColumn.set(t.column_id, (countByColumn.get(t.column_id) ?? 0) + 1);
    }

    let overdue = 0;
    let dueToday = 0;
    for (const t of boardTasks) {
      if (!t.due_date) continue;
      const col = columnById.get(t.column_id);
      // Colonne terminale → la carte est faite, pas de retard/échéance.
      if (col?.is_done) continue;
      if (t.due_date < today) overdue += 1;
      else if (t.due_date === today) dueToday += 1;
    }

    const digest: DigestBoard = {
      boardId: board.id,
      boardName: board.name,
      total: boardTasks.length,
      overdue,
      dueToday,
      columns: boardCols.map((c) => ({
        name: c.name,
        count: countByColumn.get(c.id) ?? 0,
      })),
    };

    const arr = boardsByTenant.get(board.tenant_id) ?? [];
    arr.push(digest);
    boardsByTenant.set(board.tenant_id, arr);
  }

  for (const [tenantId, boardsForTenant] of boardsByTenant) {
    try {
      await emitBotEvent('task.digest', { boards: boardsForTenant }, tenantId);
      counters.emitted += 1;
    } catch (e) {
      logger.error(
        '[cron/task-board-digest] emit error tenant=%s',
        tenantId,
        e
      );
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
    const counters = await runTaskBoardDigest();
    logger.info(
      '[cron/task-board-digest] tick emitted=%d boards=%d',
      counters.emitted,
      counters.boards
    );
    return res.status(200).json(counters);
  } catch (err) {
    logger.error('[cron/task-board-digest] handler error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
