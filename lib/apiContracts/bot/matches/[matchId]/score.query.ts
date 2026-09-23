// Paramètres de /api/bot/v1/matches/[matchId]/score (query + chemin).
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.matches/[matchId]/score.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

export const scoreQuerySchema = z.object({ matchId: uuidSchema });
