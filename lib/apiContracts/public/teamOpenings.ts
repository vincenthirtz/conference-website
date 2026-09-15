// Contrat de POST /api/public/team-openings (annonce d'équipe sans compte).
// Source unique handler ↔ spec (`x-zod: public.teamOpeningSignup`).

import { z } from 'zod';
import {
  TEAM_OPENING_LEVELS,
  TEAM_OPENING_LIMITS,
  TEAM_OPENING_ROLES,
} from '../../../utils/teamOpenings';
import { antiBotFields } from './antiBot';

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(TEAM_OPENING_LIMITS.contactEmail);

export const teamOpeningBodySchema = z
  .object({
    teamName: z.string().trim().min(2).max(TEAM_OPENING_LIMITS.teamName),
    // Le formulaire public envoie `contactEmail` — nommé comme la colonne, et
    // comme le champ « contact Discord » juste à côté. `email` reste accepté :
    // c'est le nom qu'utilise le formulaire des joueuses libres, et un client
    // écrit en le recopiant ne doit pas se faire refuser en silence.
    contactEmail: emailField.optional().meta({
      description:
        "Contact privé. N'est JAMAIS renvoyé par le GET de cette route ; seules les personnes connectées y accèdent via /api/team-openings/contact.",
    }),
    email: emailField.optional().meta({
      description:
        'Alias historique de `contactEmail` (celui de /api/public/free-players).',
    }),
    // Au moins un poste recherché : une annonce « on cherche quelqu'un » sans
    // dire quel poste n'aide aucune joueuse à savoir si elle est concernée.
    roles: z
      .array(z.enum(TEAM_OPENING_ROLES))
      .min(1)
      .max(TEAM_OPENING_ROLES.length)
      .meta({
        description:
          "Postes RECHERCHÉS par l'équipe (sens inverse d'une fiche joueuse).",
      }),
    level: z.enum(TEAM_OPENING_LEVELS).optional().meta({
      description:
        "Niveau de l'ÉQUIPE. Défaut `unknown` — aucun rang minimum requis.",
    }),
    availability: z
      .string()
      .trim()
      .max(TEAM_OPENING_LIMITS.availability)
      .optional(),
    note: z.string().trim().max(TEAM_OPENING_LIMITS.note).optional(),
    contactDiscord: z
      .string()
      .trim()
      .max(TEAM_OPENING_LIMITS.contactDiscord)
      .optional(),
    ...antiBotFields,
  })
  .meta({
    description:
      "`contactEmail` est obligatoire — `email` est accepté comme alias (c'est le nom du champ côté fiches joueuses, et un client écrit en le recopiant ne doit pas être refusé en silence). Fournir l'un des deux.",
  });
