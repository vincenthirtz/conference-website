// Paramètres de /api/bot/v1/events/[id]/ack (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.events/[id]/ack.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';

// L'`id` dans l'URL est l'integer PK de bot_event_outbox (pas l'event_id UUID).
// req.query.id est une string → z.coerce.number().int().positive() reproduit
// exactement le check historique `Number.isInteger(id) && id > 0`.
// Pas de bodySchema : le body est vide pour cette route (on n'en rejette pas
// l'absence).
export const ackQuerySchema = z.object({
  id: z.coerce.number().int().positive(),
});
