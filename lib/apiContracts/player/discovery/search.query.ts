// Paramètres de requête de /api/player/discovery/search — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: player.discovery/search.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
