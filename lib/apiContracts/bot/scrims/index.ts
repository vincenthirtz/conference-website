// Contrat de /api/bot/v1/scrims — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.scrims/index`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import {
  discordIdSchema,
  uuidSchema,
  isoDateSchema,
  gameSlugSchema,
} from '../../../../utils/botValidation';

export const VALID_STATUSES = [
  'draft',
  'scheduled',
  'running',
  'completed',
  'cancelled',
] as const;

export const statusEnum = z.enum(VALID_STATUSES);

// POST body. team1_id/team2_id distincts via .refine (préserve le check inline).
// `slug` reste une string libre bornée (PAS slugSchema) : le handler historique
// n'appliquait aucun regex sur un slug fourni, slugify n'agissant que sur le
// fallback auto-généré. On préserve cette sémantique.
export const scrimCreateBodySchema = z
  .object({
    actorDiscordUserId: discordIdSchema,
    name: z
      .string()
      .transform((s) => s.trim())
      .refine((s) => s.length > 0, "Field 'name' is required")
      .pipe(z.string().max(255)),
    slug: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().max(120))
      .optional(),
    status: statusEnum.optional(),
    team1_id: uuidSchema.nullish(),
    team2_id: uuidSchema.nullish(),
    scheduled_date: isoDateSchema.nullish(),
    game: gameSlugSchema.nullish(),
    is_public: z
      .union([z.boolean(), z.literal('true'), z.literal('false')])
      .optional(),
  })
  .refine((b) => !(b.team1_id && b.team2_id && b.team1_id === b.team2_id), {
    message: 'team1_id et team2_id doivent etre distincts',
    path: ['team2_id'],
  });
