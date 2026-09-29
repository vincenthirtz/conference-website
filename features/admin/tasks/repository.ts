// features/admin/tasks/repository.ts — accès base du Kanban interne, scopé
// par tenant.
//
// `tenantId` est un paramètre OBLIGATOIRE de chaque fonction : une requête
// non scopée ne peut pas s'écrire par accident. Les lectures de `tasks`
// filtrent `deleted_at IS NULL` sauf la corbeille (qui lit l'inverse).
//
// Ce qui est partagé avec l'API bot (création / déplacement / assignation /
// restauration de carte, labels, commentaires, checklist chargés en détail)
// reste dans `utils/taskBoard.ts` et n'est PAS recopié ici : le service
// l'appelle.
//
// Les listes de colonnes couvrent exactement ce que l'écran lit
// (pages/admin/tasks/index.tsx + features/admin/tasks/hooks/*) — jamais
// `select('*')`.

import type { Database } from '@/types/database.generated';
import type { AdminDb } from '@/utils/admin/serviceContext';

type Tables = Database['public']['Tables'];
export type BoardUpdate = Tables['task_boards']['Update'];
export type ColumnUpdate = Tables['task_columns']['Update'];
export type TaskUpdate = Tables['tasks']['Update'];
export type LabelUpdate = Tables['task_labels']['Update'];
export type ChecklistItemUpdate = Tables['task_checklist_items']['Update'];

const BOARD_COLUMNS = 'id, name, description, position, is_archived' as const;
const BOARD_LIST_COLUMNS =
  'id, name, description, position, is_archived, created_at' as const;
const COLUMN_COLUMNS =
  'id, board_id, name, position, wip_limit, is_done' as const;
const COLUMN_DETAIL_COLUMNS = 'id, name, position, wip_limit, is_done' as const;
const TASK_CARD_COLUMNS =
  'id, column_id, title, description, priority, assignee_staff_id, due_date, position, labels' as const;
const TASK_COLUMNS =
  'id, board_id, column_id, title, description, priority, assignee_staff_id, due_date, position, labels' as const;
const DELETED_TASK_COLUMNS =
  'id, board_id, column_id, title, priority, due_date, deleted_at' as const;
const LABEL_COLUMNS = 'id, board_id, name, color, position' as const;
const LABEL_CREATED_COLUMNS = 'id, name, color, position' as const;
const CHECKLIST_ITEM_COLUMNS = 'id, label, is_done, position' as const;
const COMMENT_CREATED_COLUMNS =
  'id, body, author_staff_id, created_at' as const;
const ACTIVITY_COLUMNS = 'action, staff_id, created_at, payload' as const;

/** Sentinelle d'un `.in()` vide : PostgREST refuse une liste vide. */
const NONE = ['__none__'];

/* ---------------------------------------------------------------- boards */

export async function listBoards(
  db: AdminDb,
  tenantId: string,
  includeArchived: boolean
) {
  let q = db
    .from('task_boards')
    .select(BOARD_LIST_COLUMNS)
    .eq('tenant_id', tenantId);
  if (!includeArchived) q = q.eq('is_archived', false);
  const { data, error } = await q;
  return { rows: data ?? [], error };
}

export async function listColumnsForBoards(
  db: AdminDb,
  tenantId: string,
  boardIds: string[]
) {
  const { data } = await db
    .from('task_columns')
    .select(COLUMN_COLUMNS)
    .eq('tenant_id', tenantId)
    .in('board_id', boardIds.length ? boardIds : NONE);
  return data ?? [];
}

/** Cartes vivantes des boards, réduites à ce qu'il faut pour les compter. */
export async function listLiveTaskColumnIds(
  db: AdminDb,
  tenantId: string,
  boardIds: string[]
) {
  const { data } = await db
    .from('tasks')
    .select('id, board_id, column_id')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .in('board_id', boardIds.length ? boardIds : NONE);
  return data ?? [];
}

