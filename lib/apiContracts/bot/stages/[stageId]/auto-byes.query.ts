// Paramètres de /api/bot/v1/stages/[stageId]/auto-byes (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.stages/[stageId]/auto-byes.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

export const autoByesQuerySchema = z.object({ stageId: uuidSchema });
