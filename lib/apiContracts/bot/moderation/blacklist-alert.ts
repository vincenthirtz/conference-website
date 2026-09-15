// Contrat de /api/bot/v1/moderation/blacklist-alert — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.moderation/blacklist-alert`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../utils/botValidation';

export const matchedOnSchema = z.enum([
  'battle_tag',
  'display_name',
  'discord_user_id',
]);

export const strengthSchema = z.enum(['strong', 'soft']);

export const blacklistAlertBodySchema = z.object({
  discordUserId: z.string().trim().min(1).max(32),
  battleTag: z.string().trim().max(190).optional().nullable(),
  displayName: z.string().trim().max(190).optional().nullable(),
  matchedOn: matchedOnSchema,
  strength: strengthSchema,
  blacklistEntryId: uuidSchema.optional().nullable(),
  reason: z.string().trim().max(1000).optional().nullable(),
  criteria: z
    .array(z.object({ matchedOn: matchedOnSchema, strength: strengthSchema }))
    .optional()
    .nullable(),
  source: z.enum(['bot_scan', 'bot_member_add']),
  context: z.string().trim().max(190).optional().nullable(),
});
