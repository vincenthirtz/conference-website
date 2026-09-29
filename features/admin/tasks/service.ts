// features/admin/tasks/service.ts — règles du Kanban interne côté admin
// (staff-only), lot L15 (docs/PLAN-industrialisation-admin.md).
//
// À NE PAS CONFONDRE avec le ticketing support (`support_tickets`) : ceci est
// la gestion de tâches interne du staff.
//
// Les gestes partagés avec l'API bot (`/api/bot/v1/tasks/*`) — créer,
// déplacer (garde WIP comprise), assigner, restaurer une carte — vivent dans
// `utils/taskBoard.ts`. Ce service les APPELLE sans les recopier : ils émettent
// eux-mêmes `task.created` / `task.moved` / `task.assigned` et écrivent leur
// journal staff, les routes correspondantes déclarent donc `audit: false`.
//
// Les autres gestes (boards, colonnes, labels, commentaires, checklist, édition
// / suppression de carte) sont propres à l'admin. Ils renvoient l'entrée de
// journal (`audit`) que la route transmet à `ctx.audit` : le wrapper ne
// l'écrit que si le geste a réussi, avec le MÊME slug et le MÊME payload
// qu'avant la migration. `task.board_changed` est émis ici, avant la réponse.

import { AdminError, NotFoundError } from '@/utils/admin/errors';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  assignTaskCore,
  cascadeRenameLabel,
  createDefaultColumns,
  createTaskCore,
  emitBoardChanged,
  loadBoardLabels,
  loadChecklistItems,
  loadTaskComments,
  maxLabelPosition,
  moveTaskCore,
  resolveStaffNames,
  restoreTaskCore,
} from '@/utils/taskBoard';
import type {
  CreateBoardBody,
  CreateChecklistItemBody,
  CreateColumnBody,
  CreateCommentBody,
  CreateLabelBody,
  CreateTaskBody,
  MoveTaskBody,
  PatchBoardBody,
  PatchChecklistItemBody,
  PatchColumnBody,
  PatchLabelBody,
  PatchTaskBody,
  DeletedTasksQuery,
} from '@/utils/taskBoardSchemas';
import { taskBoardError, taskBoardErrorFromCore } from './errors';
import * as repo from './repository';

/** Entrée de journal rendue par un geste ; la route la passe à `ctx.audit`. */
export type TaskAudit = {
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
};

/** Qui agit, pour les cœurs partagés (payload d'audit + events bot). */
export type TaskActor = { staffId: string; label: string };

/** Acteur d'un geste staff ; libellé `Staff` à défaut de nom affiché. */
export function taskActor(staff: {
  id: string;
  display_name?: string | null;
}): TaskActor {
  return { staffId: staff.id, label: staff.display_name ?? 'Staff' };
}

function fail(tag: string, ctx: ServiceContext, err: unknown, message: string) {
  ctx.logger.error(tag, err);
  return new AdminError(500, 'internal', message);
}

/* ================================================================ boards */

export async function listBoards(
  ctx: ServiceContext,
  includeArchived: boolean
) {
  const { rows, error } = await repo.listBoards(
    ctx.db,
    ctx.tenantId,
    includeArchived
  );
  if (error) {
    throw fail(
      '[admin/tasks/boards] list error',
      ctx,
      error,
      'Échec du chargement des boards'
    );
  }
  const boards = [...rows].sort(
    (a, b) =>
      (a.position ?? 0) - (b.position ?? 0) ||
      String(a.created_at).localeCompare(String(b.created_at))
  );

  const boardIds = boards.map((b) => b.id);
  const [cols, tasks] = await Promise.all([
    repo.listColumnsForBoards(ctx.db, ctx.tenantId, boardIds),
    repo.listLiveTaskColumnIds(ctx.db, ctx.tenantId, boardIds),
  ]);

  const countByColumn = new Map<string, number>();
  for (const t of tasks) {
    countByColumn.set(t.column_id, (countByColumn.get(t.column_id) ?? 0) + 1);
  }

  return {
    boards: boards.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description ?? null,
      position: b.position ?? 0,
      isArchived: b.is_archived === true,
      columns: cols
        .filter((c) => c.board_id === b.id)
        .sort((a, c) => (a.position ?? 0) - (c.position ?? 0))
        .map((c) => ({
          id: c.id,
          name: c.name,
          position: c.position ?? 0,
          wipLimit: c.wip_limit ?? null,
          isDone: c.is_done === true,
          cardCount: countByColumn.get(c.id) ?? 0,
        })),
    })),
  };
}

