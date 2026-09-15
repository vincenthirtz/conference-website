// Paramètres de /api/bot/v1/teams/[teamId]/members (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.teams/[teamId]/members.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

export const kickMemberQuerySchema = z.object({ teamId: uuidSchema });
