// features/admin/_shared/assignmentSchemas.ts — corps de « Je prends » /
// « Libérer » (POST …/[id]/assign) des files de traitement.
//
// zod seul, imports RELATIFS : schéma référencé par la spec OpenAPI.

import * as z from 'zod';

export const AssignmentBody = z.object({
  action: z.enum(['claim', 'release'], {
    message: "Champ 'action' requis ('claim' ou 'release').",
  }),
});
