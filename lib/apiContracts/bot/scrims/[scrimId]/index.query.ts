// Paramètres de /api/bot/v1/scrims/[scrimId] (query + chemin) — déplacés depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod-query: bot.scrims/[scrimId]/index.query`).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';

// scrimId est un id OU un slug : on ne peut pas le contraindre à un UUID. On
// vérifie juste qu'il est non vide (le handler choisit eq('id') vs eq('slug')).
export const scrimQuerySchema = z.object({
  scrimId: z.string().trim().min(1, 'scrimId requis').max(120),
});
