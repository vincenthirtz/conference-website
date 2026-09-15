// Paramètres de /api/bot/v1/matches/[matchId]/forfeit (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.matches/[matchId]/forfeit.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

export const forfeitQuerySchema = z.object({ matchId: uuidSchema });
