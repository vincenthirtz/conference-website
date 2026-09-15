// Paramètres de /api/bot/v1/tournaments/[tournamentId]/teams (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.tournaments/[tournamentId]/teams.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

// tournamentId (path param) — partagé GET + POST.
export const teamsQuerySchema = z.object({ tournamentId: uuidSchema });
