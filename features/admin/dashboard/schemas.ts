// features/admin/dashboard/schemas.ts — entrées des routes du tableau de bord.
// Zod seul : référencé par la spec (lib/apiContracts, `x-zod-query`).

import * as z from 'zod';

/** Même forme que `isValidUUID` (utils/apiHelpers), sans en importer le module. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const AlertsSummaryQuery = z.object({
  tournament_id: z
    .string()
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => v === undefined || UUID_RE.test(v), {
      error: 'Invalid tournament_id',
    })
    .meta({
      description:
        'Tournoi visé ; absent = le tournoi en cours de l’espace du staff.',
    }),
});

/** GET /api/admin/search?q= — texte cherché (2 caractères utiles minimum). */
export const AdminSearchQuery = z.looseObject({
  q: z.unknown().optional(),
});
