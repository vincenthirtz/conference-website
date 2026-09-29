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

/**
 * Corps de POST /api/teams/invitations/by-token (façade historique, lot
 * P11). Validé par le service : l'erreur historique est un message unique
 * (« Action invalide… »), sans `fields`. Action insensible à la casse.
 */
export const TeamInvitationByTokenBody = z.object({
  token: z.string(),
  action: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.enum(['accept', 'reject'])),
});
export type TeamInvitationByTokenInput = z.infer<
  typeof TeamInvitationByTokenBody
>;

/**
 * Corps de POST /api/teams/invite-links/by-token — inscription par lien
 * d'équipe (lot P11). Validé par le service (`INVALID_BODY` historique).
 */
export const JoinLinkBody = z.object({
  token: z.string(),
  /**
   * BattleTag, exigé pour les rôles JOUANTS. Ici la personne le saisit
   * elle-même, puisque personne d'autre ne le connaît.
   */
  battle_tag: z.string().trim().max(64).optional().nullable(),
  specialty: z.enum(['tank', 'dps', 'support', 'flex']).optional().nullable(),
});
export type JoinLinkInput = z.infer<typeof JoinLinkBody>;
