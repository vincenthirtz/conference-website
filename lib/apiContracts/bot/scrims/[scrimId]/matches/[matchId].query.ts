// Paramètres de /api/bot/v1/scrims/[scrimId]/matches/[matchId] (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.scrims/[scrimId]/matches/[matchId].query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../../utils/botValidation';

export const scrimMatchQuerySchema = z.object({
  scrimId: uuidSchema,
  matchId: uuidSchema,
});