export async function createBoard(
  ctx: ServiceContext,
  actor: TaskActor,
  body: CreateBoardBody
) {
  const { row: board, error } = await repo.insertBoard(ctx.db, ctx.tenantId, {
    name: body.name,
    description: body.description ?? null,
    createdBy: actor.staffId,
  });
  if (error || !board) {
    throw fail(
      '[admin/tasks/boards] create error',
      ctx,
      error,
      'Échec de la création du board'
    );
  }

  const columns = await createDefaultColumns(ctx.tenantId, board.id);

  const audit: TaskAudit = {
    entity_type: 'task_board',
    entity_id: board.id,
    payload: { name: board.name },
  };
  return {
    audit,
    response: {
      board: {
        id: board.id,
        name: board.name,
        description: board.description ?? null,
        position: board.position ?? 0,
        isArchived: board.is_archived === true,
        columns: columns
          .sort((a, b) => a.position - b.position)
          .map((c) => ({
            id: c.id,
            name: c.name,
            position: c.position,
            wipLimit: c.wip_limit ?? null,
            isDone: c.is_done === true,
            cardCount: 0,
          })),
      },
    },
  };
}

export async function getBoardDetail(ctx: ServiceContext, id: string) {
  const { row: board, error } = await repo.getBoard(ctx.db, ctx.tenantId, id);
  if (error) {
    throw fail(
      '[admin/tasks/boards/:id] get error',
      ctx,
      error,
      'Échec du chargement'
    );
  }
  if (!board) throw new NotFoundError('Board introuvable');

  const [cols, tasks] = await Promise.all([
    repo.listColumnsOfBoard(ctx.db, ctx.tenantId, id),
    repo.listLiveTasksOfBoard(ctx.db, ctx.tenantId, id),
  ]);

  // Noms d'assignés en un seul round-trip (même requête que le cœur).
  const nameById = await resolveStaffNames(
    tasks.map((t) => t.assignee_staff_id)
  );

  // Agrégats extras de carte (checklist + commentaires) — un count groupé par
  // task_id sur les cartes du board, pas de N+1. Cartes sans extras → 0/0.
  const taskIds = tasks.map((t) => t.id);
  const checklistByTask = new Map<string, { done: number; total: number }>();
  const commentCountByTask = new Map<string, number>();
  if (taskIds.length) {
    const [checklistRows, commentRows] = await Promise.all([
      repo.listChecklistStateForTasks(ctx.db, ctx.tenantId, taskIds),
      repo.listCommentTaskIds(ctx.db, ctx.tenantId, taskIds),
    ]);
    for (const r of checklistRows) {
      const agg = checklistByTask.get(r.task_id) ?? { done: 0, total: 0 };
      agg.total += 1;
      if (r.is_done === true) agg.done += 1;
      checklistByTask.set(r.task_id, agg);
    }
    for (const r of commentRows) {
      commentCountByTask.set(
        r.task_id,
        (commentCountByTask.get(r.task_id) ?? 0) + 1
      );
    }
  }

  // Définitions de labels colorés du board (triées par position) — l'UI
  // colore les pastilles par jointure applicative sur le nom.
  const labels = await loadBoardLabels(ctx.tenantId, id);

  const columns = [...cols]
    .sort((a, c) => (a.position ?? 0) - (c.position ?? 0))
    .map((c) => ({
      id: c.id,
      name: c.name,
      position: c.position ?? 0,
      wipLimit: c.wip_limit ?? null,
      isDone: c.is_done === true,
      tasks: tasks
        .filter((t) => t.column_id === c.id)
        .sort((x, y) => (x.position ?? 0) - (y.position ?? 0))
        .map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description ?? null,
          priority: t.priority,
          position: t.position ?? 0,
          dueDate: t.due_date ?? null,
          labels: Array.isArray(t.labels) ? t.labels : [],
          assignee: t.assignee_staff_id
            ? {
                staffId: t.assignee_staff_id,
                name: nameById.get(t.assignee_staff_id) ?? null,
              }
            : null,
          checklist: checklistByTask.get(t.id) ?? { done: 0, total: 0 },
          commentCount: commentCountByTask.get(t.id) ?? 0,
        })),
    }));

  return {
    board: {
      id: board.id,
      name: board.name,
      description: board.description ?? null,
      position: board.position ?? 0,
      isArchived: board.is_archived === true,
      labels,
      columns,
    },
  };
}

