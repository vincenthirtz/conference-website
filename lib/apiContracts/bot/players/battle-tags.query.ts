// Paramètres de /api/bot/v1/players/battle-tags (query).
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.players/battle-tags.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import * as z from 'zod';
import { discordIdSchema } from '../../../../utils/botValidation';

export const battleTagsQuerySchema = z.object({
  /** `nextCursor` de la page précédente (exclusif). Absent = première page. */
  cursor: discordIdSchema.optional(),
  /** Taille de page, 1 à 9999 en entrée ; plafonnée côté handler. */
  limit: z
    .string()
    .regex(/^[1-9][0-9]{0,3}$/, 'limit doit être un entier positif.')
    .optional(),
});
