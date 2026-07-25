// GET /api/bot/v1/tasks/board-snapshot?boardId=<uuid>
//
// État COMPLET d'un board Kanban pour la vue « live » du bot dans Discord.
//
// Contrairement aux autres endpoints bot /tasks (/tasks, /tasks/columns…), CE
// endpoint N'EXIGE PAS d'acteur staff (`requireBotStaff`) : le rendu live est
// déclenché par un event `task.board_changed` (cf. utils/taskBoard.ts), pas par
// une commande utilisateur. C'est une LECTURE SEULE, scopée au tenant résolu par
// la clé bot (`req.botContext.tenantId`) — aucune donnée d'un autre tenant n'est
// accessible.
//
// Query : ?boardId= (requis, uuid) — validé par withBotRoute({ querySchema }).
// Auth  : x-api-key (per-tenant). Pas d'actorDiscordUserId.
//
// Réponse 200 :
//   { board: { id, name, columns: [
//       { name, isDone, cards: [
//           { title, priority, assigneeName, dueDate, checklist: { done, total } }
//       ] }
//   ] } }
//   - colonnes triées par position ; cartes non supprimées triées par position.
//   - 404 { code:'board_not_found' } si le board n'existe pas dans le tenant.

import type { NextApiResponse } from 'next';
import type { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { resolveStaffNames } from '@/utils/taskBoard';
import { boardSnapshotQuerySchema } from '@/utils/taskBoardSchemas';
import { logger } from '@/utils/logger';

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const tenantId = req.botContext.tenantId;
  const { boardId } = req.botQuery as z.infer<typeof boardSnapshotQuerySchema>;

  // Existence du board dans le tenant (sinon 404). On lit aussi le nom pour la
  // vue live (titre du message Discord).
  const { data: boardRow, error: boardErr } = await supabaseAdmin
    .from('task_boards')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('id', boardId)
    .maybeSingle();
  if (boardErr) {
    logger.error('[bot/tasks/board-snapshot] board error', boardErr);
    return res.status(500).json({ error: 'Erreur de lecture' });
  }
  if (!boardRow) {
    return res.status(404).json({
      error: 'Board introuvable',
      code: 'board_not_found',
    });
  }
  const board = boardRow as { id: string; name: string };

  // Colonnes + cartes vivantes du board, en parallèle (tenant-scopées).
  const [{ data: colsData, error: colsErr }, { data: tasksData, error: tasksErr }] =
    await Promise.all([
      supabaseAdmin
        .from('task_columns')
        .select('id, name, position, is_done')
        .eq('tenant_id', tenantId)
        .eq('board_id', boardId),
      supabaseAdmin
        .from('tasks')
        .select('id, column_id, title, priority, assignee_staff_id, due_date, position')
        .eq('tenant_id', tenantId)
        .eq('board_id', boardId)
        .is('deleted_at', null),
    ]);
  if (colsErr || tasksErr) {
    logger.error('[bot/tasks/board-snapshot] load error', colsErr ?? tasksErr);
    return res.status(500).json({ error: 'Erreur de lecture' });
  }

  const cols = (colsData ?? []) as Array<{
    id: string;
    name: string;
    position: number | null;
    is_done: boolean;
  }>;
  const tasks = (tasksData ?? []) as Array<{
    id: string;
    column_id: string;
    title: string;
    priority: string;
    assignee_staff_id: string | null;
    due_date: string | null;
    position: number | null;
  }>;

  // Noms d'assignés (batch, 1 round-trip) via le helper partagé.
  const nameById = await resolveStaffNames(tasks.map((t) => t.assignee_staff_id));

  // Compteurs de checklist par carte (done/total) — un select groupé, pas de N+1.
  const taskIds = tasks.map((t) => t.id);
  const checklistByTask = new Map<string, { done: number; total: number }>();
  if (taskIds.length) {
    const { data: checklistRows, error: checklistErr } = await supabaseAdmin
      .from('task_checklist_items')
      .select('task_id, is_done')
      .eq('tenant_id', tenantId)
      .in('task_id', taskIds);
    if (checklistErr) {
      logger.error('[bot/tasks/board-snapshot] checklist error', checklistErr);
      return res.status(500).json({ error: 'Erreur de lecture' });
    }
    for (const r of (checklistRows ?? []) as Array<{
      task_id: string;
      is_done: boolean;
    }>) {
      const agg = checklistByTask.get(r.task_id) ?? { done: 0, total: 0 };
      agg.total += 1;
      if (r.is_done === true) agg.done += 1;
      checklistByTask.set(r.task_id, agg);
    }
  }

  const columns = cols
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((c) => ({
      name: c.name,
      isDone: c.is_done === true,
      cards: tasks
        .filter((t) => t.column_id === c.id)
        .sort((x, y) => (x.position ?? 0) - (y.position ?? 0))
        .map((t) => ({
          title: t.title,
          priority: t.priority,
          assigneeName: t.assignee_staff_id
            ? (nameById.get(t.assignee_staff_id) ?? null)
            : null,
          dueDate: t.due_date ?? null,
          checklist: checklistByTask.get(t.id) ?? { done: 0, total: 0 },
        })),
    }));

  return res.status(200).json({
    board: { id: board.id, name: board.name, columns },
  });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 60, key: 'bot-tasks-snapshot', windowMs: 60_000 },
  querySchema: boardSnapshotQuerySchema,
});
