// Paramètres de requête de /api/admin/twitch/channel-points/redemptions — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: admin.twitch/channel-points/redemptions.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';

export const GetQuerySchema = z.object({
  reward_id: z.string().trim().min(1),
  status: z
    .enum(['UNFULFILLED', 'FULFILLED', 'CANCELED'])
    .optional()
    .default('UNFULFILLED'),
});
