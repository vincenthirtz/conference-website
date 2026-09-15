// Paramètres de requête de /api/admin/teams/export — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: admin.teams/export.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../utils/botValidation';

/** Un paramètre vide (`?tournamentId=`) vaut « pas de filtre », pas un 400. */
function optionalParam<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
}

export const querySchema = z.object({
  teamId: optionalParam(uuidSchema),
  tournamentId: optionalParam(uuidSchema),
  search: optionalParam(z.string()),
  isActive: optionalParam(z.string()),
  format: optionalParam(z.enum(['csv', 'json'])),
});
