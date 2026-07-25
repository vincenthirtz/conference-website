// utils/taskBoard.ts
//
// Cœur serveur partagé du Kanban interne (staff-only). Ces fonctions sont
// réutilisées à l'identique par les handlers ADMIN (pages/api/admin/tasks/*)
// et BOT (pages/api/bot/v1/tasks/*) : la logique métier (positionnement,
// réordonnancement, audit, émission d'events bot) vit ICI une seule fois.
// Les handlers ne font que auth + validation + appel de core, puis mappent le
// résultat sur un statut HTTP.
//
// Patron : chaque core renvoie soit `{ ok: true, task }` (NormalizedTask prêt
// pour la réponse JSON), soit `{ ok: false, status, error, code? }` que le
// handler renvoie tel quel.
//
// Toutes les requêtes DB passent par `supabaseAdmin` (service_role) car les
// tables task_* sont RLS default-deny (aucune policy). Le scoping tenant_id
// est TOUJOURS appliqué (mono-tenant V1 = DEFAULT_TENANT_ID, mais le code est
// déjà multi-tenant-safe).
//
// Schéma : database/migrations/create_task_board_tables.sql.

import { supabaseAdmin } from './supabase';
import { logStaffAction, type StaffLogAction } from './staffLogs';
import { emitBotEvent } from './botEvents';
import { logger } from './logger';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Provenance de l'action, injectée dans le payload d'audit. */
export type TaskActorVia = 'website' | 'discord_bot';

/**
 * Représentation normalisée d'une carte pour les réponses JSON (admin ET bot).
 * Contrat stable — l'agent UI et l'agent bot s'y réfèrent.
 */
export type NormalizedTask = {
  id: string;
  title: string;
  description: string | null;
  boardId: string;
  boardName: string | null;
  columnId: string;
  columnName: string | null;
  priority: TaskPriority;
  assigneeStaffId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  labels: string[];
};

export type CoreOk = { ok: true; task: NormalizedTask };
export type CoreErr = {
  ok: false;
  status: number;
  error: string;
  code?: string;
};
export type CoreResult = CoreOk | CoreErr;

type TaskRow = {
  id: string;
  tenant_id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  assignee_staff_id: string | null;
  due_date: string | null;
  position: number;
  labels: string[] | null;
  created_by: string | null;
  deleted_at: string | null;
};

type ColumnRow = {
  id: string;
  tenant_id: string;
  board_id: string;
  name: string;
  position: number;
  wip_limit: number | null;
  is_done: boolean;
};

type BoardRow = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  position: number;
  is_archived: boolean;
};

/* ---------------------------------------------------------------------------
 * Colonnes par défaut à la création d'un board
 * ------------------------------------------------------------------------- */

export const DEFAULT_COLUMNS: ReadonlyArray<{
  name: string;
  is_done: boolean;
}> = [
  { name: 'À faire', is_done: false },
  { name: 'En cours', is_done: false },
  { name: 'En revue', is_done: false },
  { name: 'Terminé', is_done: true },
];

/**
 * Crée les 4 colonnes par défaut (positions 0..3) pour un board fraîchement
 * inséré. Best-effort : renvoie les colonnes insérées (peut être vide en cas
 * d'erreur, loggée).
 */
export async function createDefaultColumns(
  tenantId: string,
  boardId: string
): Promise<ColumnRow[]> {
  const rows = DEFAULT_COLUMNS.map((c, idx) => ({
    tenant_id: tenantId,
    board_id: boardId,
    name: c.name,
    position: idx,
    wip_limit: null,
    is_done: c.is_done,
  }));
  const { data, error } = await supabaseAdmin
    .from('task_columns')
    .insert(rows)
    .select('id, tenant_id, board_id, name, position, wip_limit, is_done');
  if (error) {
    logger.error('[taskBoard] createDefaultColumns error', error);
    return [];
  }
  return (data ?? []) as ColumnRow[];
}

/* ---------------------------------------------------------------------------
 * Loaders bas-niveau (tenant-scopés)
 * ------------------------------------------------------------------------- */

