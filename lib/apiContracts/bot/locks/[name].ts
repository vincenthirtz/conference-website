// Contrat de /api/bot/v1/locks/[name] — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.locks/[name]`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { boundedString } from '../../../../utils/botValidation';

export const HOLDER_MAX_LEN = 100;

export const lockBodySchema = z.object({
  holder: boundedString(1, HOLDER_MAX_LEN),
  ttlSeconds: z.unknown().optional(),
  action: z.unknown().optional(),
});
