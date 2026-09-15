// Contrat de /api/bot/v1/matches/[matchId]/evidence — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.matches/[matchId]/evidence`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import {
  discordIdSchema,
  boundedString,
  httpUrlSchema,
} from '../../../../../utils/botValidation';

export const noteSchema = boundedString(1, 1000).optional();

// Body POST : union discriminee sur `kind`. discordUserId identifie le
// capitaine (meme champ que report.ts, contrat stable).
export const evidencePostSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('screenshot'),
    discordUserId: discordIdSchema,
    file_base64: z.string().min(1, 'file_base64 requis.'),
    filename: boundedString(1, 255),
    note: noteSchema,
  }),
  z.object({
    kind: z.literal('replay_file'),
    discordUserId: discordIdSchema,
    file_base64: z.string().min(1, 'file_base64 requis.'),
    filename: boundedString(1, 255),
    note: noteSchema,
  }),
  z.object({
    kind: z.literal('replay_url'),
    discordUserId: discordIdSchema,
    external_url: httpUrlSchema,
    note: noteSchema,
  }),
]);