async function loadTask(
  tenantId: string,
  taskId: string
): Promise<TaskRow | null> {
  const { data } = await supabaseAdmin
    .from('tasks')
    .select(
      'id, tenant_id, board_id, column_id, title, description, priority, assignee_staff_id, due_date, position, labels, created_by, deleted_at'
    )
    .eq('tenant_id', tenantId)
    .eq('id', taskId)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as TaskRow | null) ?? null;
}

async function loadColumn(
  tenantId: string,
  columnId: string
): Promise<ColumnRow | null> {
  const { data } = await supabaseAdmin
    .from('task_columns')
    .select('id, tenant_id, board_id, name, position, wip_limit, is_done')
    .eq('tenant_id', tenantId)
    .eq('id', columnId)
    .maybeSingle();
  return (data as ColumnRow | null) ?? null;
}

async function loadBoard(
  tenantId: string,
  boardId: string
): Promise<BoardRow | null> {
  const { data } = await supabaseAdmin
    .from('task_boards')
    .select('id, tenant_id, name, description, position, is_archived')
    .eq('tenant_id', tenantId)
    .eq('id', boardId)
    .maybeSingle();
  return (data as BoardRow | null) ?? null;
}

/**
 * Résout l'attribution d'une carte : nom d'affichage du staff + son Discord
 * user id (via staff.auth_user_id → user_discord_links). Utilisé pour enrichir
 * les payloads d'events bot (le bot mentionne l'assigné dans Discord).
 */
export async function resolveStaffInfo(staffId: string | null): Promise<{
  staffId: string | null;
  name: string | null;
  discordUserId: string | null;
}> {
  if (!staffId) return { staffId: null, name: null, discordUserId: null };
  const { data: staff } = await supabaseAdmin
    .from('staff')
    .select('id, display_name, auth_user_id')
    .eq('id', staffId)
    .maybeSingle();
  if (!staff) return { staffId, name: null, discordUserId: null };
  const authUserId = (staff as { auth_user_id: string | null }).auth_user_id;
  let discordUserId: string | null = null;
  if (authUserId) {
    const { data: link } = await supabaseAdmin
      .from('user_discord_links')
      .select('discord_user_id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    discordUserId =
      (link as { discord_user_id: string | null } | null)?.discord_user_id ??
      null;
  }
  return {
    staffId,
    name: (staff as { display_name: string | null }).display_name ?? null,
    discordUserId,
  };
}

/**
 * Résout un Discord user id → staff.id via user_discord_links → staff.
 * Renvoie `null` si le Discord id n'est lié à aucun compte, ou si le compte
 * lié n'est pas un membre du staff. Utilisé par le bot pour `assigneeDiscordUserId`.
 */
export async function resolveStaffIdByDiscord(
  discordUserId: string
): Promise<string | null> {
  const { data: link } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id')
    .eq('discord_user_id', discordUserId)
    .maybeSingle();
  const authUserId = (link as { auth_user_id: string | null } | null)
    ?.auth_user_id;
  if (!authUserId) return null;
  const { data: staff } = await supabaseAdmin
    .from('staff')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  return (staff as { id: string } | null)?.id ?? null;
}

/* ---------------------------------------------------------------------------
 * Helpers internes
 * ------------------------------------------------------------------------- */

function toNormalized(
  row: {
    id: string;
    title: string;
    description: string | null;
    board_id: string;
    column_id: string;
    priority: TaskPriority;
    assignee_staff_id: string | null;
    due_date: string | null;
    labels: string[] | null;
  },
  ctx: {
    boardName: string | null;
    columnName: string | null;
    assigneeName: string | null;
  }
): NormalizedTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    boardId: row.board_id,
    boardName: ctx.boardName,
    columnId: row.column_id,
    columnName: ctx.columnName,
    priority: row.priority,
    assigneeStaffId: row.assignee_staff_id ?? null,
    assigneeName: ctx.assigneeName,
    dueDate: row.due_date ?? null,
    labels: Array.isArray(row.labels) ? row.labels : [],
  };
}

/**
 * Audit best-effort : ne jette jamais (un échec de log ne doit pas casser une
 * mutation réussie). `via` distingue website / discord_bot dans le payload.
 */
