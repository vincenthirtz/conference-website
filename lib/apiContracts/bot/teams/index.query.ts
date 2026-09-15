// Paramètres de /api/bot/v1/teams (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.teams/index.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';

// GET filtres (tous optionnels, coercition côté handler conservée).
export const listTeamsQuerySchema = z.object({
  limit: z.string().optional(),
  offset: z.string().optional(),
  search: z.string().optional(),
  country: z.string().optional(),
  isActive: z.string().optional(),
  isJoinable: z.string().optional(),
});
