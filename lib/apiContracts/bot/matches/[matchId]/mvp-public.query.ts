// Paramètres de /api/bot/v1/matches/[matchId]/mvp-public (query + chemin).
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.matches/[matchId]/mvp-public.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

export const mvpPublicQuerySchema = z.object({ matchId: uuidSchema });