async function auditTask(params: {
  tenantId: string;
  actorStaffId: string | null;
  action: StaffLogAction;
  entityType: string;
  entityId: string;
  via: TaskActorVia;
  payload?: Record<string, unknown>;
}): Promise<void> {
  if (!params.actorStaffId) return;
  try {
    await logStaffAction({
      staff_id: params.actorStaffId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      tenant_id: params.tenantId,
      payload: { ...(params.payload ?? {}), via: params.via },
    });
  } catch (e) {
    logger.error('[taskBoard] audit error', e);
  }
}

/** Position max (non-deleted) dans une colonne, ou -1 si vide. */
async function maxPositionInColumn(
  tenantId: string,
  columnId: string
): Promise<number> {
  const { data } = await supabaseAdmin
    .from('tasks')
    .select('position')
    .eq('tenant_id', tenantId)
    .eq('column_id', columnId)
    .is('deleted_at', null);
  const rows = (data ?? []) as { position: number | null }[];
  return rows.reduce(
    (max, r) => Math.max(max, typeof r.position === 'number' ? r.position : 0),
    -1
  );
}

/* ---------------------------------------------------------------------------
 * createTaskCore
 * ------------------------------------------------------------------------- */

export type CreateTaskInput = {
  tenantId: string;
  boardId: string;
  columnId: string;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  assigneeStaffId?: string | null;
  dueDate?: string | null;
  labels?: string[];
  actorStaffId: string | null;
  actorLabel: string;
  via?: TaskActorVia;
};

export async function createTaskCore(
  input: CreateTaskInput
): Promise<CoreResult> {
  const tenantId = input.tenantId;
  const via = input.via ?? 'website';

  const column = await loadColumn(tenantId, input.columnId);
  if (!column) {
    return {
      ok: false,
      status: 404,
      error: 'Colonne introuvable',
      code: 'column_not_found',
    };
  }
  if (column.board_id !== input.boardId) {
    return {
      ok: false,
      status: 400,
      error: "La colonne n'appartient pas à ce board",
      code: 'column_not_in_board',
    };
  }
  const board = await loadBoard(tenantId, input.boardId);
  if (!board) {
    return {
      ok: false,
      status: 404,
      error: 'Board introuvable',
      code: 'board_not_found',
    };
  }

  const position = (await maxPositionInColumn(tenantId, input.columnId)) + 1;

  const insertRow = {
    tenant_id: tenantId,
    board_id: input.boardId,
    column_id: input.columnId,
    title: input.title,
    description: input.description ?? null,
    priority: input.priority ?? 'medium',
    assignee_staff_id: input.assigneeStaffId ?? null,
    due_date: input.dueDate ?? null,
    position,
    labels: input.labels ?? [],
    created_by: input.actorStaffId,
  };

  const { data: inserted, error } = await supabaseAdmin
    .from('tasks')
    .insert(insertRow)
    .select(
      'id, board_id, column_id, title, description, priority, assignee_staff_id, due_date, labels'
    )
    .maybeSingle();
  if (error || !inserted) {
    logger.error('[taskBoard] createTaskCore insert error', error);
    return {
      ok: false,
      status: 500,
      error: 'Échec de la création de la tâche',
    };
  }

  const row = inserted as TaskRow;
  const assignee = await resolveStaffInfo(row.assignee_staff_id ?? null);

  await auditTask({
    tenantId,
    actorStaffId: input.actorStaffId,
    action: 'task_create',
    entityType: 'task',
    entityId: row.id,
    via,
    payload: {
      board_id: input.boardId,
      column_id: input.columnId,
      title: row.title,
      priority: row.priority,
      assignee_staff_id: row.assignee_staff_id ?? null,
    },
  });

  const payload: Record<string, unknown> = {
    taskId: row.id,
    boardId: board.id,
    boardName: board.name,
    columnName: column.name,
    title: row.title,
    priority: row.priority,
    actorLabel: input.actorLabel,
  };
  if (assignee.staffId) {
    payload.assigneeStaffId = assignee.staffId;
    payload.assigneeName = assignee.name;
    if (assignee.discordUserId)
      payload.assigneeDiscordUserId = assignee.discordUserId;
  }
  await emitBotEvent('task.created', payload, tenantId);

  return {
    ok: true,
    task: toNormalized(row, {
      boardName: board.name,
      columnName: column.name,
      assigneeName: assignee.name,
    }),
  };
}

