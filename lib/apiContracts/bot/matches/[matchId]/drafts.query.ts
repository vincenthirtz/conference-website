// Paramètres de /api/bot/v1/matches/[matchId]/drafts (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.matches/[matchId]/drafts.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

export const draftsQuerySchema = z.object({ matchId: uuidSchema });
