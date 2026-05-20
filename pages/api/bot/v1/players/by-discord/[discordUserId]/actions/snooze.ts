// POST /api/bot/v1/players/by-discord/[discordUserId]/actions/snooze
//
// Le joueur peut snoozer une de ses actions (voir actions-todo) pour qu'elle
// disparaisse temporairement de sa liste /mes-actions. Upsert sur
// player_action_snoozes (PK (discord_user_id, action_key)).
//
// Body : { actorDiscordUserId, actionKey, minutes }
//   - actorDiscordUserId : doit etre egal au :discordUserId du path (un
//                          joueur ne snooze que ses propres actions).
//   - actionKey          : la cle stable retournee par actions-todo
//                          (`<type>:<entity>:<id>[:<variant>]`)
//   - minutes            : 15..1440 (defaut 60)
//
// Idempotent : reappel = update (snoozed_until ecrase, updated_at refresh).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { logger } from '@/utils/logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;
const MIN_MINUTES = 15;
const MAX_MINUTES = 1440;
const DEFAULT_MINUTES = 60;
// actionKey : derive d'IDs DB, on autorise [a-z0-9:-_] avec UUID. Max 200.
const ACTION_KEY_RE = /^[A-Za-z0-9:_\-]{3,200}$/;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.discordUserId;
  const pathDiscordUserId = Array.isArray(raw) ? raw[0] : raw;
  if (!pathDiscordUserId || !DISCORD_ID_RE.test(pathDiscordUserId)) {
    return res.status(400).json({ error: 'discordUserId invalide' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const actorDiscordUserId =
    typeof body.actorDiscordUserId === 'string'
      ? body.actorDiscordUserId.trim()
      : '';
  if (!DISCORD_ID_RE.test(actorDiscordUserId)) {
    return res.status(400).json({ error: 'actorDiscordUserId invalide' });
  }
  if (actorDiscordUserId !== pathDiscordUserId) {
    return res.status(403).json({
      error: "Tu ne peux snoozer que tes propres actions.",
    });
  }

  const actionKey =
    typeof body.actionKey === 'string' ? body.actionKey.trim() : '';
  if (!ACTION_KEY_RE.test(actionKey)) {
    return res.status(400).json({ error: 'actionKey invalide' });
  }

  let minutes: number = DEFAULT_MINUTES;
  if (body.minutes !== undefined && body.minutes !== null) {
    const n = Number(body.minutes);
    if (!Number.isInteger(n) || n < MIN_MINUTES || n > MAX_MINUTES) {
      return res.status(400).json({
        error: `minutes doit etre un entier entre ${MIN_MINUTES} et ${MAX_MINUTES}.`,
      });
    }
    minutes = n;
  }

  const snoozedUntil = new Date(Date.now() + minutes * 60_000).toISOString();
  const updatedAt = new Date().toISOString();

  // Upsert sur PK (discord_user_id, action_key). Pour les onConflict on
  // utilise la PK composite.
  const { error } = await supabaseAdmin
    .from('player_action_snoozes')
    .upsert(
      {
        discord_user_id: pathDiscordUserId,
        action_key: actionKey,
        snoozed_until: snoozedUntil,
        updated_at: updatedAt,
      },
      { onConflict: 'discord_user_id,action_key' }
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
});
