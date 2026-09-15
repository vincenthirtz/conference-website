// Paramètres de requête de /api/player/discovery/head-to-head — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: player.discovery/head-to-head.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';

export const querySchema = z.object({
  opponentId: z.string().uuid(),
});
