// Contrat de /api/bot/v1/events/handled — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.events/handled`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { uuidSchema } from '../../../../utils/botValidation';

// eventId : UUID requis (uuidSchema = ancien isValidUUID + trim).
// source : optionnel. Sémantique historique = string acceptée seulement si
// length <= 32, sinon traitée comme `null` (PAS de rejet). On reproduit ça
// avec un transform qui nullifie les valeurs hors borne plutôt que de 400.
export const handledBodySchema = z.object({
  eventId: uuidSchema,
  source: z
    .unknown()
    .transform((v) => (typeof v === 'string' && v.length <= 32 ? v : null))
    .optional(),
});