export async function updateBoard(
  ctx: ServiceContext,
  id: string,
  body: PatchBoardBody
) {
  if (!(await repo.boardExists(ctx.db, ctx.tenantId, id))) {
    throw new NotFoundError('Board introuvable');
  }

  const updates: repo.BoardUpdate = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.position !== undefined) updates.position = body.position;
  if (body.is_archived !== undefined) updates.is_archived = body.is_archived;

  const { row: u, error } = await repo.updateBoard(
    ctx.db,
    ctx.tenantId,
    id,
    updates
  );
  if (error || !u) {
    throw fail(
      '[admin/tasks/boards/:id] patch error',
      ctx,
      error,
      'Échec de la mise à jour'
    );
  }

  await emitBoardChanged(ctx.tenantId, u.id, u.name);

  const audit: TaskAudit = {
    entity_type: 'task_board',
    entity_id: id,
    payload: { fields: Object.keys(body) },
  };
  return {
    audit,
    response: {
      board: {
        id: u.id,
        name: u.name,
        description: u.description ?? null,
        position: u.position ?? 0,
        isArchived: u.is_archived === true,
      },
    },
  };
}

export async function deleteBoard(ctx: ServiceContext, id: string) {
  const existing = await repo.findBoardName(ctx.db, ctx.tenantId, id);
  if (!existing) throw new NotFoundError('Board introuvable');

  const { error } = await repo.deleteBoard(ctx.db, ctx.tenantId, id);
  if (error) {
    throw fail(
      '[admin/tasks/boards/:id] delete error',
      ctx,
      error,
      'Échec de la suppression'
    );
  }

  const audit: TaskAudit = {
    entity_type: 'task_board',
    entity_id: id,
    payload: { name: existing.name },
  };
  return { audit, response: { success: true as const } };
}

/* =============================================================== columns */

function shapeColumn(c: {
  id: string;
  board_id: string;
  name: string;
  position: number | null;
  wip_limit: number | null;
  is_done: boolean;
}) {
  return {
    id: c.id,
    boardId: c.board_id,
    name: c.name,
    position: c.position ?? 0,
    wipLimit: c.wip_limit ?? null,
    isDone: c.is_done === true,
  };
}

export async function createColumn(
  ctx: ServiceContext,
  body: CreateColumnBody
) {
  const { boardId, name, wipLimit, isDone } = body;
  if (!(await repo.boardExists(ctx.db, ctx.tenantId, boardId))) {
    throw new NotFoundError('Board introuvable');
  }

  // position = max+1 parmi les colonnes du board.
  const existingCols = await repo.listColumnPositions(
    ctx.db,
    ctx.tenantId,
    boardId
  );
  const position =
    existingCols.reduce(
      (max, c) =>
        Math.max(max, typeof c.position === 'number' ? c.position : 0),
      -1
    ) + 1;

  const { row: c, error } = await repo.insertColumn(ctx.db, ctx.tenantId, {
    boardId,
    name,
    position,
    wipLimit: wipLimit ?? null,
    isDone: isDone ?? false,
  });
  if (error || !c) {
    throw fail(
      '[admin/tasks/columns] create error',
      ctx,
      error,
      'Échec de la création de la colonne'
    );
  }

  await emitBoardChanged(ctx.tenantId, boardId);

  const audit: TaskAudit = {
    entity_type: 'task_column',
    entity_id: c.id,
    payload: { board_id: boardId, name },
  };
  return { audit, response: { column: shapeColumn(c) } };
}

export async function updateColumn(
  ctx: ServiceContext,
  id: string,
  body: PatchColumnBody
) {
  if (!(await repo.findColumn(ctx.db, ctx.tenantId, id))) {
    throw new NotFoundError('Colonne introuvable');
  }

  const updates: repo.ColumnUpdate = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.wipLimit !== undefined) updates.wip_limit = body.wipLimit;
  if (body.isDone !== undefined) updates.is_done = body.isDone;
  if (body.position !== undefined) updates.position = body.position;

  const { row: c, error } = await repo.updateColumn(
    ctx.db,
    ctx.tenantId,
    id,
    updates
  );
  if (error || !c) {
    throw fail(
      '[admin/tasks/columns/:id] patch error',
      ctx,
      error,
      'Échec de la mise à jour'
    );
  }

  await emitBoardChanged(ctx.tenantId, c.board_id);

  const audit: TaskAudit = {
    entity_type: 'task_column',
    entity_id: id,
    payload: { fields: Object.keys(body) },
  };
  return { audit, response: { column: shapeColumn(c) } };
}