/* ---------------------------------------------------------------------------
 * moveTaskCore
 * ------------------------------------------------------------------------- */

export type MoveTaskInput = {
  tenantId: string;
  taskId: string;
  toColumnId: string;
  toPosition?: number | null;
  actorStaffId: string | null;
  actorLabel: string;
  via?: TaskActorVia;
};

export async function moveTaskCore(input: MoveTaskInput): Promise<CoreResult> {
  const tenantId = input.tenantId;
  const via = input.via ?? 'website';

  const task = await loadTask(tenantId, input.taskId);
  if (!task) {
    return {
      ok: false,
      status: 404,
      error: 'Tâche introuvable',
      code: 'task_not_found',
    };
  }

  const toColumn = await loadColumn(tenantId, input.toColumnId);
  if (!toColumn) {
    return {
      ok: false,
      status: 404,
      error: 'Colonne cible introuvable',
      code: 'column_not_found',
    };
  }
  if (toColumn.board_id !== task.board_id) {
    return {
      ok: false,
      status: 400,
      error: "La colonne cible n'appartient pas au même board",
      code: 'column_not_in_board',
    };
  }

  const board = await loadBoard(tenantId, task.board_id);
  const fromColumn =
    task.column_id === toColumn.id
      ? toColumn
      : await loadColumn(tenantId, task.column_id);

  const sameColumn = task.column_id === toColumn.id;
  const targetPositionRequested =
    typeof input.toPosition === 'number' ? input.toPosition : null;

  // Idempotence : déjà dans la colonne cible, et aucune position (ou la même)
  // demandée → no-op (pas d'event, pas de log).
  if (
    sameColumn &&
    (targetPositionRequested === null ||
      targetPositionRequested === task.position)
  ) {
    const assignee = await resolveStaffInfo(task.assignee_staff_id ?? null);
    return {
      ok: true,
      task: toNormalized(task, {
        boardName: board?.name ?? null,
        columnName: toColumn.name,
        assigneeName: assignee.name,
      }),
    };
  }

  // Charge les cartes vivantes de la colonne cible (hors carte déplacée), triées
  // par position, pour recalculer un ordre dense et déterministe.
  const { data: destData } = await supabaseAdmin
    .from('tasks')
    .select('id, position')
    .eq('tenant_id', tenantId)
    .eq('column_id', input.toColumnId)
    .is('deleted_at', null);
  const dest = ((destData ?? []) as { id: string; position: number | null }[])
    .filter((r) => r.id !== task.id)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((r) => r.id);

  let insertIdx =
    targetPositionRequested === null ? dest.length : targetPositionRequested;
  if (insertIdx < 0) insertIdx = 0;
  if (insertIdx > dest.length) insertIdx = dest.length;
  dest.splice(insertIdx, 0, task.id);

  // Renumérote la colonne cible 0..n-1 ; la carte déplacée reçoit aussi son
  // nouveau column_id.
  for (let i = 0; i < dest.length; i++) {
    const id = dest[i];
    const updates: Record<string, unknown> =
      id === task.id
        ? {
            column_id: input.toColumnId,
            position: i,
            updated_at: new Date().toISOString(),
          }
        : { position: i };
    const { error } = await supabaseAdmin
      .from('tasks')
      .update(updates)
      .eq('tenant_id', tenantId)
      .eq('id', id);
    if (error) {
      logger.error('[taskBoard] moveTaskCore update error', error);
      return { ok: false, status: 500, error: 'Échec du déplacement' };
    }
  }

  const newPosition = dest.indexOf(task.id);
  const movedRow: TaskRow = {
    ...task,
    column_id: input.toColumnId,
    position: newPosition,
  };
  const assignee = await resolveStaffInfo(task.assignee_staff_id ?? null);

  await auditTask({
    tenantId,
    actorStaffId: input.actorStaffId,
    action: 'task_move',
    entityType: 'task',
    entityId: task.id,
    via,
    payload: {
      board_id: task.board_id,
      from_column_id: task.column_id,
      to_column_id: input.toColumnId,
      to_position: newPosition,
    },
  });

  const payload: Record<string, unknown> = {
    taskId: task.id,
    boardName: board?.name ?? null,
    title: task.title,
    fromColumnName: fromColumn?.name ?? null,
    toColumnName: toColumn.name,
    isDone: toColumn.is_done === true,
    actorLabel: input.actorLabel,
  };
  if (assignee.staffId) {
    payload.assigneeName = assignee.name;
    if (assignee.discordUserId)
      payload.assigneeDiscordUserId = assignee.discordUserId;
  }
  await emitBotEvent('task.moved', payload, tenantId);

  return {
    ok: true,
    task: toNormalized(movedRow, {
      boardName: board?.name ?? null,
      columnName: toColumn.name,
      assigneeName: assignee.name,
    }),
  };
}

