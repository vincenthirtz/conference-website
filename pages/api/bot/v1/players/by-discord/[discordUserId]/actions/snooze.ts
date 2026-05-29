// POST /api/bot/v1/players/by-discord/[discordUserId]/actions/snooze
//
// Le joueur peut snoozer une de ses actions (voir actions-todo) pour qu'elle
// disparaisse temporairement de sa liste /mes-actions. Upsert sur
// player_action_snoozes (PK (tenant_id, discord_user_id, action_key)).
//
// Body : { actorDiscordUserId, actionKey, minutes }
//   - actorDiscordUserId : doit etre egal au :discordUserId du path (un
//                          joueur ne snooze que ses propres actions).
//   - actionKey          : la cle stable retournee par actions-todo
//                          (`<type>:<entity>:<id>[:<variant>]`)
//   - minutes            : 15..1440 (defaut 60)
//
// Idempotent : reappel = update (snoozed_until ecrase, updated_at refresh).

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { discordIdSchema } from '@/utils/botValidation';
import { logger } from '@/utils/logger';

const MIN_MINUTES = 15;
const MAX_MINUTES = 1440;
const DEFAULT_MINUTES = 60;
// actionKey : derive d'IDs DB, on autorise [a-z0-9:-_] avec UUID. Max 200.
const ACTION_KEY_RE = /^[A-Za-z0-9:_\-]{3,200}$/;

const snoozeBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  actionKey: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => ACTION_KEY_RE.test(s), 'actionKey invalide'),
  // minutes : optionnel/null -> défaut 60 ; sinon entier borné 15..1440.
  // z.coerce.number reproduit le Number(body.minutes) historique.
  minutes: z.coerce
    .number()
    .int()
    .min(MIN_MINUTES, {
      message: `minutes doit etre un entier entre ${MIN_MINUTES} et ${MAX_MINUTES}.`,
    })
    .max(MAX_MINUTES, {
      message: `minutes doit etre un entier entre ${MIN_MINUTES} et ${MAX_MINUTES}.`,
    })
    .nullish(),
});
const snoozeQuerySchema = z.object({ discordUserId: discordIdSchema });

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const { discordUserId: pathDiscordUserId } = req.botQuery as z.infer<
    typeof snoozeQuerySchema
  >;
  const {
    actorDiscordUserId,
    actionKey,
    minutes: minutesIn,
  } = req.botInput as z.infer<typeof snoozeBodySchema>;

  if (actorDiscordUserId !== pathDiscordUserId) {
    return res.status(403).json({
      error: 'Tu ne peux snoozer que tes propres actions.',
    });
  }

  const minutes: number = minutesIn ?? DEFAULT_MINUTES;

  const snoozedUntil = new Date(Date.now() + minutes * 60_000).toISOString();
  const updatedAt = new Date().toISOString();

  // Upsert sur PK (tenant_id, discord_user_id, action_key). Pour les
  // onConflict on utilise la PK composite.
  const { error } = await supabaseAdmin.from('player_action_snoozes').upsert(
    {
      tenant_id: req.botContext.tenantId,
      discord_user_id: pathDiscordUserId,
      action_key: actionKey,
      snoozed_until: snoozedUntil,
      updated_at: updatedAt,
    },
    { onConflict: 'tenant_id,discord_user_id,action_key' }
  );
  if (error) {
    logger.error('[bot/player/actions/snooze] upsert error', error);
    return res.status(500).json({ error: 'Erreur de mise en snooze' });
  }

  return res.status(200).json({
    discordUserId: pathDiscordUserId,
    actionKey,
    snoozedUntil,
    minutes,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 30, key: 'actions.snooze' },
  idempotent: true,
  bodySchema: snoozeBodySchema,
  querySchema: snoozeQuerySchema,
});