export async function deleteColumn(ctx: ServiceContext, id: string) {
  const existing = await repo.findColumn(ctx.db, ctx.tenantId, id);
  if (!existing) throw new NotFoundError('Colonne introuvable');

  // Refus si des cartes vivantes y sont encore (évite une perte silencieuse
  // via le CASCADE physique). L'admin doit d'abord vider/déplacer la colonne.
  if ((await repo.countLiveTasksInColumn(ctx.db, ctx.tenantId, id)) > 0) {
    throw taskBoardError(
      409,
      'La colonne contient encore des cartes',
      'column_not_empty'
    );
  }

  const { error } = await repo.deleteColumn(ctx.db, ctx.tenantId, id);
  if (error) {
    throw fail(
      '[admin/tasks/columns/:id] delete error',
      ctx,
      error,
      'Échec de la suppression'
    );
  }

  await emitBoardChanged(ctx.tenantId, existing.board_id);

  const audit: TaskAudit = {
    entity_type: 'task_column',
    entity_id: id,
    payload: { name: existing.name },
  };
  return { audit, response: { success: true as const } };
}

/* ================================================================= cards */

type TaskRow = {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string | null;
  priority: string;
  assignee_staff_id: string | null;
  due_date: string | null;
  position: number | null;
  labels: string[] | null;
};

function shapeTask(row: TaskRow, assigneeName: string | null) {
  return {
    id: row.id,
    boardId: row.board_id,
    columnId: row.column_id,
    title: row.title,
    description: row.description ?? null,
    priority: row.priority,
    position: row.position ?? 0,
    dueDate: row.due_date ?? null,
    labels: Array.isArray(row.labels) ? row.labels : [],
    assignee: row.assignee_staff_id
      ? { staffId: row.assignee_staff_id, name: assigneeName }
      : null,
  };
}

async function assigneeName(staffId: string | null): Promise<string | null> {
  if (!staffId) return null;
  return (await resolveStaffNames([staffId])).get(staffId) ?? null;
}

/** Création de carte : `createTaskCore` (position, audit, `task.created`). */
export async function createTask(
  ctx: ServiceContext,
  actor: TaskActor,
  body: CreateTaskBody
) {
  const result = await createTaskCore({
    tenantId: ctx.tenantId,
    boardId: body.boardId,
    columnId: body.columnId,
    title: body.title,
    description: body.description ?? null,
    priority: body.priority,
    assigneeStaffId: body.assigneeStaffId ?? null,
    dueDate: body.dueDate ?? null,
    labels: body.labels,
    actorStaffId: actor.staffId,
    actorLabel: actor.label,
    via: 'website',
  });
  if (!result.ok) throw taskBoardErrorFromCore(result);
  return { task: result.task };
}

export async function getTaskDetail(ctx: ServiceContext, id: string) {
  const { row, error } = await repo.getLiveTask(ctx.db, ctx.tenantId, id);
  if (error) {
    throw fail(
      '[admin/tasks/tasks/:id] get error',
      ctx,
      error,
      'Échec du chargement'
    );
  }
  if (!row) throw new NotFoundError('Tâche introuvable');
  const [name, comments, checklist] = await Promise.all([
    assigneeName(row.assignee_staff_id ?? null),
    loadTaskComments(ctx.tenantId, row.id),
    loadChecklistItems(ctx.tenantId, row.id),
  ]);
  return { task: { ...shapeTask(row, name), comments, checklist } };
}

/** Édition (PAS de move/assign ici — voir moveTask / assignTask). */
export async function updateTask(
  ctx: ServiceContext,
  id: string,
  body: PatchTaskBody
) {
  if (!(await repo.liveTaskExists(ctx.db, ctx.tenantId, id))) {
    throw new NotFoundError('Tâche introuvable');
  }

  const updates: repo.TaskUpdate = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.dueDate !== undefined) updates.due_date = body.dueDate;
  if (body.labels !== undefined) updates.labels = body.labels;

  const { row, error } = await repo.updateTask(
    ctx.db,
    ctx.tenantId,
    id,
    updates
  );
  if (error || !row) {
    throw fail(
      '[admin/tasks/tasks/:id] patch error',
      ctx,
      error,
      'Échec de la mise à jour'
    );
  }

  await emitBoardChanged(ctx.tenantId, row.board_id);
  const name = await assigneeName(row.assignee_staff_id ?? null);

  const audit: TaskAudit = {
    entity_type: 'task',
    entity_id: id,
    payload: { fields: Object.keys(body) },
  };
  return { audit, response: { task: shapeTask(row, name) } };
}

