// Briques communes des réponses de l'API publique v1.

import { z } from 'zod';

/** Chaîne ou null (colonnes facultatives exposées telles quelles). */
export const nullableString = z.string().nullable();
export const nullableInt = z.number().int().nullable();

export const publicV1PaginationSchema = z
  .object({
    limit: z.number().int(),
    offset: z.number().int(),
    count: z.number().int().meta({
      description:
        "Nombre total d'éléments avant pagination (tournois) ou nombre d'éléments retournés dans la page (leaderboard).",
    }),
  })
  .meta({ id: 'PublicV1Pagination' });
