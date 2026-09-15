// Paramètres de /api/bot/v1/players/by-discord/[discordUserId]/actions/snooze (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.players/by-discord/[discordUserId]/actions/snooze.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { discordIdSchema } from '../../../../../../../utils/botValidation';

export const snoozeQuerySchema = z.object({ discordUserId: discordIdSchema });