/** Soft-delete : `deleted_at = now()` (la carte part à la corbeille). */
export async function softDeleteTask(ctx: ServiceContext, id: string) {
  const existing = await repo.findLiveTaskForDelete(ctx.db, ctx.tenantId, id);
  if (!existing) throw new NotFoundError('Tâche introuvable');

  const { error } = await repo.softDeleteTask(
    ctx.db,
    ctx.tenantId,
    id,
    new Date().toISOString()
  );
  if (error) {
    throw fail(
      '[admin/tasks/tasks/:id] delete error',
      ctx,
      error,
      'Échec de la suppression'
    );
  }

  await emitBoardChanged(ctx.tenantId, existing.board_id);

  const audit: TaskAudit = {
    entity_type: 'task',
    entity_id: id,
    payload: { title: existing.title },
  };
  return { audit, response: { success: true as const } };
}

/** Déplacement : `moveTaskCore` (garde WIP → 409 `wip_exceeded`, `task.moved`). */
export async function moveTask(
  ctx: ServiceContext,
  actor: TaskActor,
  id: string,
  body: MoveTaskBody
) {
  const result = await moveTaskCore({
    tenantId: ctx.tenantId,
    taskId: id,
    toColumnId: body.columnId,
    toPosition: body.position ?? null,
    actorStaffId: actor.staffId,
    actorLabel: actor.label,
    via: 'website',
  });
  if (!result.ok) throw taskBoardErrorFromCore(result);
  return { task: result.task };
}

/** (Dés)assignation : `assignTaskCore` (`task.assigned` sauf si null). */
export async function assignTask(
  ctx: ServiceContext,
  actor: TaskActor,
  id: string,
  assigneeStaffId: string | null
) {
  const result = await assignTaskCore({
    tenantId: ctx.tenantId,
    taskId: id,
    assigneeStaffId,
    actorStaffId: actor.staffId,
    actorLabel: actor.label,
    via: 'website',
  });
  if (!result.ok) throw taskBoardErrorFromCore(result);
  return { task: result.task };
}

/** Restauration depuis la corbeille : `restoreTaskCore` (pas d'event bot). */
export async function restoreTask(
  ctx: ServiceContext,
  actor: TaskActor,
  id: string
) {
  const result = await restoreTaskCore({
    tenantId: ctx.tenantId,
    taskId: id,
    actorStaffId: actor.staffId,
    via: 'website',
  });
  if (!result.ok) throw taskBoardErrorFromCore(result);
  return { task: result.task };
}

/* ============================================================ corbeille */

const DEFAULT_TRASH_LIMIT = 100;

/**
 * Cartes soft-deleted du tenant, `deleted_at` DESC, plafonnées. On montre
 * TOUT, y compris les cartes d'un board archivé.
 */
export async function listDeletedTasks(
  ctx: ServiceContext,
  query: DeletedTasksQuery
) {
  const limit = query.limit ?? DEFAULT_TRASH_LIMIT;
  const { rows: data, error } = await repo.listDeletedTasks(
    ctx.db,
    ctx.tenantId,
    query.boardId
  );
  if (error) {
    throw fail(
      '[admin/tasks/deleted] list error',
      ctx,
      error,
      'Échec du chargement'
    );
  }

  // Tri deleted_at DESC applicatif puis plafonnement.
  const rows = [...data]
    .sort((a, b) =>
      String(b.deleted_at ?? '').localeCompare(String(a.deleted_at ?? ''))
    )
    .slice(0, limit);

  const boardIds = Array.from(new Set(rows.map((r) => r.board_id)));
  const columnIds = Array.from(new Set(rows.map((r) => r.column_id)));
  const [boardRows, colRows] = await Promise.all([
    boardIds.length
      ? repo.listBoardNames(ctx.db, ctx.tenantId, boardIds)
      : Promise.resolve([]),
    columnIds.length
      ? repo.listColumnNames(ctx.db, ctx.tenantId, columnIds)
      : Promise.resolve([]),
  ]);
  const boardNameById = new Map(boardRows.map((b) => [b.id, b.name]));
  const columnNameById = new Map(colRows.map((c) => [c.id, c.name]));

  return {
    tasks: rows.map((r) => ({
      id: r.id,
      title: r.title,
      boardId: r.board_id,
      boardName: boardNameById.get(r.board_id) ?? null,
      columnId: r.column_id,
      columnName: columnNameById.get(r.column_id) ?? null,
      priority: r.priority,
      dueDate: r.due_date ?? null,
      deletedAt: r.deleted_at ?? null,
    })),
  };
}

