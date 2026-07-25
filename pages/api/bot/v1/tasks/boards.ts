// GET /api/bot/v1/tasks/boards
//
// Liste des boards Kanban non archivés (id, name) — pour l'autocomplete de la
// commande /kanban côté bot. L'acteur Discord doit être staff.
//
// Query : ?actorDiscordUserId=
// Auth  : x-api-key (per-tenant) + actorDiscordUserId staff admin/owner.

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotStaff } from '@/utils/botActor';
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

  const { data, error } = await supabaseAdmin
    .from('task_boards')
    .select('id, name, position')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('is_archived', false);
  if (error) {
    logger.error('[bot/tasks/boards] error', error);
    return res.status(500).json({ error: 'Erreur de lecture' });
  }

  const boards = (
    (data ?? []) as { id: string; name: string; position: number | null }[]
  )
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((b) => ({ id: b.id, name: b.name }));

  return res.status(200).json({ boards, count: boards.length });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 40, key: 'bot-tasks-boards' },
});
