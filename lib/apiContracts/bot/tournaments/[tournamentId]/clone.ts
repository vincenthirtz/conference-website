// Contrat de /api/bot/v1/tournaments/[tournamentId]/clone — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.tournaments/[tournamentId]/clone`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import {
  discordIdSchema,
  boundedString,
  slugSchema,
} from '../../../../../utils/botValidation';

// Tighten the previously-weak (trim-only) validation to match the create
// route's rules : name is a bounded non-empty string, slug must satisfy the
// shared slug grammar before it is slugify-normalised below.
export const cloneBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  name: boundedString(1, 255).optional(),
  slug: slugSchema.optional(),
});