/* ========================================================= mes tâches */

// Poids de tri de la priorité (plus grand = plus urgent → placé en premier).
const PRIORITY_WEIGHT: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Cartes vivantes assignées au staff courant, tous boards du tenant.
 * Tri : dueDate asc (sans échéance en dernier), puis priorité décroissante.
 */
export async function listMyTasks(
  ctx: ServiceContext,
  me: { staffId: string; name: string | null }
) {
  const { rows: tasks, error } = await repo.listLiveTasksAssignedTo(
    ctx.db,
    ctx.tenantId,
    me.staffId
  );
  if (error) {
    throw fail(
      '[admin/tasks/my] list error',
      ctx,
      error,
      'Échec du chargement'
    );
  }

  const boardIds = Array.from(new Set(tasks.map((t) => t.board_id)));
  const columnIds = Array.from(new Set(tasks.map((t) => t.column_id)));
  const [boardRows, colRows] = await Promise.all([
    boardIds.length
      ? repo.listBoardNames(ctx.db, ctx.tenantId, boardIds)
      : Promise.resolve([]),
    columnIds.length
      ? repo.listColumnNames(ctx.db, ctx.tenantId, columnIds)
      : Promise.resolve([]),
  ]);
  const boardNameById = new Map(boardRows.map((b) => [b.id, b.name]));
  const columnById = new Map(
    colRows.map((c) => [c.id, { name: c.name, isDone: c.is_done === true }])
  );

  const enriched = tasks.map((t) => {
    const col = columnById.get(t.column_id);
    return {
      id: t.id,
      title: t.title,
      description: t.description ?? null,
      boardId: t.board_id,
      boardName: boardNameById.get(t.board_id) ?? null,
      columnId: t.column_id,
      columnName: col?.name ?? null,
      columnIsDone: col?.isDone ?? false,
      priority: t.priority,
      assigneeStaffId: t.assignee_staff_id ?? null,
      assigneeName: me.name,
      dueDate: t.due_date ?? null,
      labels: Array.isArray(t.labels) ? t.labels : [],
    };
  });

  enriched.sort((a, b) => {
    if (a.dueDate !== b.dueDate) {
      if (a.dueDate === null) return 1;
      if (b.dueDate === null) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    }
    return (
      (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0)
    );
  });

  return { tasks: enriched };
}

/* ============================================================ activité */

/** Actions « commentaire » rattachées à la carte via payload.task_id. */
const COMMENT_ACTIONS = ['task_comment_create', 'task_comment_delete'] as const;

/**
 * Timeline d'une carte, lue dans `staff_logs`, `created_at` DESC. L'UI
 * humanise les libellés ; on renvoie l'action brute et le payload tel quel.
 */
export async function getTaskActivity(ctx: ServiceContext, id: string) {
  if (!(await repo.liveTaskExists(ctx.db, ctx.tenantId, id))) {
    throw new NotFoundError('Tâche introuvable');
  }

  const [taskLogs, commentLogs] = await Promise.all([
    repo.listTaskLogs(ctx.db, ctx.tenantId, id),
    repo.listCommentLogsOfTask(ctx.db, ctx.tenantId, id, COMMENT_ACTIONS),
  ]);
  const rows = [...taskLogs, ...commentLogs];
  if (rows.length === 0) return { activity: [] };

  const names = await resolveStaffNames(rows.map((r) => r.staff_id));

  return {
    activity: rows
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((r) => ({
        action: r.action,
        actorName: r.staff_id ? (names.get(r.staff_id) ?? null) : null,
        createdAt: r.created_at,
        payload: r.payload ?? null,
      })),
  };
}

/* ========================================================= commentaires */

export async function listComments(ctx: ServiceContext, taskId: string) {
  if (!(await repo.liveTaskExists(ctx.db, ctx.tenantId, taskId))) {
    throw new NotFoundError('Tâche introuvable');
  }
  return { comments: await loadTaskComments(ctx.tenantId, taskId) };
}

