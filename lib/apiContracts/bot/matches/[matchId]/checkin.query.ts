// Paramètres de /api/bot/v1/matches/[matchId]/checkin (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.matches/[matchId]/checkin.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

export const checkinQuerySchema = z.object({ matchId: uuidSchema });
