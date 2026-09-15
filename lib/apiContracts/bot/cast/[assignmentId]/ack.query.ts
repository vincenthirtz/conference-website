// Paramètres de /api/bot/v1/cast/[assignmentId]/ack (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.cast/[assignmentId]/ack.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

export const ackQuerySchema = z.object({ assignmentId: uuidSchema });
