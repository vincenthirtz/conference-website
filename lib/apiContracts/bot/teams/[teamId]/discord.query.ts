// Paramètres de /api/bot/v1/teams/[teamId]/discord (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.teams/[teamId]/discord.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

export const discordQuerySchema = z.object({ teamId: uuidSchema });
