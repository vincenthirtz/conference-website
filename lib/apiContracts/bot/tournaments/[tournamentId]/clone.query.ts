// Paramètres de /api/bot/v1/tournaments/[tournamentId]/clone (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.tournaments/[tournamentId]/clone.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

export const cloneQuerySchema = z.object({ tournamentId: uuidSchema });
