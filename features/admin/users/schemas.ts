// features/admin/users/schemas.ts — entrées des routes staff sur les comptes.
// Zod seul : référencé par la spec (lib/apiContracts, `x-zod-query`).

import { z } from 'zod';

export const UserSearchQuery = z.object({
  q: z
    .string({ error: 'Query must be at least 2 characters' })
    .trim()
    .min(2, { error: 'Query must be at least 2 characters' })
    .max(100, { error: 'Query too long (max 100 characters)' })
    .meta({ description: 'Email, pseudo ou BattleTag (2 à 100 caractères).' }),
});
