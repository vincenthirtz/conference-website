// Paramètres de /api/bot/v1/matches/[matchId]/evidence (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.matches/[matchId]/evidence.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import {
  uuidSchema,
  discordIdSchema,
} from '../../../../../utils/botValidation';

// Query : matchId (path) toujours ; actorDiscordUserId requis cote GET.
export const evidenceQuerySchema = z.object({
  matchId: uuidSchema,
  actorDiscordUserId: discordIdSchema.optional(),
});
