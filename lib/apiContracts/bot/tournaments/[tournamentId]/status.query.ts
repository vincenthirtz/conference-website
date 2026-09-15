// Paramètres de /api/bot/v1/tournaments/[tournamentId]/status (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.tournaments/[tournamentId]/status.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

export const statusQuerySchema = z.object({ tournamentId: uuidSchema });
