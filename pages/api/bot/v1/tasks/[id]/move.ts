// PATCH /api/bot/v1/tasks/[id]/move
//
// Déplace une carte du Kanban (commande /kanban deplacer). L'acteur Discord
// doit être staff.
//
//   Body : { actorDiscordUserId, columnId, position? }
//   → moveTaskCore (vérifie même board, réordonne, logue, émet task.moved).
//
// Auth  : x-api-key (per-tenant) + actorDiscordUserId staff admin/owner.
// Idempotent : honore l'header Idempotency-Key (retry bot sans double move).

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotStaff } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { moveTaskCore, resolveStaffInfo } from '@/utils/taskBoard';

const bodySchema = z.object({
  actorDiscordUserId: z.string(),
  columnId: z.string().uuid(),
  position: z.number().int().min(0).optional(),
});

function taskIdFromQuery(v: unknown): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && isValidUUID(s) ? s : null;
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const actor = await requireBotStaff(
    req,
    res,
    (req.body as Record<string, unknown>) ?? {}
  );
  if (!actor) return;

  const id = taskIdFromQuery(req.query.id);
  if (!id) return res.status(400).json({ error: 'Task id invalide' });

  const input = req.botInput as z.infer<typeof bodySchema>;
  const info = await resolveStaffInfo(actor.staffId);

  const result = await moveTaskCore({
    tenantId: req.botContext.tenantId,
    taskId: id,
    toColumnId: input.columnId,
    toPosition: input.position ?? null,
    actorStaffId: actor.staffId,
    actorLabel: info.name ?? 'Staff Discord',
    via: 'discord_bot',
  });

  if (!result.ok) {
    return res.status(result.status).json({
      error: result.error,
      ...(result.code ? { code: result.code } : {}),
      ...(result.code === 'wip_exceeded'
        ? { limit: result.limit, current: result.current }
        : {}),
    });
  }
  return res.status(200).json({ task: result.task });
}

export default withBotRoute(handler, {
  methods: ['PATCH'],
  rateLimit: {
    max: 40,
    key: 'bot-tasks-move',
    perActor: { max: 20, actorField: 'actorDiscordUserId' },
  },
  idempotent: true,
  bodySchema,
});