export async function getBoard(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('task_boards')
    .select(BOARD_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function findBoardName(db: AdminDb, tenantId: string, id: string) {
  const { data } = await db
    .from('task_boards')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  return data ?? null;
}

export async function boardExists(
  db: AdminDb,
  tenantId: string,
  id: string
): Promise<boolean> {
  const { data } = await db
    .from('task_boards')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  return Boolean(data);
}

export async function insertBoard(
  db: AdminDb,
  tenantId: string,
  input: { name: string; description: string | null; createdBy: string }
) {
  const { data, error } = await db
    .from('task_boards')
    .insert({
      tenant_id: tenantId,
      name: input.name,
      description: input.description,
      position: 0,
      is_archived: false,
      created_by: input.createdBy,
    })
    .select(BOARD_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function updateBoard(
  db: AdminDb,
  tenantId: string,
  id: string,
  updates: BoardUpdate
) {
  const { data, error } = await db
    .from('task_boards')
    .update(updates)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select(BOARD_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function deleteBoard(db: AdminDb, tenantId: string, id: string) {
  const { error } = await db
    .from('task_boards')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', id);
  return { error };
}

/** Noms des boards (corbeille, « mes tâches »). */
export async function listBoardNames(
  db: AdminDb,
  tenantId: string,
  ids: string[]
) {
  const { data } = await db
    .from('task_boards')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .in('id', ids);
  return data ?? [];
}

/* --------------------------------------------------------------- columns */

export async function listColumnsOfBoard(
  db: AdminDb,
  tenantId: string,
  boardId: string
) {
  const { data } = await db
    .from('task_columns')
    .select(COLUMN_DETAIL_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('board_id', boardId);
  return data ?? [];
}

export async function listColumnPositions(
  db: AdminDb,
  tenantId: string,
  boardId: string
) {
  const { data } = await db
    .from('task_columns')
    .select('position')
    .eq('tenant_id', tenantId)
    .eq('board_id', boardId);
  return data ?? [];
}

export async function findColumn(db: AdminDb, tenantId: string, id: string) {
  const { data } = await db
    .from('task_columns')
    .select('id, name, board_id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  return data ?? null;
}

export async function insertColumn(
  db: AdminDb,
  tenantId: string,
  input: {
    boardId: string;
    name: string;
    position: number;
    wipLimit: number | null;
    isDone: boolean;
  }
) {
  const { data, error } = await db
    .from('task_columns')
    .insert({
      tenant_id: tenantId,
      board_id: input.boardId,
      name: input.name,
      position: input.position,
      wip_limit: input.wipLimit,
      is_done: input.isDone,
    })
    .select(COLUMN_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function updateColumn(
  db: AdminDb,
  tenantId: string,
  id: string,
  updates: ColumnUpdate
) {
  const { data, error } = await db
    .from('task_columns')
    .update(updates)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select(COLUMN_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function deleteColumn(db: AdminDb, tenantId: string, id: string) {
  const { error } = await db
    .from('task_columns')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', id);
  return { error };
}

/** Colonnes (nom + terminée ?) pour la corbeille et « mes tâches ». */
export async function listColumnNames(
  db: AdminDb,
  tenantId: string,
  ids: string[]
) {
  const { data } = await db
    .from('task_columns')
    .select('id, name, is_done')
    .eq('tenant_id', tenantId)
    .in('id', ids);
  return data ?? [];
}

/* ----------------------------------------------------------------- tasks */

export async function listLiveTasksOfBoard(
  db: AdminDb,
  tenantId: string,
  boardId: string
) {
  const { data } = await db
    .from('tasks')
    .select(TASK_CARD_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('board_id', boardId)
    .is('deleted_at', null);
  return data ?? [];
}

export async function countLiveTasksInColumn(
  db: AdminDb,
  tenantId: string,
  columnId: string
): Promise<number> {
  const { data } = await db
    .from('tasks')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('column_id', columnId)
    .is('deleted_at', null);
  return (data ?? []).length;
}

export async function getLiveTask(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('tasks')
    .select(TASK_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function liveTaskExists(
  db: AdminDb,
  tenantId: string,
  id: string
): Promise<boolean> {
  const { data } = await db
    .from('tasks')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  return Boolean(data);
}

export async function findLiveTaskForDelete(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data } = await db
    .from('tasks')
    .select('id, title, board_id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  return data ?? null;
}

export async function updateTask(
  db: AdminDb,
  tenantId: string,
  id: string,
  updates: TaskUpdate
) {
  const { data, error } = await db
    .from('tasks')
    .update(updates)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select(TASK_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function softDeleteTask(
  db: AdminDb,
  tenantId: string,
  id: string,
  deletedAt: string
) {
  const { error } = await db
    .from('tasks')
    .update({ deleted_at: deletedAt })
    .eq('tenant_id', tenantId)
    .eq('id', id);
  return { error };
}

export async function listDeletedTasks(
  db: AdminDb,
  tenantId: string,
  boardId: string | undefined
) {
  let q = db
    .from('tasks')
    .select(DELETED_TASK_COLUMNS)
    .eq('tenant_id', tenantId)
    .not('deleted_at', 'is', null);
  if (boardId) q = q.eq('board_id', boardId);
  const { data, error } = await q;
  return { rows: data ?? [], error };
}

export async function listLiveTasksAssignedTo(
  db: AdminDb,
  tenantId: string,
  staffId: string
) {
  const { data, error } = await db
    .from('tasks')
    .select(TASK_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('assignee_staff_id', staffId)
    .is('deleted_at', null);
  return { rows: data ?? [], error };
}

/* ------------------------------------------------- checklist / comments */

export async function listChecklistStateForTasks(
  db: AdminDb,
  tenantId: string,
  taskIds: string[]
) {
  const { data } = await db
    .from('task_checklist_items')
    .select('task_id, is_done')
    .eq('tenant_id', tenantId)
    .in('task_id', taskIds);
  return data ?? [];
}

export async function listCommentTaskIds(
  db: AdminDb,
  tenantId: string,
  taskIds: string[]
) {
  const { data } = await db
    .from('task_comments')
    .select('task_id')
    .eq('tenant_id', tenantId)
    .in('task_id', taskIds);
  return data ?? [];
}

export async function listChecklistPositions(
  db: AdminDb,
  tenantId: string,
  taskId: string
) {
  const { data } = await db
    .from('task_checklist_items')
    .select('position')
    .eq('tenant_id', tenantId)
    .eq('task_id', taskId);
  return data ?? [];
}

export async function insertChecklistItem(
  db: AdminDb,
  tenantId: string,
  input: { taskId: string; label: string; position: number }
) {
  const { data, error } = await db
    .from('task_checklist_items')
    .insert({
      tenant_id: tenantId,
      task_id: input.taskId,
      label: input.label,
      is_done: false,
      position: input.position,
    })
    .select(CHECKLIST_ITEM_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function checklistItemExists(
  db: AdminDb,
  tenantId: string,
  id: string
): Promise<boolean> {
  const { data } = await db
    .from('task_checklist_items')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  return Boolean(data);
}

export async function updateChecklistItem(
  db: AdminDb,
  tenantId: string,
  id: string,
  updates: ChecklistItemUpdate
) {
  const { data, error } = await db
    .from('task_checklist_items')
    .update(updates)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select(CHECKLIST_ITEM_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function deleteChecklistItem(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { error } = await db
    .from('task_checklist_items')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', id);
  return { error };
}

export async function insertComment(
  db: AdminDb,
  tenantId: string,
  input: { taskId: string; authorStaffId: string; body: string }
) {
  const { data, error } = await db
    .from('task_comments')
    .insert({
      tenant_id: tenantId,
      task_id: input.taskId,
      author_staff_id: input.authorStaffId,
      body: input.body,
    })
    .select(COMMENT_CREATED_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function findComment(db: AdminDb, tenantId: string, id: string) {
  const { data } = await db
    .from('task_comments')
    .select('id, task_id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  return data ?? null;
}

export async function deleteComment(db: AdminDb, tenantId: string, id: string) {
  const { error } = await db
    .from('task_comments')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', id);
  return { error };
}

/* ---------------------------------------------------------------- labels */

export async function findLabelByName(
  db: AdminDb,
  tenantId: string,
  boardId: string,
  name: string
) {
  const { data } = await db
    .from('task_labels')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('board_id', boardId)
    .eq('name', name)
    .maybeSingle();
  return data ?? null;
}

export async function insertLabel(
  db: AdminDb,
  tenantId: string,
  input: { boardId: string; name: string; color: string; position: number }
) {
  const { data, error } = await db
    .from('task_labels')
    .insert({
      tenant_id: tenantId,
      board_id: input.boardId,
      name: input.name,
      color: input.color,
      position: input.position,
    })
    .select(LABEL_CREATED_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function getLabel(db: AdminDb, tenantId: string, id: string) {
  const { data } = await db
    .from('task_labels')
    .select(LABEL_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  return data ?? null;
}

export async function updateLabel(
  db: AdminDb,
  tenantId: string,
  id: string,
  updates: LabelUpdate
) {
  const { data, error } = await db
    .from('task_labels')
    .update(updates)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select(LABEL_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function deleteLabel(db: AdminDb, tenantId: string, id: string) {
  const { error } = await db
    .from('task_labels')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', id);
  return { error };
}

/* -------------------------------------------------------------- activity */

/** Actions « carte » : `entity_type='task'`, `entity_id = taskId`. */
export async function listTaskLogs(
  db: AdminDb,
  tenantId: string,
  taskId: string
) {
  const { data } = await db
    .from('staff_logs')
    .select(ACTIVITY_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('entity_type', 'task')
    .eq('entity_id', taskId);
  return data ?? [];
}

/** Actions « commentaire » rattachées à la carte par `payload.task_id`. */
export async function listCommentLogsOfTask(
  db: AdminDb,
  tenantId: string,
  taskId: string,
  actions: readonly string[]
) {
  const { data } = await db
    .from('staff_logs')
    .select(ACTIVITY_COLUMNS)
    .eq('tenant_id', tenantId)
    .in('action', [...actions])
    .filter('payload->>task_id', 'eq', taskId);
  return data ?? [];
}
