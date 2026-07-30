// pages/api/bot/v1/tasks/index.ts
//
// Kanban interne — endpoints bot (commande /kanban). L'acteur Discord DOIT
// être staff (admin/owner) : requireBotStaff.
//
//   GET  ?boardId=&columnId=&assignee=me&q=&limit=&actorDiscordUserId=
//        → liste de cartes normalisées (id, title, boardName, columnName,
//          priority, assigneeName, dueDate). `assignee=me` filtre sur les
//          cartes assignées au staff correspondant à actorDiscordUserId.
//        Sert /kanban liste + mes-taches + autocomplete de tâche.
//   POST { actorDiscordUserId, boardId, columnId, title, description?,
//          priority?, assigneeStaffId?, dueDate?, labels? } → createTaskCore.
//
// Auth : x-api-key (per-tenant) + actorDiscordUserId staff admin/owner.

import type { NextApiResponse } from 'next';
import type { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotStaff } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { createTaskCore, resolveStaffInfo } from '@/utils/taskBoard';
import { createTaskBodySchema } from '@/utils/taskBoardSchemas';
import { logger } from '@/utils/logger';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

function queryString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  if (req.method === 'POST') return createTask(req, res);
  return listTasks(req, res);
}

async function listTasks(req: BotTenantRequest, res: NextApiResponse) {
  const tenantId = req.botContext.tenantId;
  const actorDiscordUserId = queryString(req.query.actorDiscordUserId);
  const actor = await requireBotStaff(req, res, {
    actorDiscordUserId: actorDiscordUserId ?? '',
  });
  if (!actor) return;

  const boardId = queryString(req.query.boardId);
  const columnId = queryString(req.query.columnId);
  if (boardId && !isValidUUID(boardId))
    return res.status(400).json({ error: 'boardId invalide' });
  if (columnId && !isValidUUID(columnId))
    return res.status(400).json({ error: 'columnId invalide' });

  const assigneeMe = queryString(req.query.assignee) === 'me';
  const q = queryString(req.query.q);
  const rawLimit = Number(req.query.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  let query = supabaseAdmin
    .from('tasks')
    .select(
      'id, board_id, column_id, title, priority, assignee_staff_id, due_date'
    )
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);

  if (boardId) query = query.eq('board_id', boardId);
  if (columnId) query = query.eq('column_id', columnId);
  if (assigneeMe) query = query.eq('assignee_staff_id', actor.staffId);
  if (q) query = query.ilike('title', `%${q}%`);
  query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    logger.error('[bot/tasks] list error', error);
    return res.status(500).json({ error: 'Erreur de lecture' });
  }
  const rows = (data ?? []) as Array<{
    id: string;
    board_id: string;
    column_id: string;
    title: string;
    priority: string;
    assignee_staff_id: string | null;
    due_date: string | null;
  }>;

  // Résolution des noms (boards, colonnes, assignés) via maps — pas d'embed
  // PostgREST pour rester simple et mock-friendly.
  const [{ data: boardsData }, { data: colsData }] = await Promise.all([
    supabaseAdmin
      .from('task_boards')
      .select('id, name')
      .eq('tenant_id', tenantId),
    supabaseAdmin
      .from('task_columns')
      .select('id, name')
      .eq('tenant_id', tenantId),
  ]);
  const boardName = new Map<string, string>();
  for (const b of (boardsData ?? []) as { id: string; name: string }[])
    boardName.set(b.id, b.name);
  const columnName = new Map<string, string>();
  for (const c of (colsData ?? []) as { id: string; name: string }[])
    columnName.set(c.id, c.name);

  const assigneeIds = Array.from(
    new Set(rows.map((r) => r.assignee_staff_id).filter(Boolean))
  ) as string[];
  const assigneeName = new Map<string, string | null>();
  if (assigneeIds.length) {
    const { data: staffRows } = await supabaseAdmin
      .from('staff')
      .select('id, display_name')
      .in('id', assigneeIds);
    for (const s of (staffRows ?? []) as {
      id: string;
      display_name: string | null;
    }[])
      assigneeName.set(s.id, s.display_name ?? null);
  }

  const tasks = rows.map((r) => ({
    id: r.id,
    title: r.title,
    boardId: r.board_id,
    boardName: boardName.get(r.board_id) ?? null,
    columnId: r.column_id,
    columnName: columnName.get(r.column_id) ?? null,
    priority: r.priority,
    assigneeStaffId: r.assignee_staff_id ?? null,
    assigneeName: r.assignee_staff_id
      ? (assigneeName.get(r.assignee_staff_id) ?? null)
      : null,
    dueDate: r.due_date ?? null,
  }));

  return res.status(200).json({ tasks, count: tasks.length });
}

async function createTask(req: BotTenantRequest, res: NextApiResponse) {
  const tenantId = req.botContext.tenantId;
  const actor = await requireBotStaff(
    req,
    res,
    (req.body as Record<string, unknown>) ?? {}
  );
  if (!actor) return;

  // Body déjà validé par le middleware (`bodySchema` ci-dessous) : même forme
  // d'erreur 400 INVALID_BODY + `fields` qu'auparavant, mais la garde est
  // désormais déclarative — comme sur les autres routes bot en écriture.
  const input = req.botInput as z.infer<typeof createTaskBodySchema>;

  const info = await resolveStaffInfo(actor.staffId);
  const result = await createTaskCore({
    tenantId,
    boardId: input.boardId,
    columnId: input.columnId,
    title: input.title,
    description: input.description ?? null,
    priority: input.priority,
    assigneeStaffId: input.assigneeStaffId ?? null,
    dueDate: input.dueDate ?? null,
    labels: input.labels,
    actorStaffId: actor.staffId,
    actorLabel: info.name ?? 'Staff Discord',
    via: 'discord_bot',
  });

  if (!result.ok) {
    return res.status(result.status).json({
      error: result.error,
      ...(result.code ? { code: result.code } : {}),
    });
  }
  return res.status(201).json({ task: result.task });
}

export default withBotRoute(handler, {
  methods: ['GET', 'POST'],
  rateLimit: {
    max: 40,
    key: 'bot-tasks',
    perActor: { max: 20, actorField: 'actorDiscordUserId' },
  },
  // Ne s'applique qu'aux méthodes non-safe : le GET (liste) n'est pas concerné.
  bodySchema: createTaskBodySchema,
});
