// Paramètres de /api/bot/v1/stages/[stageId]/finalize (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.stages/[stageId]/finalize.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

export const finalizeQuerySchema = z.object({ stageId: uuidSchema });
