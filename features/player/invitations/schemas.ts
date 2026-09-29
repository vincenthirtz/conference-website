// features/player/invitations/schemas.ts — réponse à une invitation d'équipe
// par lien (lot P4). Zod seul : importé par la route en chemin RELATIF (non
// migrée), par le registre OpenAPI (lib/apiContracts) et, demain, le client.

import { z } from 'zod';

/**
 * Corps de POST /api/invitations/{token} (famille « équipe »). Toute valeur
 * autre que `reject` vaut acceptation — comportement historique, d'où
 * `.catch('accept')`.
 */
export const TeamInvitationActionBody = z.object({
  action: z.enum(['accept', 'reject']).catch('accept'),
});
export type TeamInvitationActionInput = z.infer<
  typeof TeamInvitationActionBody
>;
