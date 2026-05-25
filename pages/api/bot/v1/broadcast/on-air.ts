// GET /api/bot/v1/broadcast/on-air
//
// Lot 7 Broadcast Console — bot pull endpoint. Returns the same aggregate
// shape as /api/admin/broadcast/state minus the staff-only metadata, so
// the bot can render the "On-air now" panel in `lives_board_channel_id`
// without depending on a live websocket.
//
// Auth : x-api-key (+ x-tenant-id when using the env key, per the
// canonical bot contract).

import type { NextApiRequest, NextApiResponse } from 'next';
import { withBotRoute } from '@/utils/botAuth';
import { fetchLiveBroadcastState } from '@/utils/broadcast/liveState';
import { logger } from '@/utils/logger';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const tenantId = req.botContext!.tenantId;
    const state = await fetchLiveBroadcastState(tenantId);
    return res.status(200).json(state);
  } catch (err) {
    logger.error('[bot/broadcast/on-air] error', err);
    return res
      .status(500)
      .json({ error: 'Erreur de lecture du broadcast state' });
  }
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 60, key: 'bot-broadcast-on-air' },
});
