// Contrat de /api/bot/v1/teams/[teamId]/discord — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.teams/[teamId]/discord`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { discordIdSchema } from '../../../../../utils/botValidation';

// Body : actorDiscordUserId (lu par requireBotStaff sur le body brut) + les 3
// snowflakes Discord. nullable() = passer null pour clearer un champ ;
// optional() = champ absent -> no-op. discordIdSchema applique le même
// regex/trim que l'ex-DISCORD_SNOWFLAKE_RE inline.
export const discordWritebackBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  discordRoleId: discordIdSchema.nullable().optional(),
  discordChannelId: discordIdSchema.nullable().optional(),
  discordVoiceChannelId: discordIdSchema.nullable().optional(),
});