export async function createComment(
  ctx: ServiceContext,
  actor: TaskActor,
  taskId: string,
  body: CreateCommentBody
) {
  if (!(await repo.liveTaskExists(ctx.db, ctx.tenantId, taskId))) {
    throw new NotFoundError('Tâche introuvable');
  }

  const { row, error } = await repo.insertComment(ctx.db, ctx.tenantId, {
    taskId,
    authorStaffId: actor.staffId,
    body: body.body,
  });
  if (error || !row) {
    throw fail(
      '[admin/tasks/comments] create error',
      ctx,
      error,
      'Échec de la création du commentaire'
    );
  }

  const names = await resolveStaffNames([row.author_staff_id]);

  const audit: TaskAudit = {
    entity_type: 'task_comment',
    entity_id: row.id,
    payload: { task_id: taskId },
  };
  return {
    audit,
    response: {
      comment: {
        id: row.id,
        body: row.body,
        authorStaffId: row.author_staff_id ?? null,
        authorName: row.author_staff_id
          ? (names.get(row.author_staff_id) ?? null)
          : null,
        createdAt: row.created_at,
      },
    },
  };
}

export async function deleteComment(ctx: ServiceContext, id: string) {
  const existing = await repo.findComment(ctx.db, ctx.tenantId, id);
  if (!existing) throw new NotFoundError('Commentaire introuvable');

  const { error } = await repo.deleteComment(ctx.db, ctx.tenantId, id);
  if (error) {
    throw fail(
      '[admin/tasks/comments/:id] delete error',
      ctx,
      error,
      'Échec de la suppression'
    );
  }

  const audit: TaskAudit = {
    entity_type: 'task_comment',
    entity_id: id,
    payload: { task_id: existing.task_id },
  };
  return { audit, response: { success: true as const } };
}

/* ============================================================ checklist */
// Pas de journal : un toggle de checklist est trop verbeux pour staff_logs.

function shapeChecklistItem(row: {
  id: string;
  label: string;
  is_done: boolean;
  position: number | null;
}) {
  return {
    id: row.id,
    label: row.label,
    isDone: row.is_done === true,
    position: row.position ?? 0,
  };
}

export async function listChecklist(ctx: ServiceContext, taskId: string) {
  if (!(await repo.liveTaskExists(ctx.db, ctx.tenantId, taskId))) {
    throw new NotFoundError('Tâche introuvable');
  }
  return { items: await loadChecklistItems(ctx.tenantId, taskId) };
}

export async function createChecklistItem(
  ctx: ServiceContext,
  taskId: string,
  body: CreateChecklistItemBody
) {
  if (!(await repo.liveTaskExists(ctx.db, ctx.tenantId, taskId))) {
    throw new NotFoundError('Tâche introuvable');
  }

  // position = max+1 (0 sur une checklist vide).
  const positions = await repo.listChecklistPositions(
    ctx.db,
    ctx.tenantId,
    taskId
  );
  const position =
    positions.reduce(
      (max, r) =>
        Math.max(max, typeof r.position === 'number' ? r.position : 0),
      -1
    ) + 1;

  const { row, error } = await repo.insertChecklistItem(ctx.db, ctx.tenantId, {
    taskId,
    label: body.label,
    position,
  });
  if (error || !row) {
    throw fail(
      '[admin/tasks/checklist] create error',
      ctx,
      error,
      "Échec de la création de l'item"
    );
  }
  return { item: shapeChecklistItem(row) };
}

export async function updateChecklistItem(
  ctx: ServiceContext,
  id: string,
  body: PatchChecklistItemBody
) {
  if (!(await repo.checklistItemExists(ctx.db, ctx.tenantId, id))) {
    throw new NotFoundError('Item introuvable');
  }

  const updates: repo.ChecklistItemUpdate = {
    updated_at: new Date().toISOString(),
  };
  if (body.label !== undefined) updates.label = body.label;
  if (body.isDone !== undefined) updates.is_done = body.isDone;
  if (body.position !== undefined) updates.position = body.position;

  const { row, error } = await repo.updateChecklistItem(
    ctx.db,
    ctx.tenantId,
    id,
    updates
  );
  if (error || !row) {
    throw fail(
      '[admin/tasks/checklist/:id] patch error',
      ctx,
      error,
      'Échec de la mise à jour'
    );
  }
  return { item: shapeChecklistItem(row) };
}

export async function deleteChecklistItem(ctx: ServiceContext, id: string) {
  if (!(await repo.checklistItemExists(ctx.db, ctx.tenantId, id))) {
    throw new NotFoundError('Item introuvable');
  }
  const { error } = await repo.deleteChecklistItem(ctx.db, ctx.tenantId, id);
  if (error) {
    throw fail(
      '[admin/tasks/checklist/:id] delete error',
      ctx,
      error,
      'Échec de la suppression'
    );
  }
  return { success: true as const };
}

