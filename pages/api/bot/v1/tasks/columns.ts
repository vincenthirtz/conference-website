// GET /api/bot/v1/tasks/columns?boardId=
//
// Colonnes (id, name, is_done) d'un board — pour l'autocomplete de colonne de
// la commande /kanban côté bot. L'acteur Discord doit être staff.
//
// Query : ?boardId= (requis) &actorDiscordUserId=
// Auth  : x-api-key (per-tenant) + actorDiscordUserId staff admin/owner.

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotStaff } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

function queryString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const actorDiscordUserId = queryString(req.query.actorDiscordUserId);
  const actor = await requireBotStaff(req, res, {
    actorDiscordUserId: actorDiscordUserId ?? '',
  });
  if (!actor) return;

  const boardId = queryString(req.query.boardId);
  if (!boardId || !isValidUUID(boardId)) {
    return res.status(400).json({ error: 'boardId requis' });
  }

  const { data, error } = await supabaseAdmin
    .from('task_columns')
    .select('id, name, position, is_done')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('board_id', boardId);
  if (error) {
    logger.error('[bot/tasks/columns] error', error);
    return res.status(500).json({ error: 'Erreur de lecture' });
  }

  const columns = (
    (data ?? []) as {
      id: string;
      name: string;
      position: number | null;
      is_done: boolean;
    }[]
  )
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((c) => ({ id: c.id, name: c.name, isDone: c.is_done === true }));

  return res.status(200).json({ columns, count: columns.length });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 40, key: 'bot-tasks-columns' },
});
