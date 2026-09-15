// Paramètres de /api/bot/v1/stages/[stageId]/next-round (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.stages/[stageId]/next-round.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

export const nextRoundQuerySchema = z.object({ stageId: uuidSchema });