/* =============================================================== labels */
// Le lien carte ↔ label est par NOM (`tasks.labels[]`) ; `task_labels` ne
// porte que la couleur et la position.

export async function createLabel(ctx: ServiceContext, body: CreateLabelBody) {
  const { boardId, name, color } = body;
  if (!(await repo.boardExists(ctx.db, ctx.tenantId, boardId))) {
    throw new NotFoundError('Board introuvable');
  }

  // Unicité applicative (board, name) — double la contrainte DB pour renvoyer
  // un 409 propre plutôt qu'une 500 d'insert en conflit.
  if (await repo.findLabelByName(ctx.db, ctx.tenantId, boardId, name)) {
    throw taskBoardError(409, 'Un label porte déjà ce nom', 'label_exists');
  }

  const position = (await maxLabelPosition(ctx.tenantId, boardId)) + 1;

  const { row, error } = await repo.insertLabel(ctx.db, ctx.tenantId, {
    boardId,
    name,
    color,
    position,
  });
  if (error || !row) {
    throw fail(
      '[admin/tasks/labels] create error',
      ctx,
      error,
      'Échec de la création du label'
    );
  }

  const audit: TaskAudit = {
    entity_type: 'task_label',
    entity_id: row.id,
    payload: { board_id: boardId, name: row.name, color: row.color },
  };
  return {
    audit,
    response: {
      label: {
        id: row.id,
        name: row.name,
        color: row.color,
        position: row.position ?? 0,
      },
    },
  };
}

/**
 * Si `name` change, le renommage est répercuté dans les cartes du board
 * (`tasks.labels[]`) pour garder les pastilles cohérentes.
 */
export async function updateLabel(
  ctx: ServiceContext,
  id: string,
  body: PatchLabelBody
) {
  const existing = await repo.getLabel(ctx.db, ctx.tenantId, id);
  if (!existing) throw new NotFoundError('Label introuvable');

  const renaming = body.name !== undefined && body.name !== existing.name;

  if (renaming) {
    const clash = await repo.findLabelByName(
      ctx.db,
      ctx.tenantId,
      existing.board_id,
      body.name as string
    );
    if (clash && clash.id !== id) {
      throw taskBoardError(409, 'Un label porte déjà ce nom', 'label_exists');
    }
  }

  const updates: repo.LabelUpdate = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.color !== undefined) updates.color = body.color;
  if (body.position !== undefined) updates.position = body.position;

  const { row: u, error } = await repo.updateLabel(
    ctx.db,
    ctx.tenantId,
    id,
    updates
  );
  if (error || !u) {
    throw fail(
      '[admin/tasks/labels/:id] patch error',
      ctx,
      error,
      'Échec de la mise à jour'
    );
  }

  let cascaded = 0;
  if (renaming) {
    cascaded = await cascadeRenameLabel(
      ctx.tenantId,
      existing.board_id,
      existing.name,
      body.name as string
    );
  }

  const audit: TaskAudit = {
    entity_type: 'task_label',
    entity_id: id,
    payload: {
      board_id: existing.board_id,
      fields: Object.keys(body),
      ...(renaming
        ? {
            renamed_from: existing.name,
            renamed_to: body.name,
            cards_updated: cascaded,
          }
        : {}),
    },
  };
  return {
    audit,
    response: {
      label: {
        id: u.id,
        name: u.name,
        color: u.color,
        position: u.position ?? 0,
      },
    },
  };
}

/**
 * Suppression d'une définition. NE retire PAS le nom des cartes : il retombe
 * en couleur neutre côté UI (réversible en recréant le label).
 */
export async function deleteLabel(ctx: ServiceContext, id: string) {
  const existing = await repo.getLabel(ctx.db, ctx.tenantId, id);
  if (!existing) throw new NotFoundError('Label introuvable');

  const { error } = await repo.deleteLabel(ctx.db, ctx.tenantId, id);
  if (error) {
    throw fail(
      '[admin/tasks/labels/:id] delete error',
      ctx,
      error,
      'Échec de la suppression'
    );
  }

  const audit: TaskAudit = {
    entity_type: 'task_label',
    entity_id: id,
    payload: { board_id: existing.board_id, name: existing.name },
  };
  return { audit, response: { success: true as const } };
}
