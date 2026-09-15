// Paramètres de requête de /api/player/follows — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: player.follows/index.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';

export const listQuerySchema = z.object({
  type: z.enum(['following', 'followers']).default('following'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
