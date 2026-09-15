// Contrat de /api/bot/v1/tournaments — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.tournaments/index`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import {
  discordIdSchema,
  boundedString,
  slugSchema,
  isoDateSchema,
  gameSlugSchema,
} from '../../../../utils/botValidation';

export const VALID_STATUSES = [
  'draft',
  'published',
  'running',
  'completed',
  'archived',
  'cancelled',
] as const;

// POST body. GET (list) has no body so bodySchema only gates POST.
export const createBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  name: boundedString(1, 255),
  slug: slugSchema.optional(),
  start_date: isoDateSchema.optional(),
  end_date: isoDateSchema.optional(),
  status: z.enum(VALID_STATUSES).optional(),
  max_teams: z.number().int().min(1).optional(),
  game: gameSlugSchema.optional(),
});
