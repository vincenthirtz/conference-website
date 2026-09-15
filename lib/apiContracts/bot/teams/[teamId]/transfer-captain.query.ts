// Paramètres de /api/bot/v1/teams/[teamId]/transfer-captain (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.teams/[teamId]/transfer-captain.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../../utils/botValidation';

export const transferCaptainQuerySchema = z.object({ teamId: uuidSchema });
