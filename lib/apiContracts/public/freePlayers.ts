// Contrat de POST /api/public/free-players (inscription sans compte).
// Source unique : le handler valide avec ce schéma, et la spec OpenAPI le
// convertit en JSON Schema (`x-zod: public.freePlayerSignup`). Module sans
// effet de bord (zod et constantes seulement) : l'assembleur de spec l'importe.

import { z } from 'zod';
import {
  FREE_PLAYER_LEVELS,
  FREE_PLAYER_LIMITS,
  FREE_PLAYER_ROLES,
} from '../../../utils/freePlayers';
import { antiBotFields } from './antiBot';

export const freePlayerSignupBodySchema = z.object({
  displayName: z.string().trim().min(2).max(FREE_PLAYER_LIMITS.displayName),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(FREE_PLAYER_LIMITS.contactEmail)
    .meta({
      description:
        "Contact privé. N'est JAMAIS renvoyé par le GET de cette route ; seules les capitaines authentifiées y accèdent via /api/teams/free-players.",
    }),
  // Au moins un poste : sans ça la fiche n'aide aucune capitaine à décider.
  roles: z
    .array(z.enum(FREE_PLAYER_ROLES))
    .min(1)
    .max(FREE_PLAYER_ROLES.length),
  level: z.enum(FREE_PLAYER_LEVELS).optional().meta({
    description:
      "Défaut `unknown` — il n'y a aucun rang minimum pour participer.",
  }),
  availability: z
    .string()
    .trim()
    .max(FREE_PLAYER_LIMITS.availability)
    .optional(),
  note: z.string().trim().max(FREE_PLAYER_LIMITS.note).optional(),
  contactDiscord: z
    .string()
    .trim()
    .max(FREE_PLAYER_LIMITS.contactDiscord)
    .optional(),
  // Réseau entre espaces (lot 4). Décision de la JOUEUSE, jamais de l'espace :
  // une annonce déposée sur un site n'a pas été déposée sur tous les autres.
  // Défaut faux — le silence ne vaut pas accord.
  shareAcrossTenants: z.boolean().optional().meta({
    description:
      "Rendre l'annonce lisible depuis les autres espaces volontaires. Défaut : false.",
  }),
  ...antiBotFields,
});