/* ---------------------------------------------------------------------------
 * assignTaskCore
 * ------------------------------------------------------------------------- */

export type AssignTaskInput = {
  tenantId: string;
  taskId: string;
  /** `null` pour désassigner. */
  assigneeStaffId: string | null;
  actorStaffId: string | null;
  actorLabel: string;
  via?: TaskActorVia;
};

export async function assignTaskCore(
  input: AssignTaskInput
): Promise<CoreResult> {
  const tenantId = input.tenantId;
  const via = input.via ?? 'website';

  const task = await loadTask(tenantId, input.taskId);
  if (!task) {
    return {
      ok: false,
      status: 404,
      error: 'Tâche introuvable',
      code: 'task_not_found',
    };
  }

  // Validation de l'assigné (si non-null) : doit être un membre du staff.
  let assignee = {
    staffId: null as string | null,
    name: null as string | null,
    discordUserId: null as string | null,
  };
  if (input.assigneeStaffId) {
    assignee = await resolveStaffInfo(input.assigneeStaffId);
    if (
      !assignee.staffId ||
      (assignee.name === null && assignee.discordUserId === null)
    ) {
      // resolveStaffInfo renvoie name/discord null si le staff n'existe pas.
      // On revérifie l'existence pour distinguer "staff sans nom" d'un id bidon.
      const { data: exists } = await supabaseAdmin
        .from('staff')
        .select('id')
        .eq('id', input.assigneeStaffId)
        .maybeSingle();
      if (!exists) {
        return {
          ok: false,
          status: 400,
          error: "L'assigné n'est pas un membre du staff",
          code: 'assignee_not_staff',
        };
      }
    }
  }

  const { error } = await supabaseAdmin
    .from('tasks')
    .update({
      assignee_staff_id: input.assigneeStaffId,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', input.taskId);
  if (error) {
    logger.error('[taskBoard] assignTaskCore update error', error);
    return { ok: false, status: 500, error: "Échec de l'assignation" };
  }

  const board = await loadBoard(tenantId, task.board_id);
  const column = await loadColumn(tenantId, task.column_id);

  await auditTask({
    tenantId,
    actorStaffId: input.actorStaffId,
    action: 'task_assign',
    entityType: 'task',
    entityId: task.id,
    via,
    payload: {
      board_id: task.board_id,
      assignee_staff_id: input.assigneeStaffId,
    },
  });

  if (input.assigneeStaffId) {
    const payload: Record<string, unknown> = {
      taskId: task.id,
      boardName: board?.name ?? null,
      title: task.title,
      assigneeStaffId: input.assigneeStaffId,
      assigneeName: assignee.name,
      actorLabel: input.actorLabel,
    };
    if (assignee.discordUserId)
      payload.assigneeDiscordUserId = assignee.discordUserId;
    await emitBotEvent('task.assigned', payload, tenantId);
  }

  const movedRow: TaskRow = {
    ...task,
    assignee_staff_id: input.assigneeStaffId,
  };
  return {
    ok: true,
    task: toNormalized(movedRow, {
      boardName: board?.name ?? null,
      columnName: column?.name ?? null,
      assigneeName: assignee.name,
    }),
  };
}
