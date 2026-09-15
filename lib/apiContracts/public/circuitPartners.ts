// Contrat de POST /api/circuit-partners/apply — candidature d'un circuit
// féminin ou mixte à l'offre partenaire. Source unique handler ↔ spec
// (`x-zod: public.circuitPartnerApplication`).
// Module sans effet de bord : zod et modules purs, chemins relatifs.

import { z } from 'zod';
import { antiBotFields } from './antiBot';

// Vide accepté (champ laissé blanc) : le handler le range en NULL. Pas de
// `transform` ici — l'assembleur OpenAPI refuse un schéma non représentable.
const optionalUrl = z
  .union([z.string().trim().max(500).url(), z.literal('')])
  .optional();

export const circuitPartnerApplicationBodySchema = z
  .object({
    organizationName: z.string().trim().min(2).max(200),
    contactName: z.string().trim().min(2).max(200),
    email: z.string().trim().toLowerCase().email().max(320),
    game: z.string().trim().min(1).max(50).meta({
      description:
        'Slug du registre `config/games` (ex. `valorant`, `lol`). Un slug inconnu est refusé.',
    }),
    format: z.enum(['feminin', 'mixte']),
    seasonStart: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .meta({ description: 'Début de saison prévu (AAAA-MM-JJ).' }),
    expectedTeams: z.number().int().min(2).max(512).optional(),
    website: optionalUrl,
    communityUrl: optionalUrl.meta({
      description: 'Discord, Twitch ou réseau social du circuit.',
    }),
    existingSpaceSlug: z
      .string()
      .trim()
      .max(100)
      .regex(/^[a-z0-9-]*$/)
      .optional()
      .meta({ description: 'Slug de l’espace déjà créé sur la plateforme.' }),
    message: z.string().trim().min(20).max(3000),
    commitsCodeOfConduct: z.literal(true).meta({
      description: 'Engagement à publier une charte et un canal de signalement.',
    }),
    commitsSafetyLead: z.literal(true).meta({
      description: 'Engagement à nommer une personne référente sécurité.',
    }),
    ...antiBotFields,
  })
  .strict();

export type CircuitPartnerApplicationBody = z.infer<
  typeof circuitPartnerApplicationBodySchema
>;
