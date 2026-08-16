// PATCH /api/bot/v1/tasks/[id]/assign
//
// (Dés)assigne une carte du Kanban (commande /kanban assigner). L'acteur
// Discord doit être staff.
//
//   Body : { actorDiscordUserId, assignSelf?:true | assigneeStaffId? |
//            assigneeDiscordUserId? }
//     - assignSelf:true          → assigne à l'acteur.
//     - assigneeDiscordUserId    → résolu → staff.id (400 si non-staff).
//     - assigneeStaffId (uuid)   → assigné direct ; null = désassigner.
//   → assignTaskCore (logue, émet task.assigned si assigné non-null).
//
// Auth  : x-api-key (per-tenant) + actorDiscordUserId staff admin/owner.
// Idempotent : honore l'header Idempotency-Key.

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotStaff } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import {
  assignTaskCore,
  resolveStaffInfo,
  resolveStaffIdByDiscord,
} from '@/utils/taskBoard';

const bodySchema = z.object({
  actorDiscordUserId: z.string(),
  assignSelf: z.boolean().optional(),
  assigneeStaffId: z.string().uuid().nullish(),
  assigneeDiscordUserId: z
    .string()
    .regex(/^[0-9]{15,25}$/)
    .optional(),
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

  // Résolution de l'assigné cible.
  let assigneeStaffId: string | null;
  if (input.assignSelf) {
    assigneeStaffId = actor.staffId;
  } else if (input.assigneeDiscordUserId) {
    const resolved = await resolveStaffIdByDiscord(input.assigneeDiscordUserId);
    if (!resolved) {
      return res.status(400).json({
        error: "Ce compte Discord n'est pas lié à un membre du staff",
        code: 'assignee_not_staff',
      });
    }
    assigneeStaffId = resolved;
  } else if (input.assigneeStaffId !== undefined) {
    // Peut être null (désassignation explicite).
    assigneeStaffId = input.assigneeStaffId;
  } else {
    return res.status(400).json({
      error: 'Fournir assignSelf, assigneeDiscordUserId ou assigneeStaffId',
      code: 'assignee_required',
    });
  }

  const info = await resolveStaffInfo(actor.staffId);
  const result = await assignTaskCore({
    tenantId: req.botContext.tenantId,
    taskId: id,
    assigneeStaffId,
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
  return res.status(200).json({ task: result.task });
}

export default withBotRoute(handler, {
  methods: ['PATCH'],
  rateLimit: {
    max: 40,
    key: 'bot-tasks-assign',
    perActor: { max: 20, actorField: 'actorDiscordUserId' },
  },
  idempotent: true,
  bodySchema,
});
