// Paramètres de requête de /api/admin/moderation/blacklist/alerts — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: admin.moderation/blacklist/alerts.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';

// Query : tous les champs proviennent de req.query (string|string[]). On valide
// via zod (parse + extraction typée) plutôt qu'avec des guards inline — meilleur
// pour le suivi de taint statique.
export const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  before: z
    .string()
    .trim()
    .refine((s) => Number.isFinite(Date.parse(s)), 'Curseur invalide.')
    .optional(),
  strength: z.enum(['strong', 'soft']).optional(),
  source: z.enum(['bot_scan', 'bot_member_add', 'registration']).optional(),
  discordUserId: z.string().trim().min(1).max(32).optional(),
});
