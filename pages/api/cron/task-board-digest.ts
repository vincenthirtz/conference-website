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
//                columns: [{ name, count }],
//                overdueTasks, dueTodayTasks, topTasks }] }.
//
// NOMS DES CARTES — les compteurs seuls ne disent pas *quoi* faire, donc chaque
// board porte aussi des listes nommées (titre, colonne, priorité, échéance,
// assignée), plafonnées à DIGEST_TASKS_PER_LIST par liste :
//   - `overdueTasks`  : les cartes en retard, les plus anciennes d'abord ;
//   - `dueTodayTasks` : les cartes dues aujourd'hui ;
//   - `topTasks`      : filet de sécurité — les cartes actives les plus
//     prioritaires, renseigné UNIQUEMENT quand il n'y a ni retard ni échéance
//     du jour. Sans ça un board sans dates n'afficherait aucun nom, et le récap
//     resterait une colonne de chiffres.
// Chaque liste porte `omitted` (nombre de cartes non listées) : une troncature
// est toujours annoncée, jamais silencieuse.
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
  title: string;
  priority: string | null;
  assignee_staff_id: string | null;
};

/** Nombre max de cartes nommées par liste (retard / du jour / prioritaires). */
export const DIGEST_TASKS_PER_LIST = 5;

/** Ordre décroissant d'urgence, pour trier `topTasks`. */
const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export type DigestColumnCount = { name: string; count: number };
export type DigestTask = {
  taskId: string;
  title: string;
  columnName: string | null;
  priority: string | null;
  dueDate: string | null;
  assigneeName: string | null;
};
/** Liste nommée + nombre de cartes tronquées (jamais de coupe silencieuse). */
export type DigestTaskList = { items: DigestTask[]; omitted: number };
export type DigestBoard = {
  boardId: string;
  boardName: string;
  total: number;
  overdue: number;
  dueToday: number;
  columns: DigestColumnCount[];
  overdueTasks: DigestTaskList;
  dueTodayTasks: DigestTaskList;
  /** Rempli seulement si ni retard ni échéance du jour (voir en-tête). */
  topTasks: DigestTaskList;
};

/**
 * Résout `staff.display_name` pour un lot d'ids, en une requête. Un id absent
 * de la table (staff supprimé) est simplement omis de la map.
 */
async function fetchStaffNames(
  staffIds: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = Array.from(new Set(staffIds));
  if (!supabaseAdmin || unique.length === 0) return names;

  const { data, error } = await supabaseAdmin
    .from('staff')
    .select('id, display_name')
    .in('id', unique);
  if (error) {
    // Non bloquant : le digest part sans les noms d'assignées plutôt que de
    // sauter le tick entier.
    logger.warn('[cron/task-board-digest] staff names fetch: %s', error.message);
    return names;
  }
  for (const row of (data ?? []) as Array<{
    id: string;
    display_name: string | null;
  }>) {
    if (row.display_name) names.set(row.id, row.display_name);
  }
  return names;
}

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
      .select(
        'id, board_id, column_id, due_date, title, priority, assignee_staff_id'
      )
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

  // Noms des assignées : UNE requête pour tous les staff concernés (pas un
  // resolveStaffInfo par carte — le digest balaie tous les boards de tous les
  // tenants). Un nom introuvable reste `null`, la carte est listée sans nom.
  const staffNameById = await fetchStaffNames(
    tasks
      .map((t) => t.assignee_staff_id)
      .filter((id): id is string => Boolean(id))
  );

  const toDigestTask = (t: TaskRow): DigestTask => ({
    taskId: t.id,
    title: t.title,
    columnName: columnById.get(t.column_id)?.name ?? null,
    priority: t.priority ?? null,
    dueDate: t.due_date ?? null,
    assigneeName: t.assignee_staff_id
      ? (staffNameById.get(t.assignee_staff_id) ?? null)
      : null,
  });

  const toList = (rows: TaskRow[]): DigestTaskList => ({
    items: rows.slice(0, DIGEST_TASKS_PER_LIST).map(toDigestTask),
    omitted: Math.max(0, rows.length - DIGEST_TASKS_PER_LIST),
  });

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

    const overdueRows: TaskRow[] = [];
    const dueTodayRows: TaskRow[] = [];
    const activeRows: TaskRow[] = [];
    for (const t of boardTasks) {
      const col = columnById.get(t.column_id);
      // Colonne terminale → la carte est faite, pas de retard/échéance.
      if (col?.is_done) continue;
      activeRows.push(t);
      if (!t.due_date) continue;
      if (t.due_date < today) overdueRows.push(t);
      else if (t.due_date === today) dueTodayRows.push(t);
    }

    // Retards : les plus anciens d'abord (le plus urgent en tête de liste).
    overdueRows.sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));

    const rank = (t: TaskRow) => PRIORITY_RANK[t.priority ?? 'medium'] ?? 2;
    const hasDated = overdueRows.length > 0 || dueTodayRows.length > 0;
    // `topTasks` n'existe que pour éviter un récap 100 % chiffré sur un board
    // sans dates : dès qu'il y a du daté, les listes datées suffisent.
    const topRows = hasDated
      ? []
      : activeRows
          .slice()
          .sort(
            (a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, 'fr')
          );

    const digest: DigestBoard = {
      boardId: board.id,
      boardName: board.name,
      total: boardTasks.length,
      overdue: overdueRows.length,
      dueToday: dueTodayRows.length,
      columns: boardCols.map((c) => ({
        name: c.name,
        count: countByColumn.get(c.id) ?? 0,
      })),
      overdueTasks: toList(overdueRows),
      dueTodayTasks: toList(dueTodayRows),
      topTasks: toList(topRows),
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
