// Paramètres de /api/bot/v1/teams/[teamId]/invitations (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.teams/[teamId]/invitations.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

// querySchema (GET + POST) : teamId UUID requis. Les filtres GET (status/type/
// limit) gardent leur parsing inline dans handleList pour préserver le message
// d'erreur custom sur status et les valeurs par défaut.
export const invitationsQuerySchema = z.object({
  teamId: uuidSchema,
  status: z.string().optional(),
  type: z.string().optional(),
  limit: z.string().optional(),
});
