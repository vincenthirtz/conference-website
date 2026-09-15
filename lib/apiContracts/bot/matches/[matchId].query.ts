// Paramètres de /api/bot/v1/matches/[matchId] (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.matches/[matchId].query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../utils/botValidation';

// matchId (path) seulement. Le body PATCH conserve sa validation inline : la
// distinction « clé absente » (champ non touché) vs « clé = null » (efface la
// colonne) repose sur l'opérateur `in`, que zod ne modélise pas proprement avec
// .optional().nullable(). On valide donc uniquement la query ici.
export const metaQuerySchema = z.object({ matchId: uuidSchema });
