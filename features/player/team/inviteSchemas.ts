// features/player/team/inviteSchemas.ts — corps des routes de recrutement de
// l'équipe gérée (lot P10) : invitation par e-mail, lien d'équipe, invitation
// d'une joueuse libre. Serveur seulement (catalogue des rôles, bornes des
// liens) : hors de `schemas.ts`, que lib/apiContracts et le client importent.
//
// Validés par le SERVICE, pas déclarés `body` sur la route : ces routes
// répondent à un corps invalide par un message et un `code` à elles
// (`INVALID_BODY`), que le noyau ne sait pas reproduire. Contrat inchangé.

import * as z from 'zod';
import { isValidUUID } from '@/utils/apiHelpers';
import { TEAM_ROLE_VALUES } from '@/utils/teamRoles';
import {
  JOIN_LINK_MAX_TTL_DAYS,
  JOIN_LINK_MIN_TTL_DAYS,
} from '@/utils/teams/inviteLinks';

/** POST /api/teams/invitations. */
export const InviteByEmailBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(TEAM_ROLE_VALUES).default('player'),
  battle_tag: z.string().trim().max(64).optional().nullable(),
  specialty: z.enum(['tank', 'dps', 'support', 'flex']).optional().nullable(),
  /** Inviter comme capitaine (équipe sans capitaine uniquement). */
  set_captain: z.boolean().optional().default(false),
  comment: z.string().trim().max(500).optional().nullable(),
});
export type InviteByEmailInput = z.infer<typeof InviteByEmailBody>;

/** POST /api/teams/invite-links. */
export const InviteLinkBody = z.object({
  /** Rôle attribué à qui entre par ce lien. Figé : il ne se négocie pas après. */
  role: z.enum(TEAM_ROLE_VALUES).default('player'),
  /** Nombre d'entrées autorisées. `null` = illimité jusqu'à expiration. */
  max_uses: z.number().int().min(1).max(50).nullable().optional(),
  ttl_days: z
    .number()
    .int()
    .min(JOIN_LINK_MIN_TTL_DAYS)
    .max(JOIN_LINK_MAX_TTL_DAYS)
    .optional(),
});
export type InviteLinkInput = z.infer<typeof InviteLinkBody>;

// `isValidUUID` (tolérant) plutôt que z.uuid() et son nibble de version strict.
const uuidField = z.string().refine(isValidUUID, { message: 'UUID requis' });

/** POST /api/teams/invite-free-player. Comptes liés uniquement. */
export const InviteFreePlayerBody = z.object({
  teamId: uuidField,
  authUserId: uuidField,
});
export type InviteFreePlayerInput = z.infer<typeof InviteFreePlayerBody>;
