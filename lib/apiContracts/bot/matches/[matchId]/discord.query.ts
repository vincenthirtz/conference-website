// Paramètres de /api/bot/v1/matches/[matchId]/discord (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.matches/[matchId]/discord.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

// matchId (path) seulement. Le body PATCH garde sa validation inline : la
// distinction « clé absente » (champ non touché) vs « clé = null » (efface la
// colonne) repose sur `key in body` via readSnowflake(), non modélisable
// proprement en zod avec .optional().nullable().
export const discordQuerySchema = z.object({ matchId: uuidSchema });
