// features/player/messages/schemas.ts — messagerie entre capitaines (lot P4).
// Zod seul : importé par la route (chemin RELATIF tant qu'elle n'est pas
// migrée — `@/features/player/` marque une route migrée pour la règle 6 de
// playerBoundariesGuard, la matrice de permissions et les contrats), le
// registre OpenAPI (lib/apiContracts) et, demain, le client.

import { z } from 'zod';

const EMPTY = 'Le message ne peut pas etre vide.';
const TARGET = 'Equipe cible requise.';

/** Corps de POST /api/player/messages — messages historiques, dans l'ordre. */
export const SendMessageBody = z.object({
  content: z
    .string({ error: EMPTY })
    .trim()
    .min(1, EMPTY)
    .max(2000, 'Message trop long (max 2000 caracteres).'),
  targetTeamId: z.string({ error: TARGET }).trim().min(1, TARGET),
});
export type SendMessageInput = z.infer<typeof SendMessageBody>;
